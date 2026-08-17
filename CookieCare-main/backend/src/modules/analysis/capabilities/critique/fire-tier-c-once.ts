import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { TierCCacheEntry } from "../../models/work-unit-outcome.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { webAssistedReference } from "../act/web-assisted-reference.js";
import { targetIdForUnit } from "./has-authored-content.js";

export async function fireTierCOnce(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): Promise<{ state: AnalysisState; entry: TierCCacheEntry; finding?: Finding }> {
  const cacheKey = targetIdForUnit(unit) ?? unit.workUnitId;
  const existing = state.tierCCache?.[cacheKey];
  if (existing) {
    return { state, entry: existing };
  }

  const query = String(unit.input.ruleId ?? unit.input.rowId ?? unit.input.query ?? cacheKey);
  const syntheticUnit: AnalysisWorkUnit = {
    workUnitId: `wu-tierc-${cacheKey.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
    tool: "web_assisted_reference",
    input: {
      query,
      instruction: state.request.instruction,
      docId: state.request.documentIds[0],
    },
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "done",
  };

  const priorFindings = state.findings;
  const result = await webAssistedReference(state, syntheticUnit, priorFindings);
  const webFinding = result.findings.find(
    (f) => f.workUnitId === syntheticUnit.workUnitId && f.unverified
  );
  const reliable = Boolean(webFinding?.sourceUrl && webFinding.status !== "insufficient_evidence");

  const entry: TierCCacheEntry = {
    reliable,
    claim: webFinding?.claim,
    sourceUrl: webFinding?.sourceUrl,
    findingId: webFinding?.findingId,
  };

  const tierCCache = { ...(state.tierCCache ?? {}), [cacheKey]: entry };

  return {
    state: { ...result.state, tierCCache, findings: priorFindings },
    entry,
    finding: webFinding,
  };
}

export function buildNotCoveredFinding(
  unit: AnalysisWorkUnit,
  targetId: string,
  details: string
): Finding {
  const isMatrix = targetId.includes(".right.");
  const articleMatch = targetId.match(/art(\d+)/i);
  const article = unit.input.article ? String(unit.input.article) : articleMatch?.[1];

  return {
    findingId: `f_not_covered_${unit.workUnitId}`,
    kind: "compliance",
    category: isMatrix ? "automated_decision_gap" : "other_known_risk",
    status: "not_covered",
    claim: article
      ? `Article ${article} could not be evaluated — not yet covered by an authored rule, and web lookup did not return a reliable source. (${details})`
      : `${targetId} could not be evaluated — not yet covered by an authored rule. (${details})`,
    evidence: [],
    severity: "medium",
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    visibility: "user_facing",
    ruleId: unit.input.ruleId ? String(unit.input.ruleId) : undefined,
    matrixRowId: unit.input.rowId ? String(unit.input.rowId) : isMatrix ? targetId : undefined,
    gap: "System coverage limitation — not a document compliance determination.",
    ruleSourceTier: "B",
    terminalStatus: "not_covered",
  };
}
