/**
 * compare-chat-agent.ts
 *
 * Answers follow-up questions about a comparison using the existing
 * CompareSessionData as its working context.
 *
 * Design principles:
 *   - Never re-runs any pipeline step.
 *   - Retrieves only the artifacts relevant to the question (smart context selection).
 *   - Returns a plain markdown string, identical to how other agents respond.
 *   - Stateless: receives the full session data on every call. The session store
 *     sits outside this class — swapping the store for DB-backed lookup requires
 *     no changes here.
 *
 * Retrieval strategy (deterministic topic detection, no embeddings):
 *   Intent signals in the user message are matched against a keyword map.
 *   Each intent loads a specific slice of the compare context instead of sending
 *   the entire CompareState to the LLM.
 *
 * Examples:
 *   "explain the liability clause"   → matching risk findings + differences for 'liability'
 *   "which agreement is more favorable" → executive summary + overall risk
 *   "show payment changes"           → payment-scoped differences + risk findings
 *   "draft a safer version of the indemnity clause" → raw clause text A + B
 */

import {
  executeCompletion,
} from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import type { CompareSessionData } from "../session/compare-session-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompareChatRequest {
  session: CompareSessionData;
  question: string;
  history: ChatTurn[];
}

// ─── Intent detection ─────────────────────────────────────────────────────────

type Intent =
  | "overall_assessment"
  | "clause_specific"
  | "drafting"
  | "negotiation"
  | "risk_summary"
  | "differences_summary"
  | "general";

/**
 * Topic keywords extracted from the question, used to filter clause-level
 * artifacts before passing them to the LLM.
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  liability: ["liability", "liable", "cap", "limitation", "damages"],
  indemnity: ["indemnity", "indemnification", "indemnify", "hold harmless"],
  ip: ["intellectual property", "ip", "ownership", "copyright", "patent", "trademark"],
  termination: ["terminat", "cancel", "exit", "notice period", "end of contract"],
  data_protection: ["data protection", "gdpr", "privacy", "personal data", "dpa"],
  payment: ["payment", "invoice", "fee", "price", "cost", "remuneration", "consideration"],
  confidentiality: ["confidential", "nda", "non-disclosure", "secret"],
  governing_law: ["governing law", "jurisdiction", "applicable law", "dispute"],
  audit_rights: ["audit", "inspection right", "access to records"],
};

/** Signals that the question is about a draft / rewrite */
const DRAFTING_SIGNALS = [
  "draft", "rewrite", "redline", "suggest language", "propose", "write a",
  "suggest alternative", "safer version", "better version", "revise", "amend",
];

/** Signals that the question wants overall favourability or comparison */
const OVERALL_SIGNALS = [
  "which agreement", "more favorable", "more favourable", "better for",
  "protect our", "overall", "summary", "recommendation", "sign", "approve",
  "should we", "risk level", "overall risk",
];

/** Signals that the question is about negotiation priorities */
const NEGOTIATION_SIGNALS = [
  "negotiate", "priorit", "what to push back", "redline", "which clause should",
  "negotiate first", "most important", "key issues", "pushback",
];

/** Signals that the question wants a risk overview */
const RISK_SIGNALS = [
  "risk", "high risk", "risky", "dangerous clause", "concern", "worry",
  "red flag", "warning", "critical",
];

/** Signals about changes / differences */
const DIFFERENCES_SIGNALS = [
  "change", "differ", "what changed", "what was added", "what was removed",
  "modification", "new clause", "missing clause", "added clause",
];

function detectIntent(question: string): Intent {
  const lower = question.toLowerCase();

  if (DRAFTING_SIGNALS.some((s) => lower.includes(s))) return "drafting";
  if (OVERALL_SIGNALS.some((s) => lower.includes(s))) return "overall_assessment";
  if (NEGOTIATION_SIGNALS.some((s) => lower.includes(s))) return "negotiation";
  if (RISK_SIGNALS.some((s) => lower.includes(s))) return "risk_summary";
  if (DIFFERENCES_SIGNALS.some((s) => lower.includes(s))) return "differences_summary";

  // Check if the question targets a specific clause category
  for (const [, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return "clause_specific";
  }

  return "general";
}

/** Returns the category keys that appear in the question */
function detectTopics(question: string): string[] {
  const lower = question.toLowerCase();
  const topics: string[] = [];
  for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) topics.push(category);
  }
  return topics;
}

// ─── Context builders ─────────────────────────────────────────────────────────

/**
 * Summarise the executive summary section for overall-assessment questions.
 */
