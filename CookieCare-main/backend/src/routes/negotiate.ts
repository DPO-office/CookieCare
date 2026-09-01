import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import {
  executeCompletion,
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../llm/index.js";
import { saveStep } from "../modules/drafting/capabilities/persist/save.js";
import { pool } from "../config/database.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import crypto from "crypto";
import { evaluateFullDocument } from "../utils/negotiateChunker.js";
import { PlaybookRetriever } from "../modules/drafting/retrieval/PlaybookRetriever.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collapse whitespace for fuzzy text matching */
function norm(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Returns true when two text spans share enough overlap to be considered the
 * same clause (one is a substring of the other after normalisation).
 */
function textsOverlap(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  // Use the shorter string as the needle
  return na.length <= nb.length ? nb.includes(na) : na.includes(nb);
}

/**
 * Extract ±500 chars of plain text around charOffset (or indexOf fallback).
 * Never throws — returns empty string on any failure.
 */
function extractSurroundingContext(
  documentText: string,
  original: string,
  charOffset?: number
): string {
  try {
    const WINDOW = 500;
    const idx =
      typeof charOffset === "number" && charOffset >= 0
        ? charOffset
        : documentText.indexOf(original);
    if (idx === -1) return "";
    const start = Math.max(0, idx - WINDOW);
    const end = Math.min(documentText.length, idx + original.length + WINDOW);
    return documentText.slice(start, end);
  } catch {
    return "";
  }
}

// ── Phase 2: Negotiation Context Assembly ────────────────────────────────────
/**
 * Deterministically assembles context for a selected clause from all
 * available sources (analysis jobs, compare jobs, playbook rules, redlines).
 * No LLM calls. Missing sources are omitted, never fabricated.
 *
 * POST /api/negotiate/context
 * Body: {
 *   documentId: string,
 *   original: string,       — verbatim clause text
 *   clauseId: string,
 *   clauseType?: string,    — taxonomy label (e.g. "indemnity")
 *   charOffset?: number,
 *   userInstruction?: string
 * }
 */
router.post("/context", authenticateToken, async (req, res) => {
  const {
    documentId,
    original,
    clauseId,
    clauseType = "",
    charOffset,
    userInstruction = "",
    playbookId,
  } = req.body;

  if (!documentId || !original || !clauseId) {
    return res.status(400).json({ error: "documentId, original and clauseId are required." });
  }

  const userId = req.user!.id;

  try {
    // ── 1. Document text (for surrounding context extraction) ───────────────
    let documentText = "";
    try {
      const { rows } = await pool.query(
        `SELECT content, is_encrypted FROM files WHERE id = $1 LIMIT 1`,
        [documentId]
      );
      if (rows.length > 0) {
        const r = rows[0];
        documentText = r.is_encrypted ? decrypt(r.content) : r.content;
      }
    } catch { /* non-fatal */ }

    const surroundingContext = extractSurroundingContext(documentText, original, charOffset);

    // ── 2. Analysis finding ─────────────────────────────────────────────────
    let analysisFinding: any = undefined;
    try {
      const { rows } = await pool.query(
        `SELECT result FROM jobs
         WHERE user_id = $1
           AND type IN ('document_analysis', 'analysis_pac')
           AND status = 'completed'
           AND result IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId]
      );

      outer: for (const row of rows) {
        const result = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
        // PAC path: result.findings[]  |  legacy path: result.findings[] or result.risks[]
        const findings: any[] = result?.findings ?? result?.risks ?? [];
        for (const f of findings) {
          const clauseText: string = f.clauseText ?? f.clause ?? f.sourceExcerpt ?? "";
          if (clauseText && textsOverlap(original, clauseText)) {
            analysisFinding = {
              severity: f.severity ?? "medium",
              issue: f.issue ?? f.description ?? "",
              recommendation: f.recommendation ?? f.actionableInsight ?? "",
              fallbackPosition: f.fallbackPosition ?? undefined,
            };
            break outer;
          }
          // Secondary: category match when clause text unavailable
          const cat: string = f.category ?? f.risk_level ?? "";
          if (clauseType && cat && norm(cat).includes(norm(clauseType))) {
            analysisFinding = {
              severity: f.severity ?? "medium",
              issue: f.issue ?? f.description ?? "",
              recommendation: f.recommendation ?? f.actionableInsight ?? "",
              fallbackPosition: f.fallbackPosition ?? undefined,
            };
            break outer;
          }
        }
      }
    } catch { /* non-fatal */ }

    // ── 3. Compare finding ──────────────────────────────────────────────────
    let compareFinding: any = undefined;
    try {
      const { rows } = await pool.query(
        `SELECT result FROM jobs
         WHERE user_id = $1
           AND type = 'contract_comparison'
           AND status = 'completed'
           AND result IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 3`,
        [userId]
      );

      outer: for (const row of rows) {
        const result = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
        const clausesA: any[] = result?.parsed?.clausesA ?? result?.structure?.clausesA ?? [];
        const clausesB: any[] = result?.parsed?.clausesB ?? result?.structure?.clausesB ?? [];
        const allClauses = [...clausesA, ...clausesB];
        const diffs: any[] = result?.differences ?? [];
        const risks: any[] = result?.risks ?? [];

        for (const clause of allClauses) {
          if (!textsOverlap(original, clause.text ?? "")) continue;
          // Find the diff and risk for this clause's pair
          const diff = diffs.find(
            (d: any) => d.clauseAId === clause.id || d.clauseBId === clause.id
          );
          const risk = risks.find(
            (r: any) => diff && r.pairId === diff.pairId
          );
          if (diff || risk) {
            compareFinding = {
              classification: diff?.classification ?? "MODIFIED_BROADER",
              semanticSummary: diff?.semanticSummary ?? "",
              riskRationale: risk?.rationale ?? "",
            };
            break outer;
          }
        }
      }
    } catch { /* non-fatal */ }

    // ── 4. Playbook rule ────────────────────────────────────────────────────
    let playbookRule: any = undefined;
    try {
      if (playbookId && typeof playbookId === "string" && playbookId.trim()) {
        // User selected a specific Vault AI Rulebook — resolve it by ID first.
        const retriever = new PlaybookRetriever(pool);
        const lookupResult = await retriever.retrieveRules(
          { contractType: clauseType || "General" } as any,
          {
            request: { playbookId: playbookId.trim(), payloadFields: {}, intent: "REFINEMENT" },
            organizationId: null,
          } as any
        );

        if (lookupResult.rules.length > 0) {
          // Find the rule that best matches this clause by topic or trigger.
          // IMPORTANT: do NOT fall back to rules[0] — attaching an unrelated
          // rule produces false playbook attribution on /strategy.
          const normOrig = norm(original);
          const matched = lookupResult.rules.find((r: any) => {
            const topicMatch = clauseType && norm(r.topic ?? "").includes(norm(clauseType));
            const contentMatch = normOrig.includes(norm(r.topic ?? ""));
            return topicMatch || contentMatch;
          }) ?? null; // null = no genuine match found

          if (matched) {
            playbookRule = {
              topic: matched.topic,
              standardPosition: matched.standardPosition,
              fallbackPositions: Array.isArray(matched.fallbackPositions) ? matched.fallbackPositions : [],
              walkAwayCondition: matched.walkAwayCondition,
            };
            console.log(
              `[negotiate/context] Resolved playbook ID=${playbookId} source=${lookupResult.source} ` +
              `matched topic="${matched.topic}"`
            );
          } else {
            // Playbook was found but none of its rules cover this clause type.
            // Leave playbookRule undefined so /strategy uses generic AI mode.
            console.log(
              `[negotiate/context] Playbook ID=${playbookId} has ${lookupResult.rules.length} rule(s) ` +
              `but none matched clauseType="${clauseType}" — leaving playbookRule unset.`
            );
          }
        } else {
          console.warn(
            `[negotiate/context] Playbook ID ${playbookId} resolved 0 rules — ` +
            `falling back to clause-type query.`
          );
        }
      }

      // If no playbookId was provided (or ID resolution returned nothing),
      // fall back to the existing clause-type keyword/trigger pattern query.
      if (!playbookRule) {
        // Match by trigger_patterns (keyword array) OR topic similarity
        const { rows } = await pool.query(
          `SELECT topic, standard_position, fallback_positions, walk_away_condition, trigger_patterns
           FROM playbook_rules
           WHERE contract_type IN ('General', $1)
           ORDER BY contract_type DESC
           LIMIT 20`,
          [clauseType || "General"]
        );

        const normOriginal = norm(original);
        for (const row of rows) {
          const patterns: string[] = Array.isArray(row.trigger_patterns)
            ? row.trigger_patterns
            : [];
          const matched = patterns.some((p: string) => normOriginal.includes(norm(p)));
          const topicMatch = clauseType && norm(row.topic ?? "").includes(norm(clauseType));

          if (matched || topicMatch) {
            playbookRule = {
              topic: row.topic,
              standardPosition: row.standard_position,
              fallbackPositions: Array.isArray(row.fallback_positions)
                ? row.fallback_positions
                : [],
              walkAwayCondition: row.walk_away_condition,
            };
            break;
          }
        }
      }
    } catch { /* non-fatal */ }

    // ── 5. Prior redlines ───────────────────────────────────────────────────
    let priorRedlines: any[] | undefined = undefined;
    try {
      const { rows } = await pool.query(
        `SELECT redlines FROM files WHERE id = $1 LIMIT 1`,
        [documentId]
      );
      if (rows.length > 0) {
        const raw = rows[0].redlines;
        const all: any[] = Array.isArray(raw)
          ? raw
          : typeof raw === "string"
          ? JSON.parse(raw)
          : [];
        const matching = all.filter(
          (r: any) => r.originalText && textsOverlap(original, r.originalText)
        );
        if (matching.length > 0) {
          priorRedlines = matching.map((r: any) => ({
            proposedText: r.proposedText ?? "",
            comment: r.comment ?? "",
            status: r.status ?? "pending",
          }));
        }
      }
    } catch { /* non-fatal */ }

    // ── Assemble and return ─────────────────────────────────────────────────
    const context = {
      clauseId,
      original,
      surroundingContext,
      userInstruction,
      ...(analysisFinding ? { analysisFinding } : {}),
      ...(compareFinding ? { compareFinding } : {}),
      ...(playbookRule ? { playbookRule } : {}),
      ...(priorRedlines ? { priorRedlines } : {}),
    };

    console.log(
      `[negotiate/context] Assembled for clause "${clauseId}" — ` +
        `analysis=${!!analysisFinding} compare=${!!compareFinding} ` +
        `playbook=${!!playbookRule} redlines=${priorRedlines?.length ?? 0} ` +
        `playbookId=${playbookId ?? "none"}`
    );

    return res.json({ context });
  } catch (err: any) {
    console.error("[negotiate/context] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Existing: Full Negotiation Run ──────────────────────────────────────────
router.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    
    if (!documentContent) {
      return res.status(400).json({ error: "Document content is required for a negotiation run." });
    }

    const result = await orchestrator.runNegotiation(
      documentContent, 
      playbooks || [], 
      instructions || ""
    );
    res.json({ redlines: result });
  } catch (err: any) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Multi-Agent Clause Evaluator (Phase 1: full-document, broad taxonomy) ────
router.post("/evaluate", authenticateToken, async (req, res) => {
  const {
    content,
    documentTitle = "Contract",
    documentType  = "Agreement",
    playbookId,           // optional — frontend sends the selected Vault rulebook ID
  } = req.body;

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }

  // Warn the client when the document is large so the UI can show a
  // "analysing large document" message instead of a plain spinner.
  const isLargeDocument = content.length > 14_000;

  // ── Resolve playbook rules before evaluation ────────────────────────────
  // Only attempt resolution when a real playbookId was supplied.
  // Failures are non-fatal — fall back to generic evaluation silently.
  let playbookRules: import("../utils/negotiateChunker.js").PlaybookRuleInput[] = [];

  if (playbookId && typeof playbookId === "string" && playbookId.trim()) {
    try {
      const retriever = new PlaybookRetriever(pool);
      const lookupResult = await retriever.retrieveRules(
        { contractType: documentType || "General" } as any,
        {
          request: { playbookId: playbookId.trim(), payloadFields: {}, intent: "ANALYSIS" },
          organizationId: null,
        } as any
      );

      if (lookupResult.source === "exact_id" && lookupResult.rules.length > 0) {
        // Only use rules when the playbook was positively identified by its ID.
        // Do NOT use contract-type default rules here — those are not the user's
        // selected playbook and would produce false playbook attribution.
        playbookRules = lookupResult.rules.map((r: any) => ({
          topic:             String(r.topic ?? ""),
          standardPosition:  String(r.standardPosition ?? ""),
          fallbackPositions: Array.isArray(r.fallbackPositions) ? r.fallbackPositions : [],
          walkAwayCondition: String(r.walkAwayCondition ?? ""),
        }));
        console.log(
          `[negotiate/evaluate] Loaded ${playbookRules.length} playbook rule(s) ` +
          `from playbookId=${playbookId}`
        );
      } else if (lookupResult.miss) {
        console.warn(
          `[negotiate/evaluate] Playbook ID ${playbookId} not found (${lookupResult.miss.reason}). ` +
          `Evaluating without playbook context.`
        );
      } else {
        console.warn(
          `[negotiate/evaluate] Playbook ID ${playbookId} resolved via ` +
          `source=${lookupResult.source} — not using contract-type default rules for evaluate.`
        );
      }
    } catch (err: any) {
      console.warn(
        `[negotiate/evaluate] Playbook retrieval failed (non-fatal): ${err.message}. ` +
        `Evaluating without playbook context.`
      );
    }
  }

  try {
    console.log(
      `[negotiate/evaluate] Starting full-document evaluation for "${documentTitle}" — ` +
        `${content.length} chars, large=${isLargeDocument}, playbookRules=${playbookRules.length}`
    );

    // evaluateFullDocument handles chunking, parallel LLM calls, dedup,
    // stable clauseId assignment, and charOffset resolution internally.
    // playbookRules is empty array when no playbook selected → generic evaluation.
    const markups = await evaluateFullDocument(content, documentTitle, documentType, playbookRules);

    console.log(`[negotiate/evaluate] Completed — ${markups.length} markup(s) for "${documentTitle}" ` +
      `(${markups.filter((m: any) => m.matchedPlaybookTopic).length} playbook-grounded)`);

    return res.json({
      data: { markups },
      ...(isLargeDocument
        ? { info: `Document was analysed in sections (${content.length} chars).` }
        : {}),
    });
  } catch (err: any) {
    console.error("[negotiate/evaluate] evaluation error:", err.message);
    // Return a structured error so the frontend can display it — do NOT silently
    // return empty markups, which previously caused the UI to show "All clear"
    // on a failed evaluation.
    return res.status(500).json({
      error: "Clause evaluation failed. Please try again.",
      detail: err.message,
    });
  }
});

// ── Lumi Compromise Drafter (Phase 1/2 legacy + Phase 4 strategy-position path) ──
/**
 * POST /api/negotiate/compromise
 *
 * Legacy path  — body: { originalText, riskExplanation, userPrompt, playbookPreferred }
 * Strategy path — body: { originalText, riskExplanation, userPrompt, playbookPreferred,
 *                          strategyPosition: { tier, position, source, rationale },
 *                          analysisFinding?, compareFinding?, playbookRule? }
 *
 * When `strategyPosition` is present the prompt is steered toward that specific
 * concession-ladder position rather than the generic preferred/balanced toggle.
 * The existing legacy behaviour is fully preserved when it is absent.
 *
 * Response (legacy):  { result: string }
 * Response (strategy): { result: string, draftMeta: { tier, position, source, confidence, rationale } }
 */
router.post("/compromise", authenticateToken, async (req, res) => {
  const {
    originalText,
    riskExplanation,
    userPrompt: customPrompt,
    playbookPreferred,
    // Phase 4 strategy-position fields (all optional — legacy callers omit them)
    strategyPosition,
    analysisFinding,
    compareFinding,
    playbookRule,
  } = req.body;

  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }

  // ── Determine which path we're on ────────────────────────────────────────
  const isStrategyPath =
    strategyPosition &&
    typeof strategyPosition === "object" &&
    typeof strategyPosition.position === "string" &&
    ["preferred", "balanced", "fallback"].includes(strategyPosition.tier);

  let systemPrompt: string;
  let userPrompt: string;

  if (isStrategyPath) {
    // ── Phase 4: strategy-position-aware drafting ─────────────────────────
    const { tier, position, source, rationale } = strategyPosition;
    const isPlaybookBacked = source === "playbook";

    // Build an optional context enrichment block
    const contextLines: string[] = [];
    if (analysisFinding?.issue) {
      contextLines.push(`Analysis finding: ${analysisFinding.issue}`);
      if (analysisFinding.recommendation) contextLines.push(`Recommendation: ${analysisFinding.recommendation}`);
    }
    if (compareFinding?.semanticSummary) {
      contextLines.push(`Compare finding: ${compareFinding.semanticSummary}`);
    }
    if (playbookRule?.standardPosition) {
      contextLines.push(`Company playbook position: ${playbookRule.standardPosition}`);
      if (playbookRule.walkAwayCondition) {
        contextLines.push(`Walk-away condition: ${playbookRule.walkAwayCondition}`);
      }
    }
    const contextBlock = contextLines.length > 0
      ? `\nRELEVANT CONTEXT:\n${contextLines.join("\n")}`
      : "";

    systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a precise legal revision of a contract clause that implements a specific negotiation position.

NEGOTIATION POSITION TO IMPLEMENT:
Tier: ${tier.toUpperCase()} (${isPlaybookBacked ? "company playbook-backed" : "AI-suggested"})
Position: ${position}
Rationale: ${rationale}

DRAFTING RULES:
1. Implement EXACTLY the stated negotiation position — no more, no less.
2. Preserve all legal language in the original clause that is unrelated to the negotiation position.
3. Do NOT invent facts, obligations, or requirements not implied by the position.
4. ${isPlaybookBacked ? "This position is backed by the company playbook. Honour it precisely — do not soften or strengthen it." : "This is an AI-suggested position. Draft commercially reasonable language consistent with market standards."}
5. Respect any user instruction provided.

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the revised clause.
- Do NOT use markdown code blocks, quotation marks, preambles, or postscript notes. Begin immediately with the clause text.`;

    userPrompt = `Original clause:
"${originalText}"
${contextBlock}
${customPrompt ? `\nUser instruction: ${customPrompt}` : ""}

Draft the revised clause implementing the ${tier} position:`;

  } else {
    // ── Legacy path: unchanged behaviour ─────────────────────────────────
    systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a protective, commercially viable replacement for a risky contract clause.

DRAFTING STRATEGY:
${
  playbookPreferred
    ? "Maximize client protection. Draft strong, defensive, client-favorable language that holds the line on critical exposures."
    : "Draft a balanced, market-standard compromise that mitigates risk while facilitating a fast deal sign-off."
}

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the replacement clause.
- Do NOT wrap your output in markdown code blocks (e.g. no \`\`\`), quotation marks, introduction/explanatory preambles, or postscript notes. Begin immediately with the clause text.`;

    userPrompt = `Original risky clause:
"${originalText}"

Risk Analysis: ${riskExplanation || "General legal risk detected."}
${customPrompt ? `Additional Instruction: ${customPrompt}` : ""}

Draft the replacement clause below:`;
  }

  try {
    console.log(
      isStrategyPath
        ? `[negotiate/compromise] Strategy-draft tier=${strategyPosition.tier} source=${strategyPosition.source}`
        : `[negotiate/compromise] Legacy draft playbookPreferred=${playbookPreferred}`
    );

    const result = await executeCompletion(
      userPrompt,
      systemPrompt,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI
    );

    const trimmed = result.trim();

    if (isStrategyPath) {
      return res.json({
        result: trimmed,
        draftMeta: {
          tier: strategyPosition.tier,
          position: strategyPosition.position,
          source: strategyPosition.source,
          rationale: strategyPosition.rationale,
          // Confidence is passed through from the Phase 3 strategy if the
          // caller supplies it; otherwise omitted.
          ...(typeof strategyPosition.confidence === "number"
            ? { confidence: strategyPosition.confidence }
            : {}),
        },
      });
    }

    return res.json({ result: trimmed });
  } catch (err: any) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── NEW: Save Negotiation Step Persistence Checkpoint ───────────────────────
router.post("/save-step", authenticateToken, async (req, res) => {
  const { documentId, content, version } = req.body;

  if (!documentId || typeof content !== "string") {
    return res.status(400).json({ error: "documentId and content are required." });
  }

  const userId = req.user!.id;

  try {
    // 1. Fetch current draft state from ledger or start clean
    let state: any = null;
    const snapshotLookup = await pool.query(
      `SELECT state_snapshot_json FROM draft_state_ledger WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
      [documentId]
    );

    if (snapshotLookup.rows.length > 0) {
      state = snapshotLookup.rows[0].state_snapshot_json;
    }

    if (!state) {
      state = {
        request: {
          intent: "REFINEMENT",
          payloadFields: { documentId }
        },
        requirements: null,
        retrieval: {
          matchedTemplate: null,
          applicablePlaybookRules: [],
          fallbackClauses: [],
          historicalReferences: []
        },
        context: null,
        draft: null,
        validation: null,
        riskReview: null,
        metadata: {
          generationParameters: {},
          playbookVersion: "1.0.0",
          timestamp: new Date().toISOString()
        }
      };
    }

    // Update state values for this save step
    state.draft = {
      rawOutput: content,
      formattedDocument: content,
      version: version || 1
    };
    if (!state.request) state.request = {};
    if (!state.request.payloadFields) state.request.payloadFields = {};
    state.request.payloadFields.documentId = documentId;

    // 2. Trigger saveStep pipeline
    const savedState = await saveStep(state);

    // 3. Update main files table and document_versions table so UI updates
    const encryptedContent = encrypt(content);
    
    await pool.query(
      "UPDATE files SET content = $1, updated_at = NOW() WHERE id = $2",
      [encryptedContent, documentId]
    );

    const versionId = "ver_" + crypto.randomUUID();
    await pool.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, documentId, encryptedContent]
    );

    console.log(`[negotiate/save-step] Successfully saved V${version} for document ${documentId}`);
    return res.json({ success: true, savedState });
  } catch (err: any) {
    console.error("[negotiate/save-step] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Phase 3: Negotiation Strategy Generator ──────────────────────────────────
/**
 * Generates a three-tier negotiation strategy (Preferred → Balanced → Fallback)
 * from an assembled NegotiationContext using a single structured LLM call.
 *
 * Rules enforced in the prompt:
 *  - If a playbookRule exists, its standardPosition drives Preferred and
 *    fallbackPositions drive Balanced/Fallback. Source = "playbook".
 *  - Otherwise all positions are AI-suggested. Source = "ai".
 *  - Positions must form a logical concession ladder (not three alternatives).
 *  - No final clause language is drafted here.
 *
 * POST /api/negotiate/strategy
 * Body: { context: NegotiationContext }
 * Response: { strategy: NegotiationStrategy }
 */
router.post("/strategy", authenticateToken, async (req, res) => {
  const { context } = req.body;

  if (!context || !context.clauseId || !context.original) {
    return res.status(400).json({ error: "context with clauseId and original is required." });
  }

  // ── Build a focused prompt that passes only the relevant context ────────────
  const {
    original,
    clauseId,
    surroundingContext = "",
    userInstruction = "",
    analysisFinding,
    compareFinding,
    playbookRule,
    priorRedlines,
  } = context;

  const hasPlaybook = !!playbookRule;

  // Compact context block — omit empty sections to keep the prompt tight
  const contextBlock = [
    `CLAUSE TEXT:\n"${original.slice(0, 800)}"`,
    surroundingContext
      ? `SURROUNDING CONTEXT (±500 chars):\n"${surroundingContext.slice(0, 600)}"`
      : null,
    analysisFinding
      ? `ANALYSIS FINDING:\nSeverity: ${analysisFinding.severity}\nIssue: ${analysisFinding.issue}\nRecommendation: ${analysisFinding.recommendation}${analysisFinding.fallbackPosition ? `\nAnalysis fallback: ${analysisFinding.fallbackPosition}` : ""}`
      : null,
    compareFinding
      ? `COMPARE FINDING:\nClassification: ${compareFinding.classification}\nSummary: ${compareFinding.semanticSummary}\nRisk: ${compareFinding.riskRationale}`
      : null,
    hasPlaybook
      ? `COMPANY PLAYBOOK RULE:\nTopic: ${playbookRule.topic}\nStandard position: ${playbookRule.standardPosition}\nFallback positions: ${playbookRule.fallbackPositions.join(" | ")}\nWalk-away condition: ${playbookRule.walkAwayCondition}`
      : null,
    priorRedlines?.length
      ? `PRIOR REDLINES (${priorRedlines.length}):\n${priorRedlines.slice(0, 3).map((r: any) => `- ${r.comment || r.proposedText}`).join("\n")}`
      : null,
    userInstruction ? `USER INSTRUCTION: ${userInstruction}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = `You are Lumi, an expert commercial legal negotiation strategist.
Your task is to determine a coherent negotiation strategy for a specific contract clause.

CRITICAL RULES:
1. Preferred → Balanced → Fallback must form a logical CONCESSION LADDER — each step gives more ground than the previous. Do NOT generate three unrelated alternatives.
2. ${hasPlaybook ? "A company Playbook is present. The Preferred position MUST align with the Playbook's standardPosition. Do NOT invent a conflicting company position. Set source='playbook' for all three positions." : "No Playbook is present. Generate AI-suggested positions grounded in the clause and available context. Set source='ai' for all three positions."}
3. Do NOT draft final legal clause language. Express positions as concise negotiation stances (1–2 sentences each).
4. confidence is a float 0–1 reflecting how well the available context supports the strategy.
5. Return valid JSON only — no markdown, no preamble.`;

  const userPrompt = `${contextBlock}

Generate a negotiation strategy for clause ID "${clauseId}".`;

  const jsonSchema = {
    type: "object",
    properties: {
      preferred: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      balanced: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      fallback: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      strategyRationale: { type: "string" },
      confidence: { type: "number" },
      basisSource: { type: "string", enum: ["playbook", "ai"] },
    },
    required: ["preferred", "balanced", "fallback", "strategyRationale", "confidence", "basisSource"],
  };

  try {
    console.log(
      `[negotiate/strategy] Generating strategy for clause "${clauseId}" — ` +
        `playbook=${hasPlaybook} analysis=${!!analysisFinding} compare=${!!compareFinding}`
    );

    const raw = await executeJsonCompletion<any>(
      userPrompt,
      systemPrompt,
      jsonSchema,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI
    );

    // ── Guard: enforce basisSource/source consistency ──────────────────────
    // If no playbookRule was present in the context, the LLM should have used
    // source='ai', but guard here in case the model ignores the instruction.
    const enforcedRaw = { ...raw };
    if (!hasPlaybook) {
      // Clamp basisSource to 'ai' when no playbook rule was available.
      enforcedRaw.basisSource = "ai";
      // Also clamp each tier's source to 'ai'.
      for (const tier of ["preferred", "balanced", "fallback"] as const) {
        if (enforcedRaw[tier] && enforcedRaw[tier].source === "playbook") {
          enforcedRaw[tier] = { ...enforcedRaw[tier], source: "ai" };
        }
      }
    }

    // Attach clauseId so the client can correlate the result
    const strategy = { clauseId, ...enforcedRaw };

    console.log(
      `[negotiate/strategy] Done for "${clauseId}" — ` +
      `basis=${strategy.basisSource} confidence=${strategy.confidence} ` +
      `hasPlaybook=${hasPlaybook}`
    );

    return res.json({ strategy });
  } catch (err: any) {
    console.error("[negotiate/strategy] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;