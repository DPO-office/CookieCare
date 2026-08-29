import type { Finding } from "../../../models/finding.js";
import type {
  ComplianceStatus,
  EvidenceState,
  MaterialityLevel,
  ReferenceBinding,
  RequirementJudgement,
  RequirementStatus,
} from "../../../models/requirement-assessment.js";
import {
  statusFromJudgement,
  withRecommendationKind,
} from "../../../models/requirement-assessment.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import { findingsLinkedToRequirement } from "../../../shared/article-linkage.js";
import { findingSupportsRequirement } from "../../../shared/requirement-identity.js";

/**
 * Deterministic requirement-status aggregation.
 *
 * Compliance findings drive the legal verdict. Risk findings may raise
 * materiality but must not turn Present into Partial solely by existing
 * as kind=risk + status=present.
 */

function isComplianceFinding(f: Finding): boolean {
  return f.kind !== "risk";
}

function isRiskFinding(f: Finding): boolean {
  return f.kind === "risk";
}

function isSupporting(f: Finding): boolean {
  return f.status === "present";
}

/**
 * Compliance-channel gaps only. Bare risk findings are annotations, not
 * compliance gaps — even when severity is medium/high.
 */
function isComplianceGap(f: Finding): boolean {
  if (isRiskFinding(f)) return false;
  if (isReferencedElsewhereClaim(f)) return false;
  if (f.status === "absent_expected") return true;
  if (f.gap && f.matrixAddressing === "named") return true;
  if (f.matrixAddressing === "generic" || f.matrixAddressing === "absent") {
    return Boolean(f.gap);
  }
  return false;
}

export const REFERENCED_ELSEWHERE_CLAIM_RE =
  /\b(referenced (?:in|to|elsewhere)|incorporated by reference|see (?:the )?(?:annex|schedule|appendix|exhibit|sow|statement of work)|cannot (?:be )?(?:fully )?verif(?:y|ied)|substance (?:is|lives) (?:in|elsewhere))\b/i;

export function isReferencedElsewhereClaim(f: Finding): boolean {
  return REFERENCED_ELSEWHERE_CLAIM_RE.test(`${f.claim} ${f.gap ?? ""}`);
}

function isIndeterminate(f: Finding): boolean {
  return f.status === "insufficient_evidence";
}

function isNotApplicable(f: Finding): boolean {
  return f.status === "not_covered";
}

function isTruncatedFinding(f: Finding): boolean {
  if (f.judgement?.evidenceState === "truncated") return true;
  return /\b(truncat|unread remainder|heading[- ]only|prefix)\b/i.test(
    `${f.claim} ${f.gap ?? ""}`
  );
}

function quoteLength(findings: Finding[]): number {
  return Math.max(
    0,
    ...findings.map((f) => f.evidence[0]?.quotedText?.trim().length ?? 0)
  );
}

function bindingFromFindings(findings: Finding[]): ReferenceBinding {
  const stamped = findings.find((f) => f.judgement?.referenceBinding)?.judgement
    ?.referenceBinding;
  if (stamped) return stamped;
  const annex = findings.filter(isReferencedElsewhereClaim);
  if (annex.length === 0) return "none";
  const supporting = findings.filter(isSupporting);
  const text = annex.map((f) => `${f.claim} ${f.gap ?? ""}`).join(" ");
  const specific =
    /\b(incorporated by reference|shall (?:apply|form part)|set out in (?:the )?(?:annex|schedule|exhibit)|as (?:specified|set forth) in)\b/i.test(
      text
    );
  if (supporting.length > 0 && specific) return "binding";
  return "floating";
}

function evidenceStateFromFindings(findings: Finding[]): EvidenceState {
  const stamped = findings.find((f) => f.judgement?.evidenceState)?.judgement
    ?.evidenceState;
  if (stamped) return stamped;
  if (findings.some(isTruncatedFinding)) return "truncated";
  if (findings.some(isReferencedElsewhereClaim)) return "incorporated";
  if (findings.every((f) => f.status === "insufficient_evidence" || f.status === "not_covered")) {
    return "not_found";
  }
  if (findings.some((f) => f.status === "present" && (f.evidence[0]?.quotedText?.trim() ?? "").length > 0)) {
    return "direct";
  }
  if (findings.some(isIndeterminate)) return "not_found";
  return "direct";
}

