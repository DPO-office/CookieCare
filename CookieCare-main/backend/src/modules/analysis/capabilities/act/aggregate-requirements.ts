import crypto from "crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisExecutionState } from "../../models/analysis-execution.js";
import { isAnalysisExecutionIncomplete } from "../../models/analysis-execution.js";
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
  const facetId = unit.facetId ??
    (typeof unit.input?.facetId === "string" ? unit.input.facetId : undefined);
  const branch = facetId
    ? state.plan?.branches?.find((candidate) => candidate.facetId === facetId)
    : undefined;
  const scopedFindings = facetId
    ? findings.filter((finding) => finding.facetId === facetId)
    : findings;
  const scopedState: AnalysisState = branch
    ? {
        ...state,
        intent: branch.intent,
        plan: state.plan
          ? {
              ...state.plan,
              intent: branch.intent,
              focus: branch.focus,
              reportSpec: branch.reportSpec,
              requirementBindings: branch.requirementBindings,
              requirementExecutionPaths: branch.requirementExecutionPaths,
            }
          : state.plan,
      }
    : state;
  const unsupported = (
    (unit.input?.unsupportedRequirements as RequirementExecutionPath[] | undefined) ??
    scopedState.plan?.requirementExecutionPaths?.filter((path) => path.status === "not_supported") ??
    []
  ).filter((path) => path.requirementId && !path.requirementId.startsWith("_dep:"));

  const extraFindings: Finding[] = [];
  for (const path of unsupported) {
    if (scopedFindings.some((f) => requirementIdsEquivalent(f.requirementId ?? "", path.requirementId))) {
      continue;
    }
    extraFindings.push({
      findingId: `f_unresolved_${path.requirementId}_${crypto.randomUUID().slice(0, 6)}`,
      facetId,
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

  const branchFindings = [...scopedFindings, ...extraFindings];
  const allFindings = [...findings, ...extraFindings];
  const requirementIds = orderedCanonicalRequirementIds(branchFindings, scopedState);

  const assessments: RequirementAssessment[] = requirementIds.map((requirementId) => {
    const supporting = findingsForRequirement(requirementId, branchFindings, scopedState);
    const baseJudgement = deriveRequirementJudgement(supporting);
    const coverage = bindingCoverage(scopedState, branchFindings, requirementId);
    const analysisExecution = analysisExecutionFromFindings(supporting);
    const executionIncomplete = isAnalysisExecutionIncomplete(analysisExecution);
    const judgement = executionIncomplete
      ? {
          ...baseJudgement,
          compliance: "insufficient_evidence" as const,
          evidenceState: "unavailable" as const,
          evidenceConfidence: "low" as const,
          recommendationKind: "confirm" as const,
        }
      : coverage.incomplete
      ? {
          ...baseJudgement,
          compliance: supporting.length > 0 ? "partial" as const : "insufficient_evidence" as const,
          evidenceState: "unavailable" as const,
          evidenceConfidence: "low" as const,
          recommendationKind: "obtain" as const,
        }
      : baseJudgement;
    const status = statusFromJudgement(judgement);
    const gapText = supporting.find((f) => f.gap)?.gap;
    return {
      requirementId,
      facetId,
      supportingFindingIds: supporting.map((f) => f.findingId),
      analysisExecution,
      status,
      judgement,
      summary: executionIncomplete
        ? analysisExecutionSummary(analysisExecution)
        : coverage.incomplete
        ? technicalCoverageSummary(coverage.observed, coverage.expected)
        : buildSummary(supporting, status, judgement.compliance),
      recommendation: executionIncomplete
        ? "Retry this requirement. The analysis did not complete, so no conclusion about the document was reached."
        : coverage.incomplete
        ? "Retry the incomplete analysis. This is a technical coverage failure, not evidence that the document lacks the provision."
        : recommendationText(judgement.recommendationKind, gapText),
      ...enrichmentFromFindings(supporting),
    };
  });

  // Preserve the evaluated children of a genuinely broad/composite request.
  // Two-child merges (for example data + data-subject categories) remain one
  // requested row; larger package umbrellas expose their native checks so a
  // parent summary cannot erase several material gaps.
  const componentAssessments = componentRequirementAssessments(
    scopedState,
    branchFindings,
    requirementIds
  ).map((assessment) => ({ ...assessment, facetId }));

  const branchAssessments = [...assessments, ...componentAssessments];
  const preservedAssessments = facetId
    ? (state.requirementAssessments ?? []).filter(
        (assessment) => assessment.facetId !== facetId
      )
    : [];

  return {
    state: {
      ...state,
      requirementAssessments: [...preservedAssessments, ...branchAssessments],
    },
    findings: allFindings,
  };
}

function componentRequirementAssessments(
  state: AnalysisState,
  findings: Finding[],
  existingRequirementIds: string[]
): RequirementAssessment[] {
  const byRequest = new Map<string, string[]>();
  for (const binding of state.plan?.requirementBindings ?? []) {
    const list = byRequest.get(binding.requestRequirementId) ?? [];
    if (!list.some((id) => requirementIdsEquivalent(id, binding.nativeRequirementId))) {
      list.push(binding.nativeRequirementId);
    }
    byRequest.set(binding.requestRequirementId, list);
  }

  const existing = new Set(existingRequirementIds.map(canonicalRequirementId));
  const out: RequirementAssessment[] = [];
  for (const [requestId, nativeIds] of byRequest) {
    if (nativeIds.length < 3) continue;
    for (const nativeId of nativeIds) {
      const canonicalNative = canonicalRequirementId(nativeId);
      if (existing.has(canonicalNative)) continue;
      const supporting = findings.filter(
        (finding) =>
          finding.requirementId != null &&
          requirementIdsEquivalent(finding.requirementId, nativeId)
      );
      if (supporting.length === 0) {
        out.push({
          requirementId: nativeId,
          componentOfRequirementId: requestId,
          supportingFindingIds: [],
          status: "cannot_determine",
          judgement: {
            compliance: "insufficient_evidence",
            evidenceState: "unavailable",
            referenceBinding: "none",
            evidenceConfidence: "low",
            draftingQuality: "clean",
            materiality: "low",
            recommendationKind: "obtain",
          },
          summary: "This component was not evaluated because its analysis path did not complete. No legal conclusion was reached.",
          recommendation: "Retry the incomplete analysis. Do not treat this technical failure as a document gap.",
        });
        existing.add(canonicalNative);
        continue;
      }
      const judgement = deriveRequirementJudgement(supporting);
      const analysisExecution = analysisExecutionFromFindings(supporting);
      const lockedJudgement = isAnalysisExecutionIncomplete(analysisExecution)
        ? {
            ...judgement,
            compliance: "insufficient_evidence" as const,
            evidenceState: "unavailable" as const,
            evidenceConfidence: "low" as const,
            recommendationKind: "confirm" as const,
          }
        : judgement;
      const status = statusFromJudgement(lockedJudgement);
      const gapText = supporting.find((finding) => finding.gap)?.gap;
      out.push({
        requirementId: nativeId,
        componentOfRequirementId: requestId,
        supportingFindingIds: supporting.map((finding) => finding.findingId),
        analysisExecution,
        status,
        judgement: lockedJudgement,
        summary: isAnalysisExecutionIncomplete(analysisExecution)
          ? analysisExecutionSummary(analysisExecution)
          : buildSummary(supporting, status, lockedJudgement.compliance),
        recommendation: isAnalysisExecutionIncomplete(analysisExecution)
          ? "Retry this requirement. The analysis did not complete, so no conclusion about the document was reached."
          : recommendationText(lockedJudgement.recommendationKind, gapText),
        ...enrichmentFromFindings(supporting),
      });
      existing.add(canonicalNative);
    }
  }
  return out;
}

export function analysisExecutionFromFindings(
  findings: Finding[]
): AnalysisExecutionState | undefined {
  const incomplete = findings
    .map((finding) => finding.analysisExecution)
    .filter(
      (execution): execution is AnalysisExecutionState =>
        isAnalysisExecutionIncomplete(execution)
    );
  if (incomplete.length === 0) return undefined;
  return (
    incomplete.find((execution) => execution.status === "timed_out") ??
    incomplete.find((execution) => execution.status === "failed") ??
    incomplete[0]
  );
}

function analysisExecutionSummary(execution: AnalysisExecutionState | undefined): string {
  if (execution?.status === "timed_out") {
    return "Analysis incomplete - verification timed out before a document conclusion could be reached.";
  }
  if (execution?.status === "not_run") {
    return "Analysis incomplete - this requirement was not evaluated, so no document conclusion is available.";
  }
  return "Analysis incomplete - verification failed before a document conclusion could be reached.";
}

function bindingCoverage(
  state: AnalysisState,
  findings: Finding[],
  requestId: string
): { expected: number; observed: number; incomplete: boolean } {
  const bindings = (state.plan?.requirementBindings ?? []).filter((binding) =>
    requirementIdsEquivalent(binding.requestRequirementId, requestId)
  );
  const expectedNativeIds = [...new Set(bindings.map((binding) => binding.nativeRequirementId))];
  if (expectedNativeIds.length <= 1) {
    return {
      expected: expectedNativeIds.length,
      observed: expectedNativeIds.length,
      incomplete: false,
    };
  }
  const observed = expectedNativeIds.filter((nativeId) =>
    findings.some(
      (finding) =>
        finding.requirementId != null &&
        requirementIdsEquivalent(finding.requirementId, nativeId) &&
        !isAnalysisExecutionIncomplete(finding.analysisExecution)
    )
  ).length;
  return {
    expected: expectedNativeIds.length,
    observed,
    incomplete: observed < expectedNativeIds.length,
  };
}

function technicalCoverageSummary(observed: number, expected: number): string {
  return `Analysis completed for ${observed} of ${expected} bound components. The remaining component evaluations did not complete, so no overall legal conclusion is available.`;
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
