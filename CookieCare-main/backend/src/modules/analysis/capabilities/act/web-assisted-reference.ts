import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
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
    },
    required: ["claim", "severity"],
  };

  let raw: { claim: string; gap?: string; severity: "low" | "medium" | "high"; sourceLabel?: string };
  try {
    raw = await executeJsonCompletion(
      [
        "The user named a legal standard that is NOT in CookieCare's authored skill/rule registry.",
        "Produce ONE clearly-unverified research note. Do not claim the document complies.",
        "Do not invent quotes from the document. If you mention the excerpt, paraphrase only.",
        `Unresolved standard: ${query}`,
        `User instruction: ${instruction}`,
        excerpt ? `Document excerpt:\n${excerpt}` : "No excerpt.",
        "Label this as unverified live research, not an authored compliance finding.",
      ].join("\n\n"),
      "You produce a clearly-labeled unverified research note. Never mix this with authored GDPR/rule findings.",
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
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

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
    sourceUrl: raw.sourceLabel,
  };

  return { state, findings: [...findings, finding] };
}
