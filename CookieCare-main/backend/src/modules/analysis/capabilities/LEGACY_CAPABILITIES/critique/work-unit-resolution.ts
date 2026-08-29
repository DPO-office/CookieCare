import { createHash } from "node:crypto";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { CritiqueResult } from "../../../models/critique-report.js";
import type { Finding } from "../../../models/finding.js";
import type {
  AttemptRecord,
  FailureReason,
  TierCCacheEntry,
} from "../../../models/work-unit-outcome.js";
import type { AnalysisSkillConfig } from "../../../skills/runtime/catalog/types.js";
import { hasRegimeRule } from "../../../skills/runtime/catalog/registry.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import { webAssistedReference } from "../act/web-assisted-reference.js";

// --- has-authored-content ---

/** Resolve the authored target id for a work unit (rule, matrix row, or category). */
export function targetIdForUnit(unit: AnalysisWorkUnit): string | undefined {
  const ruleId = unit.input.ruleId ? String(unit.input.ruleId) : "";
  if (ruleId) return ruleId;
  const rowId = unit.input.rowId ? String(unit.input.rowId) : "";
  if (rowId) return rowId;
  const cats = unit.input.riskCategoryIds as string[] | undefined;
  if (cats?.length === 1) return cats[0];
  return undefined;
}

/** Whether any active skill declares authored content for this target. */
export function hasAuthoredContent(
  targetId: string | undefined,
  skills: AnalysisSkillConfig[]
): boolean {
  if (!targetId?.trim()) return true;

  if (targetId.startsWith("gdpr.") || targetId.includes(".art")) {
    const inActive = skills.some((skill) =>
      skill.regimeRules.some((rule) => rule.ruleId === targetId)
    );
    if (inActive) return true;
    return hasRegimeRule(targetId);
  }

  if (targetId.includes(".right.")) {
    return skills.some((skill) =>
      (skill.rightsMatrixRows ?? []).some((row) => row.rowId === targetId)
    );
  }

  return skills.some(
    (skill) =>
      skill.riskCategories.some((rc) => rc.category === targetId) ||
      skill.regimeRules.some((rule) => rule.findingCategory === targetId) ||
      skill.expectedClauses.some((ec) => ec.findingCategory === targetId)
  );
}

// --- output-hash ---

export function hashFindingOutput(finding: Finding | undefined): string {
  if (!finding) return "";
  const payload = [
    finding.claim,
    finding.status,
    finding.category,
    ...finding.evidence.map((ev) => ev.quotedText),
  ]
    .join("|")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function hashFindingsForUnit(
  findings: Finding[],
  workUnitId: string
): string {
  const unitFindings = findings.filter((f) => f.workUnitId === workUnitId);
  if (unitFindings.length === 0) return "no-findings";
  return createHash("sha256")
    .update(unitFindings.map((f) => hashFindingOutput(f)).sort().join(","))
    .digest("hex")
    .slice(0, 16);
}

// --- format-feedback ---

export function formatFeedback(
  reason: FailureReason,
  lastAttempt?: AttemptRecord
): string {
  switch (reason.kind) {
    case "verification_rejected":
      return `Previous attempt was rejected: ${reason.critiqueReason}. Address this specific issue — do not repeat the same reasoning.`;
    case "tool_execution_error":
      return `Previous attempt failed with: ${reason.error}. Retry the same evaluation.`;
    case "not_authored":
      return lastAttempt?.rejectionReason
        ? `Previous attempt: ${lastAttempt.rejectionReason}`
        : "";
    case "intent_mismatch":
      return reason.details
        ? `Previous pattern: ${reason.details}. Re-evaluate with tighter alignment to the instruction focus.`
        : "";
    default:
      return "";
  }
}

// --- classify-failure-reason ---

export interface UnitCritiqueContext {
  unit: AnalysisWorkUnit;
  unitResults: CritiqueResult[];
  skills: AnalysisSkillConfig[];
}

export function classifyFailureReason(ctx: UnitCritiqueContext): FailureReason {
  const { unit, unitResults, skills } = ctx;
  const targetId = targetIdForUnit(unit);

  if (unit.status === "failed") {
    return {
      kind: "tool_execution_error",
      error: unit.completionNote ?? "Work unit execution failed",
    };
  }

  const budgetExceeded = unitResults.some((r) =>
    r.detail?.includes("budget_exceeded")
  );
  if (budgetExceeded) {
    return {
      kind: "tool_execution_error",
      error: "budget_exceeded",
    };
  }

  const hasMissing = unitResults.some((r) => r.status === "missing");
  const failResults = unitResults.filter((r) => r.status === "fail");

  if (
    targetId &&
    !hasAuthoredContent(targetId, skills) &&
    (hasMissing ||
      failResults.some(
        (r) =>
          r.itemId.startsWith("regime:") ||
          r.itemId.startsWith("focus-") ||
          r.itemId.startsWith("fixplan:")
      ))
  ) {
    return {
      kind: "not_authored",
      details: `No active skill declares ${targetId}`,
    };
  }

  const rejection = failResults.find((r) => r.detail)?.detail;
  if (rejection) {
    return {
      kind: "verification_rejected",
      critiqueReason: rejection,
    };
  }

  if (hasMissing) {
    const missingDetail = unitResults.find((r) => r.status === "missing")?.detail;
    return {
      kind: "verification_rejected",
      critiqueReason: missingDetail ?? "Required finding missing for this work unit",
    };
  }

  return {
    kind: "intent_mismatch",
    details: "No specific rejection reason available",
  };
}

// --- fire-tier-c-once ---

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
