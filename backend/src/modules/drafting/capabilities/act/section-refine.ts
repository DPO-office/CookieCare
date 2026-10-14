import type { DraftState, DraftSection, ValidationIssue } from "../../models/draft-state.js";
import { LLMTask, LLMProvider, executeCompletion } from "../../../../llm/index.js";
import {
  renderSections,
  findSectionByHeading,
  findSectionContaining,
} from "../../utils/document-sections.js";
import * as templates from "../../prompts/system-templates.js";

/**
 * SURGICAL REFINEMENT (Phase 2)
 * ---------------------------------------------------------------------------
 * Instead of regenerating the ENTIRE document when validation finds an issue or a
 * user tweaks one clause (a second full Pro call, ~40-60s), we regenerate ONLY the
 * affected DraftSection(s) and splice them back. Falls back to full-doc regen when
 * a change cannot be safely localized (e.g. a whole compulsory section is missing).
 */

export interface SectionPlan {
  section: DraftSection;
  corrections: string[];
}

/** Extract a quoted token from a validation issue description (e.g. the "[● NAME]" token). */
function tokenFromIssue(issue: ValidationIssue): string | undefined {
  const match = issue.description.match(/"([^"]+)"/);
  return match?.[1];
}

/** Strip ```` ```markdown ```` fences a model may wrap a single-section answer in. */
function stripFences(raw: string): string {
  let text = (raw || "").trim();
  if (text.startsWith("```markdown")) text = text.replace(/^```markdown\s*/i, "");
  else if (text.startsWith("```")) text = text.replace(/^```\s*/, "");
  if (text.endsWith("```")) text = text.replace(/\s*```$/, "");
  return text.trim();
}

/**
 * Guarantee the regenerated block keeps its heading so renderSections() reconstructs
 * a well-formed document even if the model dropped the heading line.
 */
function ensureHeadingPreserved(original: DraftSection, newBody: string): string {
  const nb = newBody.trim();
  if (!original.heading) return nb;
  if (nb.toLowerCase().includes(original.heading.toLowerCase())) return nb;
  const originalFirstLine = original.body.split("\n")[0];
  return `${originalFirstLine}\n\n${nb}`;
}

/**
 * Build a plan for validation-triggered surgical refine.
 * Returns null (=> caller should do a full-doc regen) when any critical issue
 * cannot be confidently mapped to an existing section, or is an omission (a whole
 * missing section can't be edited in place).
 */
export function resolveValidationSurgicalPlan(state: DraftState): SectionPlan[] | null {
  const sections = state.draft?.sections ?? [];
  if (sections.length === 0) return null;

  const criticals = (state.validation?.issues ?? []).filter((i) => i.severity === "critical");
  if (criticals.length === 0) return null;

  const byId = new Map<string, SectionPlan>();
  for (const issue of criticals) {
    // A whole compulsory section is missing -> can't patch in place, do full regen.
    if (issue.type === "omission") return null;

    let section: DraftSection | undefined;
    if (issue.targetSection) section = findSectionByHeading(sections, issue.targetSection);
    if (!section) {
      const token = tokenFromIssue(issue);
      if (token) section = findSectionContaining(sections, token);
    }
    if (!section) return null; // cannot localize -> full regen

    const correction = `[${issue.severity.toUpperCase()} - ${issue.type}] In '${issue.targetSection || section.heading || "section"}': ${issue.description}`;
    const existing = byId.get(section.id);
    if (existing) existing.corrections.push(correction);
    else byId.set(section.id, { section, corrections: [correction] });
  }

  return [...byId.values()];
}

/**
 * Classify whether an unhighlighted user instruction targets specific section(s)
 * based on section numbers, clause references, or topic keywords in the section heading.
 */
export function classifyTargetSections(
  sections: DraftSection[],
  instruction: string
): DraftSection[] | null {
  const lowerText = instruction.toLowerCase().trim();
  if (!lowerText) return null;

  // Check for global / cross-cutting directives
  const isGlobal =
    /\b(?:entire|whole|all|every|complete|full)\s+(?:agreement|document|contract|draft|sections|clauses)\b/i.test(
      lowerText
    ) ||
    /\b(?:everywhere|throughout|globally|all occurrences|across the (?:document|agreement|draft))\b/i.test(
      lowerText
    ) ||
    /(?:data\s+fiduciary|data\s+processor|party\s*[ab]|controller|processor)\s*[:=]/i.test(
      lowerText
    ) ||
    /\b(?:swap|change|replace)\s+(?:the\s+)?(?:parties|party names|counterparty)\b/i.test(
      lowerText
    );
  if (isGlobal) return null;

  // 1. Check for explicit section/clause/schedule number or letter references (e.g. Section 8, Clause 3.2, Schedule B, Exhibit A)
  // Prevent matching prepositions like "in", "of", "to", "for", "under", etc.
  const secNumMatch = lowerText.match(
    /\b(?:section|clause|article|part|schedule|exhibit)\s*([0-9]+(?:\.[0-9]+)*|[a-d]\b|[ivxlcdm]+\b)/i
  );
  if (secNumMatch) {
    const targetRef = secNumMatch[1].toLowerCase();
    const matchedByNum = sections.filter((s) => {
      const heading = (s.heading || "").toLowerCase();
      const id = s.id.toLowerCase();
      return (
        heading.includes(`section ${targetRef}`) ||
        heading.includes(`clause ${targetRef}`) ||
        heading.includes(`article ${targetRef}`) ||
        heading.includes(`schedule ${targetRef}`) ||
        heading.includes(`exhibit ${targetRef}`) ||
        heading.startsWith(`${targetRef}.`) ||
        heading.startsWith(`${targetRef} `) ||
        new RegExp(`^##?\\s*${targetRef}[.\\s]`, "i").test(s.body) ||
        id === `sec-${targetRef}` ||
        id.endsWith(`-${targetRef}`)
      );
    });
    if (matchedByNum.length > 0 && matchedByNum.length <= 3) {
      return matchedByNum;
    }
  }

  // 2. Semantic topic rules mapping legal subjects to specific sections
  interface TopicRule {
    id: string;
    keywords: string[];
    preferredSectionIds: string[];
    bodyIndicators?: string[];
  }

  const TOPIC_RULES: TopicRule[] = [
    {
      id: "breach",
      keywords: [
        "breach",
        "personal data breach",
        "security incident",
        "notification window",
        "notice window",
        "hours",
        "incident",
      ],
      preferredSectionIds: ["sec-breach", "sec-security"],
      bodyIndicators: ["breach", "incident", "security breach", "notification to"],
    },
    {
      id: "indemnity_liability",
      keywords: [
        "indemn",
        "indemnity",
        "indemnification",
        "liability",
        "negligence",
        "damages",
        "hold harmless",
        "limitation of liability",
        "cap on liability",
      ],
      preferredSectionIds: ["sec-misc", "sec-liability", "sec-indemnification"],
      bodyIndicators: ["indemn", "liability", "damages", "negligence", "hold harmless"],
    },
    {
      id: "audit",
      keywords: [
        "audit",
        "inspection",
        "inspect",
        "soc 2",
        "iso 27001",
        "auditor",
        "records of processing",
      ],
      preferredSectionIds: ["sec-misc", "sec-audit"],
      bodyIndicators: ["audit", "inspection", "records"],
    },
    {
      id: "subprocessor",
      keywords: [
        "subprocessor",
        "sub-processor",
        "subcontractor",
        "further processor",
        "flow-down",
      ],
      preferredSectionIds: ["sec-subprocessors", "sec-processing"],
      bodyIndicators: ["sub-processor", "subprocessor"],
    },
    {
      id: "transfers",
      keywords: [
        "cross-border",
        "transfer",
        "outside india",
        "restricted countr",
        "third country",
      ],
      preferredSectionIds: ["sec-transfers"],
      bodyIndicators: ["cross-border", "transfer", "outside india", "central government"],
    },
    {
      id: "return_deletion",
      keywords: [
        "erasure",
        "return",
        "deletion",
        "destroy",
        "destruction",
        "end of processing",
      ],
      preferredSectionIds: ["sec-return"],
      bodyIndicators: ["erasure", "deletion", "return of personal data"],
    },
    {
      id: "rights_assistance",
      keywords: [
        "data principal rights",
        "data subject rights",
        "grievance",
        "assistance",
        "right to access",
        "right to correction",
      ],
      preferredSectionIds: ["sec-assistance"],
      bodyIndicators: ["data principal", "grievance", "data subject rights"],
    },
    {
      id: "governing_law_dispute",
      keywords: [
        "governing law",
        "jurisdiction",
        "court",
        "arbitration",
        "dispute resolution",
        "seat of arbitration",
      ],
      preferredSectionIds: ["sec-misc", "sec-jurisdiction"],
      bodyIndicators: ["governing law", "jurisdiction", "arbitration", "courts"],
    },
    {
      id: "security",
      keywords: [
        "technical and organisational",
        "safeguards",
        "encryption",
        "access control",
        "mfa",
      ],
      preferredSectionIds: ["sec-security"],
      bodyIndicators: ["safeguards", "encryption", "technical and organizational"],
    },
    {
      id: "definitions",
      keywords: [
        "defined term",
        "definition of",
        "define the term",
      ],
      preferredSectionIds: ["sec-definitions"],
      bodyIndicators: ["means", "shall have the meaning"],
    },
  ];

  const matchedSections: DraftSection[] = [];
  const addedIds = new Set<string>();

  for (const rule of TOPIC_RULES) {
    const topicHit = rule.keywords.some((kw) => lowerText.includes(kw));
    if (!topicHit) continue;

    let candidate: DraftSection | undefined;

    // A. Check preferred section IDs
    for (const prefId of rule.preferredSectionIds) {
      const found = sections.find((s) => s.id === prefId || s.workUnitId === prefId);
      if (found) {
        candidate = found;
        break;
      }
    }

    // B. Check headings
    if (!candidate) {
      candidate = sections.find((s) => {
        const h = (s.heading || "").toLowerCase();
        return rule.keywords.some((kw) => h.includes(kw));
      });
    }

    // C. Check section body indicators
    if (!candidate && rule.bodyIndicators) {
      candidate = sections.find((s) => {
        const b = (s.body || "").toLowerCase();
        return rule.bodyIndicators!.some((ind) => b.includes(ind));
      });
    }

    if (candidate && !addedIds.has(candidate.id)) {
      matchedSections.push(candidate);
      addedIds.add(candidate.id);
    }
  }

  if (matchedSections.length > 0 && matchedSections.length <= 4) {
    return matchedSections;
  }

  // 3. Fallback topic keyword scoring against headings and bodies
  const topicScores = sections.map((sec) => {
    const heading = (sec.heading || "").toLowerCase();
    const body = (sec.body || "").toLowerCase();
    let score = 0;

    const keywords = [
      "definition",
      "service",
      "fee",
      "payment",
      "price",
      "compensation",
      "ip",
      "intellectual property",
      "data",
      "security",
      "privacy",
      "confidential",
      "liability",
      "indemn",
      "warranty",
      "term",
      "termination",
      "notice",
      "governing law",
      "jurisdiction",
      "dispute",
      "sla",
      "support",
      "audit",
      "breach",
      "subprocessor",
    ];

    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        if (heading.includes(kw)) score += 3;
        else if (body.includes(kw)) score += 1;
      }
    }

    return { section: sec, score };
  });

  const scored = topicScores.filter((t) => t.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const topScore = scored[0].score;
    const bestMatches = scored.filter((s) => s.score >= Math.max(2, topScore - 1)).map((s) => s.section);
    if (bestMatches.length > 0 && bestMatches.length <= 3) {
      return bestMatches;
    }
  }

  return null;
}

