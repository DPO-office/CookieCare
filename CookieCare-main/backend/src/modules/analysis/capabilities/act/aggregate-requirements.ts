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
 * Assessments are keyed by PLAN requirement ids. Package-native finding stamps
 * (`duration`) join via alias equivalence — they do not create duplicate rows.
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
      ...enrichmentFromFindings(supporting),
    };
  });

  return {
    state: { ...state, requirementAssessments: assessments },
    findings: allFindings,
  };
}

/**
 * Locked assessment keys = PLAN requirement ids (no umbrella expansion into
 * orphan native duplicates). Leftover package-native finding stamps that
 * already alias a PLAN row are not emitted as extra assessments.
 */
function orderedCanonicalRequirementIds(
  findings: Finding[],
  state: AnalysisState
): string[] {
  const planIds = (state.intent?.requirements ?? []).map((req) => req.id);
  const findingReqIds = findings
    .map((f) => f.requirementId)
    .filter((id): id is string => Boolean(id));

  if (planIds.length > 0) {
    // Keep PLAN umbrellas as single rows; member findings join via aliases.
    return collapseToCanonicalRequirementIds(planIds, {
      expandUmbrellas: false,
    });
  }

  const fromFindings = collapseToCanonicalRequirementIds(findingReqIds, {
    expandUmbrellas: false,
  });
  return fromFindings;
}

/**
 * ACT-Phase 7 — copy VERIFY's enrichment fields from the finding(s) driving
 * this assessment onto the locked record. Only ever populated on
 * `verifiedByProposition` findings, so a requirement evaluated through the
 * old grouped-LLM path (no proofStandard authored yet) gets none of these —
 * a graceful, silent no-op rather than a change in its rendered output.
 */
function enrichmentFromFindings(
  supporting: Finding[]
): Pick<
  RequirementAssessment,
  "establishedBy" | "gapDescription" | "dependency" | "structuralNote" | "remediation"
> {
  const verified = supporting.filter((f) => f.verifiedByProposition);
  return {
    establishedBy: verified.find((f) => f.establishedBy)?.establishedBy,
    gapDescription: verified.find((f) => f.gapDescription)?.gapDescription,
    dependency: verified.find((f) => f.dependency)?.dependency,
    structuralNote: verified.find((f) => f.structuralNote)?.structuralNote,
    remediation: verified.find((f) => f.remediation)?.remediation,
  };
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