function complianceFromFindings(findings: Finding[]): ComplianceStatus {
  if (findings.length === 0) return "insufficient_evidence";

  // When every compliance finding agrees on a stamped compliance axis, use it.
  // Never take a single finding's judgement when siblings disagree.
  const stampedValues = findings
    .map((f) => f.judgement?.compliance)
    .filter((c): c is ComplianceStatus => Boolean(c));
  if (stampedValues.length === findings.length && stampedValues.length > 0) {
    const unique = new Set(stampedValues);
    if (unique.size === 1) return stampedValues[0]!;
  }

  const supporting = findings.filter(isSupporting);
  const gaps = findings.filter(isComplianceGap);
  const annexDependent = findings.filter(isReferencedElsewhereClaim);
  const indeterminate = findings.filter(
    (f) => isIndeterminate(f) && !isReferencedElsewhereClaim(f)
  );
  const notApplicable = findings.filter(isNotApplicable);
  const truncated = findings.some(isTruncatedFinding);
  const binding = bindingFromFindings(findings);

  if (truncated && supporting.length === 0) return "insufficient_evidence";

  if (supporting.length > 0 && gaps.length > 0) return "partial";

  if (annexDependent.length > 0 && supporting.length === 0 && gaps.length === 0) {
    return binding === "binding" ? "present" : "insufficient_evidence";
  }

  if (supporting.length === 0 && gaps.length === 0 && indeterminate.length > 0) {
    return "insufficient_evidence";
  }

  if (gaps.length > 0 && supporting.length === 0) return "gap";

  if (supporting.length > 0 && indeterminate.length > 0) return "partial";

  if (supporting.length > 0) return "present";

  if (notApplicable.length > 0) return "not_applicable";

  return "insufficient_evidence";
}

function materialityFromFindings(
  complianceFindings: Finding[],
  riskFindings: Finding[],
  compliance: ComplianceStatus
): MaterialityLevel {
  const stampedCompliance = complianceFindings.find((f) => f.judgement?.materiality)
    ?.judgement?.materiality;
  const highRisk = riskFindings.some(
    (f) => f.severity === "high" || f.severity === "medium"
  );
  if (compliance === "gap") return "high";
  if (highRisk) return stampedCompliance === "high" ? "high" : "high";
  if (stampedCompliance) return stampedCompliance;
  if (compliance === "partial") return "medium";
  if (compliance === "insufficient_evidence") return "medium";
  return "low";
}

function pickNli(complianceFindings: Finding[]): RequirementJudgement["nli"] {
  const entailed = complianceFindings.find((f) => f.judgement?.nli === "entailed");
  if (entailed?.judgement?.nli) return entailed.judgement.nli;
  return complianceFindings.find((f) => f.judgement?.nli)?.judgement?.nli;
}

/**
 * Lock requirement judgement from supporting findings.
 * Compliance channel and risk channel are merged deterministically — never
 * "first stamped judgement wins" across a mixed support set.
 */
export function deriveRequirementJudgement(findings: Finding[]): RequirementJudgement {
  const complianceFindings = findings.filter(isComplianceFinding);
  const riskFindings = findings.filter(isRiskFinding);
  const channel =
    complianceFindings.length > 0 ? complianceFindings : [];

  const compliance = complianceFromFindings(channel);
  const evidenceState = evidenceStateFromFindings(
    channel.length > 0 ? channel : findings
  );
  const referenceBinding = bindingFromFindings(
    channel.length > 0 ? channel : findings
  );
  const supporting = channel.filter(isSupporting);
  const quoteLen = quoteLength(supporting);
  const gaps = channel.filter(isComplianceGap);
  const draftingQuality =
    compliance === "present" || compliance === "partial"
      ? quoteLen >= 80 && gaps.length === 0
        ? "clean"
        : gaps.length > 0
          ? "could_be_clearer"
          : "clean"
      : undefined;
  const evidenceConfidence: RequirementJudgement["evidenceConfidence"] =
    quoteLen >= 80 && evidenceState === "direct"
      ? "high"
      : quoteLen > 0 || supporting.length > 0
        ? "medium"
        : "low";

  return withRecommendationKind({
    compliance,
    evidenceState,
    referenceBinding,
    evidenceConfidence,
    draftingQuality,
    materiality: materialityFromFindings(channel, riskFindings, compliance),
    nli: pickNli(channel),
  });
}

export function deriveRequirementStatus(findings: Finding[]): RequirementStatus {
  return statusFromJudgement(deriveRequirementJudgement(findings));
}

/**
 * Prefer explicit / alias-equivalent `Finding.requirementId` stamps, then
 * whole-article unstamped joins when applicable.
 *
 * Authority: when package compliance findings exist for a requirement, they
 * alone determine the compliance channel. Unstamped risk and leftover rule
 * noise cannot fill or empty a packaged PLAN row. Stamped risk may still
 * annotate materiality via deriveRequirementJudgement.
 */
export function findingsForRequirement(
  requirementId: string,
  findings: Finding[],
  state?: AnalysisState
): Finding[] {
  const linked = state
    ? findingsLinkedToRequirement(requirementId, findings, state)
    : findings.filter((f) =>
        findingSupportsRequirement(f.requirementId, requirementId)
      );

  const packageCompliance = linked.filter(
    (f) => f.kind === "compliance" && Boolean(f.packageId)
  );
  if (packageCompliance.length > 0) {
    const stampedRisk = linked.filter(
      (f) =>
        f.kind === "risk" &&
        findingSupportsRequirement(f.requirementId, requirementId)
    );
    return [...packageCompliance, ...stampedRisk];
  }

  // Never let unstamped risk attach to a particular / topic requirement.
  return linked.filter(
    (f) => !(f.kind === "risk" && !f.requirementId)
  );
}
