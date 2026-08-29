import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../../llm/index.js";
import { pool } from "../../../../config/database.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { Finding } from "../../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import { insufficient } from "./act-utils.js";

/**
 * Tier C — live-search / unverified reference for an unresolved standard.
 * Findings are always tagged unverified and must not mix into Tier B tables.
 */
export async function webAssistedReference(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const query = String(unit.input.query ?? state.intent?.unresolvedStandard ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const docId = String(unit.input.docId ?? state.request.documentIds[0] ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const excerpt = (doc?.fullText ?? "").slice(0, 2500);
  const retrievedAt = new Date().toISOString();
  void state.onProgress?.(70, "Searching the web…");

  if (!query) {
    return {
      state,
      findings: [...findings, insufficient(unit, "No unresolved standard query for web-assisted reference")],
    };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "object",
    properties: {
      claim: { type: "string" },
      gap: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high"] },
      sourceLabel: { type: "string" },
      sourceUrl: { type: "string" },
      resolved: { type: "boolean" },
    },
    required: ["claim", "severity", "resolved"],
  };

  let raw: {
    claim: string;
    gap?: string;
    severity: "low" | "medium" | "high";
    sourceLabel?: string;
    sourceUrl?: string;
    resolved: boolean;
  };
  try {
    raw = await executeJsonCompletion(
      [
        "The user named a legal standard that is NOT in CookieCare's authored skill/rule registry.",
        "Produce ONE clearly-unverified research note. Do not claim the document complies.",
        "Do not invent quotes from the document. If you mention the excerpt, paraphrase only.",
        "Prefer official primary sources: eur-lex.europa.eu, legislation.gov.uk, *.gov regulator sites.",
        "Deprioritize law-firm blogs, SEO aggregators, and secondary commentary — cite them only if no official source is available.",
        `Unresolved standard: ${query}`,
        `User instruction: ${instruction}`,
        excerpt ? `Document excerpt:\n${excerpt}` : "No excerpt.",
        "Label this as unverified live research, not an authored compliance finding.",
        "Set resolved=true only if you can point to a concrete official source URL.",
      ].join("\n\n"),
      "You produce a clearly-labeled unverified research note. Prefer official .gov / eur-lex / legislation.gov.uk sources. Never mix this with authored-rule findings.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[webAssistedReference] LLM failed:", err);
    raw = {
      claim: `Could not look up unverified material for "${query}" (model unavailable). Treat any gap as unconfirmed.`,
      severity: "medium",
      gap: "Tier C lookup failed.",
      resolved: false,
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const sourceUrl = raw.sourceUrl || raw.sourceLabel;
  await logTierCLookup({
    orgId: state.organizationId,
    query,
    resolved: Boolean(raw.resolved),
    sourceUrl,
    sessionId: state.request.sessionId,
  });

  const finding: Finding = {
    findingId: `f_web_${unit.workUnitId}`,
    kind: "compliance",
    category: "other_known_risk",
    status: "insufficient_evidence",
    claim: `[Unverified — not an authored CookieCare rule] ${raw.claim}`,
    evidence: [],
    severity: raw.severity,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    visibility: "user_facing",
    unverified: true,
    gap: raw.gap,
    sourceUrl,
    retrievedAt,
    ruleSourceTier: "C",
  };

  return { state, findings: [...findings, finding] };
}

async function logTierCLookup(args: {
  orgId?: string;
  query: string;
  resolved: boolean;
  sourceUrl?: string;
  sessionId?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO analysis_tier_c_log (org_id, query, resolved, source_url, session_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        args.orgId ?? null,
        args.query.slice(0, 2000),
        args.resolved,
        args.sourceUrl?.slice(0, 2000) ?? null,
        args.sessionId ?? null,
      ]
    );
  } catch (err) {
    console.warn("[webAssistedReference] tier-c log insert failed:", err);
  }
}