/**
 * Build a plan for human-driven refine.
 * First checks highlighted text; then uses instruction classification to target specific sections;
 * falls back to null (=> full-doc refine) when instructions are global or cross-cutting.
 */
export function planHumanRefine(state: DraftState): SectionPlan[] | null {
  const sections = state.draft?.sections ?? [];
  if (sections.length === 0) return null;

  const raw = state.request.rawInstructions || "";
  const highlighted = state.request.highlightedText;

  if (highlighted && highlighted.trim()) {
    const section = findSectionContaining(sections, highlighted);
    if (section) {
      const corrections = [
        `USER EDITING INSTRUCTION: ${raw}`,
        `FOCUS STRICTLY ON THIS HIGHLIGHTED TEXT WITHIN THE SECTION: "${highlighted}"`,
      ];
      return [{ section, corrections }];
    }
  }

  if (!raw.trim()) return null;

  const targetSections = classifyTargetSections(sections, raw);
  if (targetSections && targetSections.length > 0) {
    return targetSections.map((sec) => ({
      section: sec,
      corrections: [`USER EDITING INSTRUCTION: ${raw}`],
    }));
  }

  return null;
}

function buildSectionRefinePrompt(state: DraftState, section: DraftSection, corrections: string[]): string {
  const req = state.requirements;
  return [
    "# TASK: REVISE ONE SECTION OF AN EXISTING LEGAL AGREEMENT",
    "Return ONLY the corrected markdown for THIS section, including its original heading line.",
    "Do NOT add, remove, or renumber other sections. Do NOT output the whole document.",
    "Do NOT wrap the output in code fences and do NOT add any commentary.",
    "Preserve clause numbering and cross-references so the section still fits its surroundings.",
    "",
    "# DOCUMENT CONTEXT",
    `- Contract Type: ${req?.contractType ?? "Agreement"}`,
    `- Governing Law/Jurisdiction: ${req?.jurisdiction ?? "Unspecified"}`,
    req?.parties?.length ? `- Parties: ${req.parties.join(" AND ")}` : "",
    "",
    "# CORRECTIONS TO APPLY TO THIS SECTION",
    ...corrections.map((c, i) => `${i + 1}. ${c}`),
    "",
    "# CURRENT SECTION TEXT (revise this in place)",
    section.body,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Regenerate only the sections in `plan`, splice them back, and return an updated state.
 * One LLM call per targeted section using the fast, scoped SECTION_REFINE preset.
 */
export async function regenerateSections(
  state: DraftState,
  plan: SectionPlan[],
  actor: "user" | "validator",
  provider: LLMProvider = LLMProvider.GEMINI
): Promise<DraftState> {
  if (!state.draft?.sections || state.draft.sections.length === 0) {
    throw new Error("Surgical refine aborted: state has no structured sections.");
  }

  const sections: DraftSection[] = [...state.draft.sections];
  const systemPrompt = state.context?.systemPrompt || templates.REFINEMENT_CORE_GUARDRAILS;
  const changedIds: string[] = [];

  for (const item of plan) {
    const idx = sections.findIndex((s) => s.id === item.section.id);
    if (idx === -1) continue;

    const prompt = buildSectionRefinePrompt(state, sections[idx], item.corrections);
    const raw = await executeCompletion(prompt, systemPrompt, LLMTask.SECTION_REFINE, provider);
    const newBody = ensureHeadingPreserved(sections[idx], stripFences(raw));

    if (newBody) {
      sections[idx] = { ...sections[idx], body: newBody };
      changedIds.push(sections[idx].id);
    }
  }

  const formattedDocument = renderSections(sections);
  const version = (state.draft.version ?? 1) + 1;

  const historyEntry = {
    version,
    actor,
    action: "section-refine",
    instruction: state.request.rawInstructions || undefined,
    changedSectionIds: changedIds,
    timestamp: new Date().toISOString(),
  } as const;

  return {
    ...state,
    draft: {
      rawOutput: formattedDocument,
      formattedDocument,
      sections,
      version,
      parentVersionId: `v${state.draft.version}`,
    },
    history: [...(state.history ?? []), historyEntry],
    metadata: {
      ...state.metadata,
      sectionRefinedAt: new Date().toISOString(),
      surgicalChangedSections: changedIds,
    },
  };
}