function buildOverallContext(session: CompareSessionData): string {
  const s = session.executiveSummary;
  if (!s) return "No executive summary available.";

  const lines: string[] = [
    `## Comparison: ${session.originalFileName} vs ${session.revisedFileName}`,
    `**Overall Risk:** ${s.overallRisk}`,
    "",
    `**Assessment:** ${s.overallAssessment}`,
    "",
  ];

  if (s.keyFindings?.length) {
    lines.push("**Key Findings:**");
    s.keyFindings.forEach((f: string) => lines.push(`- ${f}`));
    lines.push("");
  }
  if (s.criticalRedlines?.length) {
    lines.push("**Critical Redlines:**");
    s.criticalRedlines.forEach((r: string) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (s.missingProtections?.length) {
    lines.push("**Missing Protections:**");
    s.missingProtections.forEach((p: string) => lines.push(`- ${p}`));
    lines.push("");
  }
  if (s.negotiationPriorities?.length) {
    lines.push("**Negotiation Priorities:**");
    s.negotiationPriorities.forEach((p: string, i: number) => lines.push(`${i + 1}. ${p}`));
    lines.push("");
  }
  lines.push(`**Recommendation:** ${s.recommendation}`);

  return lines.join("\n");
}

/**
 * Build a context slice focused on a specific set of topics (categories).
 * Retrieves the matching risk findings and differences.
 */
function buildTopicContext(
  session: CompareSessionData,
  topics: string[]
): string {
  const lines: string[] = [
    `## Context: ${session.originalFileName} vs ${session.revisedFileName}`,
    "",
  ];

  // Matching risk findings
  const topicRisks = (session.risks ?? []).filter((r: any) =>
    topics.length === 0 || topics.includes(r.category)
  );

  if (topicRisks.length > 0) {
    lines.push("### Risk Findings");
    topicRisks.slice(0, 8).forEach((r: any) => {
      lines.push(`- **${r.level}** [${r.category}]: ${r.rationale}`);
    });
    lines.push("");
  }

  // Matching differences — filter by semantic summary keyword overlap
  const topicDiffs = (session.differences ?? []).filter((d: any) => {
    if (d.classification === "UNCHANGED") return false;
    if (!d.semanticSummary) return false;
    if (topics.length === 0) return true;
    const lower = d.semanticSummary.toLowerCase();
    return topics.some((t) =>
      TOPIC_KEYWORDS[t]?.some((k) => lower.includes(k)) ?? false
    );
  });

  if (topicDiffs.length > 0) {
    lines.push("### Relevant Clause Changes");
    topicDiffs.slice(0, 10).forEach((d: any) => {
      lines.push(`- [${d.classification}]: ${d.semanticSummary}`);
    });
    lines.push("");
  }

  if (topicRisks.length === 0 && topicDiffs.length === 0) {
    // No matches — widen to executive summary
    lines.push(buildOverallContext(session));
  }

  return lines.join("\n");
}

/**
 * Finds clauses matching the given topic keywords from a clause list.
 * Returns up to `limit` clauses, matching by clause title or text content.
 */
function findMatchingClauses(
  clauses: Array<{ id: string; title: string; text: string }>,
  topics: string[],
  limit = 3
): Array<{ id: string; title: string; text: string }> {
  if (topics.length === 0) return clauses.slice(0, limit);

  const matched: Array<{ id: string; title: string; text: string }> = [];

  for (const clause of clauses) {
    const searchText = `${clause.title} ${clause.text}`.toLowerCase();
    const matches = topics.some((topic) =>
      TOPIC_KEYWORDS[topic]?.some((k) => searchText.includes(k)) ?? false
    );
    if (matches) {
      matched.push(clause);
      if (matched.length >= limit) break;
    }
  }

  return matched;
}

/**
 * Build a context slice for drafting / rewriting questions.
 * Includes the raw clause text from both documents so the LLM can
 * produce an improved version grounded in the actual language.
 */
function buildDraftingContext(
  session: CompareSessionData,
  topics: string[]
): string {
  const lines: string[] = [
    `## Context for Drafting: ${session.originalFileName} vs ${session.revisedFileName}`,
    "",
  ];

  // Include relevant risk + difference context (helps the LLM understand what to fix)
  const topicRisks = (session.risks ?? []).filter((r: any) =>
    topics.length === 0 || topics.includes(r.category)
  );
  const topicDiffs = (session.differences ?? []).filter((d: any) => {
    if (!d.semanticSummary || d.classification === "UNCHANGED") return false;
    if (topics.length === 0) return true;
    const lower = d.semanticSummary.toLowerCase();
    return topics.some((t) =>
      TOPIC_KEYWORDS[t]?.some((k) => lower.includes(k)) ?? false
    );
  });

  if (topicRisks.length > 0) {
    lines.push("### Issues to Address");
    topicRisks.slice(0, 5).forEach((r: any) => {
      lines.push(`- **${r.level}** [${r.category}]: ${r.rationale}`);
    });
    lines.push("");
  }

  if (topicDiffs.length > 0) {
    lines.push("### Clause Changes");
    topicDiffs.slice(0, 5).forEach((d: any) => {
      lines.push(`- [${d.classification}]: ${d.semanticSummary}`);
    });
    lines.push("");
  }

  // Include the actual clause text from both documents so the LLM can
  // produce a grounded redraft rather than fabricating language.
  const clausesA = session.clausesA ?? [];
  const clausesB = session.clausesB ?? [];

  const matchedA = findMatchingClauses(clausesA, topics, 2);
  const matchedB = findMatchingClauses(clausesB, topics, 2);

  if (matchedA.length > 0 || matchedB.length > 0) {
    lines.push("### Current Clause Language");
    lines.push("");

    if (matchedA.length > 0) {
      lines.push(`**${session.originalFileName} (Original):**`);
      matchedA.forEach((c) => {
        lines.push(`\n**${c.title}**`);
        // Cap individual clause text at 800 chars to stay within token budget
        const snippet = c.text.length > 800 ? c.text.slice(0, 800) + "…" : c.text;
        lines.push("```");
        lines.push(snippet);
        lines.push("```");
      });
      lines.push("");
    }

    if (matchedB.length > 0) {
      lines.push(`**${session.revisedFileName} (Revised):**`);
      matchedB.forEach((c) => {
        lines.push(`\n**${c.title}**`);
        const snippet = c.text.length > 800 ? c.text.slice(0, 800) + "…" : c.text;
        lines.push("```");
        lines.push(snippet);
        lines.push("```");
      });
      lines.push("");
    }
  } else if (session.textA || session.textB) {
    // No structured clauses available — fall back to a broad note
    lines.push("### Agreement Text");
    lines.push("*(Full document text is available but not shown here. Use the risk and difference context above to ground your draft.)*");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build a context slice focused on all significant changes.
 */
function buildDifferencesContext(session: CompareSessionData): string {
  const lines: string[] = [
    `## Changes: ${session.originalFileName} vs ${session.revisedFileName}`,
    "",
  ];

  const meaningful = (session.differences ?? []).filter(
    (d: any) => d.classification !== "UNCHANGED" && d.classification !== "NEUTRAL_REPHRASE"
  );

  if (meaningful.length === 0) {
    lines.push("No material clause changes detected between the two agreements.");
    return lines.join("\n");
  }

  const byType: Record<string, any[]> = {};
  for (const d of meaningful) {
    (byType[d.classification] = byType[d.classification] ?? []).push(d);
  }

  for (const [type, diffs] of Object.entries(byType)) {
    lines.push(`### ${type.replace(/_/g, " ")}`);
    diffs.slice(0, 8).forEach((d: any) => {
      lines.push(`- ${d.semanticSummary || `Clause ${d.pairId}`}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build a context slice focused on risk findings.
 */
function buildRiskContext(session: CompareSessionData): string {
  const risks = session.risks ?? [];
  if (risks.length === 0) {
    return `## Risk Analysis: ${session.originalFileName} vs ${session.revisedFileName}\n\nNo risk findings were identified.`;
  }

  const lines: string[] = [
    `## Risk Findings: ${session.originalFileName} vs ${session.revisedFileName}`,
    `**Overall Risk:** ${session.executiveSummary?.overallRisk ?? "UNKNOWN"}`,
    "",
  ];

  const high = risks.filter((r: any) => r.level === "HIGH");
  const medium = risks.filter((r: any) => r.level === "MEDIUM");
  const low = risks.filter((r: any) => r.level === "LOW");

  if (high.length > 0) {
    lines.push(`### HIGH Risk (${high.length})`);
    high.forEach((r: any) => lines.push(`- [${r.category}]: ${r.rationale}`));
    lines.push("");
  }
  if (medium.length > 0) {
    lines.push(`### MEDIUM Risk (${medium.length})`);
    medium.forEach((r: any) => lines.push(`- [${r.category}]: ${r.rationale}`));
    lines.push("");
  }
  if (low.length > 0) {
    lines.push(`### LOW Risk (${low.length})`);
    low.slice(0, 5).forEach((r: any) => lines.push(`- [${r.category}]: ${r.rationale}`));
    if (low.length > 5) lines.push(`  *(${low.length - 5} more LOW findings not shown)*`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Selects and assembles the minimum context needed to answer a question.
 */
function selectContext(session: CompareSessionData, question: string): string {
  const intent = detectIntent(question);
  const topics = detectTopics(question);

  switch (intent) {
    case "overall_assessment":
      return buildOverallContext(session);
    case "drafting":
      return buildDraftingContext(session, topics);
    case "negotiation":
      // Negotiation needs overall context + risk context
      return [buildOverallContext(session), buildRiskContext(session)].join("\n\n---\n\n");
    case "risk_summary":
      return buildRiskContext(session);
    case "differences_summary":
      return topics.length > 0
        ? buildTopicContext(session, topics)
        : buildDifferencesContext(session);
    case "clause_specific":
      return buildTopicContext(session, topics);
    case "general":
    default:
      // General question: give overall context + a risk summary for completeness
      return [buildOverallContext(session), buildRiskContext(session)].join("\n\n---\n\n");
  }
}

// ─── System instruction ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an expert AI legal assistant embedded inside the LORA AI platform.

You have already read and fully understood two legal agreements that a user has provided for comparison. The comparison has been completed — you have access to the structured results: clause alignment, semantic differences, legal risk findings, and an executive summary.

Your role is to answer the user's follow-up questions about these two agreements naturally and helpfully, exactly like a knowledgeable legal colleague who has already read both documents.

Rules:
- Answer the question using the comparison context provided — do not invent facts not present in the context.
- Be concise and direct. Use bullet points where helpful.
- When asked about a specific clause, explain the risk AND what it means in plain English.
- When asked which agreement is more favorable, give a clear recommendation with reasoning.
- When asked to draft/rewrite a clause, produce the improved language in a code block.
- When asked about negotiation priorities, be specific — name the clauses and explain why.
- Keep responses focused. Do not repeat the entire comparison report unless asked.
- Format responses in clean Markdown.
- Do not hallucinate clause text, party names, or obligations that are not in the context.`;

// ─── Agent ────────────────────────────────────────────────────────────────────

export class CompareChatAgent {
  /**
   * Answer a follow-up question about a comparison using the stored context.
   *
   * @param request.session   The compare session data (retrieved from the store)
   * @param request.question  The user's current question
   * @param request.history   Prior conversation turns (user + assistant) for continuity
   */
  async answer(request: CompareChatRequest): Promise<string> {
    const { session, question, history } = request;

    // 1. Select the minimum context relevant to this question
    const context = selectContext(session, question);

    // 2. Build the conversation history portion of the prompt
    const historySection =
      history.length > 0
        ? "## Conversation History\n" +
          history
            .slice(-6) // Keep last 6 turns to stay within token budget
            .map((t) => `**${t.role === "user" ? "User" : "Assistant"}:** ${t.content}`)
            .join("\n\n") +
          "\n\n"
        : "";

    // 3. Assemble the full user prompt
    const prompt = `${historySection}## Comparison Context\n\n${context}\n\n---\n\n## User Question\n\n${question}`;

    console.log(
      `[CompareChatAgent] Answering question for job ${session.jobId} — ` +
        `intent=${detectIntent(question)} topics=[${detectTopics(question).join(",")}] ` +
        `history=${history.length} contextLen=${context.length}`
    );

    try {
      return await this.completeWithProvider(
        prompt,
        SYSTEM_INSTRUCTION,
        LLMProvider.GEMINI
      );
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error(`[CompareChatAgent] LLM call failed:`, message);

      const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
      if (hasOpenRouter) {
        try {
          console.warn("[CompareChatAgent] Retrying with OpenRouter fallback…");
          return await this.completeWithProvider(
            prompt,
            SYSTEM_INSTRUCTION,
            LLMProvider.OPENROUTER
          );
        } catch (fallbackErr: any) {
          console.error(
            `[CompareChatAgent] OpenRouter fallback failed:`,
            fallbackErr?.message ?? fallbackErr
          );
        }
      }

      throw new Error(
        "I was unable to process your question. Please try again."
      );
    }
  }

  private async completeWithProvider(
    prompt: string,
    systemInstruction: string,
    provider: LLMProvider
  ): Promise<string> {
    return executeCompletion(
      prompt,
      systemInstruction,
      LLMTask.COMPLEX_DRAFT,
      provider
    );
  }
}

/** Singleton — one agent instance is sufficient (stateless class) */
export const compareChatAgent = new CompareChatAgent();
