import crypto from "crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisWorkUnit,
  RequirementExecutionPath,
} from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type {
  ComplianceStatus,
  RequirementAssessment,
} from "../../models/requirement-assessment.js";
import {
  recommendationText,
  statusFromJudgement,
} from "../../models/requirement-assessment.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import {
  canonicalRequirementId,
  collapseToCanonicalRequirementIds,
  requirementIdsEquivalent,
} from "../../shared/requirement-identity.js";
import {
  deriveRequirementJudgement,
  findingsForRequirement,
} from "./requirement-status-policy.js";

/**
 * Build the locked RequirementAssessment view from Findings.
 * Writers may explain this object; they may not change its axes.
 *
 * Assessments are keyed by canonical requirement id so PLAN aliases
 * (`gdpr.article28.duration`) and package natives (`duration`) collapse
 * to one row.
 */
export function aggregateRequirements(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const unsupported = (
    (unit.input?.unsupportedRequirements as RequirementExecutionPath[] | undefined) ??
    state.plan?.requirementExecutionPaths?.filter((path) => path.status === "not_supported") ??
    []
  ).filter((path) => path.requirementId && !path.requirementId.startsWith("_dep:"));

  const extraFindings: Finding[] = [];
  for (const path of unsupported) {
    if (findings.some((f) => requirementIdsEquivalent(f.requirementId ?? "", path.requirementId))) {
      continue;
    }
    extraFindings.push({
      findingId: `f_unresolved_${path.requirementId}_${crypto.randomUUID().slice(0, 6)}`,
      kind: "compliance",
      category: "other_known_risk",
      status: "insufficient_evidence",
      claim:
        path.reason ??
        `No authored analysis package covers "${path.requirementId}".`,
      evidence: [],
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      visibility: "user_facing",
      requirementId: canonicalRequirementId(path.requirementId),
    });
  }

  const allFindings = [...findings, ...extraFindings];
  const requirementIds = orderedCanonicalRequirementIds(allFindings, state);

  const assessments: RequirementAssessment[] = requirementIds.map((requirementId) => {
    const supporting = findingsForRequirement(requirementId, allFindings, state);
    const judgement = deriveRequirementJudgement(supporting);
    const status = statusFromJudgement(judgement);
    const gapText = supporting.find((f) => f.gap)?.gap;
    return {
      requirementId,
      supportingFindingIds: supporting.map((f) => f.findingId),
      status,
      judgement,
      summary: buildSummary(supporting, status, judgement.compliance),
      recommendation: recommendationText(judgement.recommendationKind, gapText),
    };
  });

  return {
    state: { ...state, requirementAssessments: assessments },
    findings: allFindings,
  };
}

function orderedCanonicalRequirementIds(
  findings: Finding[],
  state: AnalysisState
): string[] {
  const planIds = (state.intent?.requirements ?? []).map((req) => req.id);
  const findingReqIds = findings
    .map((f) => f.requirementId)
    .filter((id): id is string => Boolean(id));

  const fromPlan = collapseToCanonicalRequirementIds(planIds, {
    expandUmbrellas: true,
    availableFindingRequirementIds: findingReqIds,
  });

  const seen = new Set(fromPlan);
  const ordered = [...fromPlan];

  for (const id of findingReqIds) {
    const canon = canonicalRequirementId(id);
    if (seen.has(canon)) continue;
    // Skip leftovers that are aliases of an already-emitted canonical row.
    if ([...seen].some((emitted) => requirementIdsEquivalent(emitted, id))) continue;
    seen.add(canon);
    ordered.push(canon);
  }
  return ordered;
}

function buildSummary(
  supporting: Finding[],
  status: RequirementAssessment["status"],
  compliance: ComplianceStatus
): string {
  const complianceFindings = supporting.filter((f) => f.kind !== "risk");
  const pool = complianceFindings.length > 0 ? complianceFindings : supporting;
  const covered = pool.find((f) => f.status === "present" && !f.gap);
  const namedWithGap = pool.find(
    (f) => f.status === "present" && Boolean(f.gap)
  );
  const gap = pool.find(
    (f) =>
      (f.status === "absent_expected" || f.kind === "risk") && (f.gap || f.claim)
  );
  if (compliance === "insufficient_evidence" || status === "cannot_determine") {
    return (
      pool[0]?.claim ??
      "The available evidence is insufficient to reach a conclusion."
    );
  }
  switch (status) {
    case "strong":
    case "adequate":
    case "covered":
      return covered?.claim ?? namedWithGap?.claim ?? "All required elements are supported.";
    case "gap":
    case "missing":
      return gap?.gap ?? gap?.claim ?? "The required element is absent.";
    case "conditional":
    case "partial":
      return [covered?.claim ?? namedWithGap?.claim, gap?.gap ?? gap?.claim ?? namedWithGap?.gap]
        .filter(Boolean)
        .join(" However, ");
    case "not_applicable":
      return pool[0]?.claim ?? "Outside the authored scope for this analysis.";
    default:
      return (
        pool[0]?.claim ??
        "The available evidence is insufficient to reach a conclusion."
      );
  }
}
