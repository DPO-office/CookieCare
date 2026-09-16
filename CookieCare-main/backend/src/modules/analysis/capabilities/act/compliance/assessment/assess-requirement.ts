import type { RequirementStatus, VerificationRequest, VerificationResult } from "../contracts/index.js";
import { aggregateElements } from "./aggregate-elements.js";
export function assessRequirement(request: VerificationRequest, result: VerificationResult): RequirementStatus {
  return assessRequirementWithReason(request, result).status;
}
export interface AssessmentDecision {
  status: RequirementStatus;
  gate: string;
  details: Record<string, unknown>;
}
/** Same policy and branch order as Assess; exposes the actual stopping gate for replay. */
export function assessRequirementWithReason(request: VerificationRequest, result: VerificationResult): AssessmentDecision {
  const decide = (status: RequirementStatus, gate: string, details: Record<string, unknown> = {}): AssessmentDecision => ({ status, gate, details });
  if (!request.check.rule || result.kind !== "verified")
    return decide("verification_incomplete", !request.check.rule ? "baseline_unavailable" : "verification_not_validated", { baselineError: request.check.baselineError, result });
  const d = result.decision;

  const loadBearing = (reason: string): boolean => {
    if (!reason.startsWith("role_reassessment:")) return true;
    const elementId = reason.slice("role_reassessment:".length);
    const element = d.elements.find(e => e.elementId === elementId);
    return !element?.citations.some(c => c.use === "proof" && c.originalRole === "primary");
  };
  const reviewRequired = d.reviewRequired.filter(loadBearing);
  if (reviewRequired.length) {
    const humanReview = reviewRequired.includes("semantic_disagreement")
      || reviewRequired.includes("cross_rule_conflict")
      || reviewRequired.every(reason => reason.startsWith("role_reassessment:"));
    return decide(humanReview ? "judgment_required" : "cannot_determine", "review_unresolved", { reviewRequired });
  }

  if (d.applicability.state === "not_applicable" && d.elements.some(e => [...e.limitations, ...e.conflicts].some(c => c.materiality !== "immaterial")))
    return decide("cannot_determine", "not_applicable_with_material_concerns", { elements: d.elements });

  if (d.applicability.state === "not_applicable")
    return decide("not_applicable", "grounded_exclusion", { applicability: d.applicability });

  const relevant = new Set<string>();
  const collect = (node: typeof request.check.rule.aggregation): void => {
    if ("elementId" in node)
      relevant.add(node.elementId);
    else
      node.children.forEach(collect);
  };
  collect(request.check.rule.aggregation);

  const elements = d.elements.filter(e => relevant.has(e.elementId) && e.applicability.state !== "not_applicable");

  if (relevant.size > 0 && elements.length === 0)
    return decide("cannot_determine", "empty_applicable_group", { elements: d.elements });

  if (elements.some(e => e.conflicts.some(c => c.materiality === "material")) || d.elements.some(e => relevant.has(e.elementId) && e.state === "contradicted"))
    return decide("conflicting", "material_conflict", { elements });

  if (request.bundle.executionStatus !== "complete")
    return decide("cannot_determine", "investigation_execution_not_complete", { executionStatus: request.bundle.executionStatus, coverageReasons: request.bundle.coverageReasons, unestablishedElementIds: request.bundle.unestablishedElementIds });

  if (request.check.rule.relationshipScopes.length && elements.some(e =>
    (e.state === "supported" || e.state === "contradicted" || e.conflicts.some(c => c.materiality === "material")) &&
    e.actorScope.relationshipScope !== "unspecified" &&
    !request.check.rule!.relationshipScopes.includes(e.actorScope.relationshipScope)
  )) {
    return decide("cannot_determine", "actor_scope_unresolved", { allowed: request.check.rule.relationshipScopes, elements });
  }

  const coverageIssues = request.bundle.coverageIssues;
  const hasMaterialCoverageOmission = coverageIssues?.some(issue => issue.materiality === "material" && (!issue.elementIds.length || issue.elementIds.some(id => relevant.has(id)))) ?? false;
  const hasUnknownCoverage = (!coverageIssues && request.bundle.coverageReasons.length > 0) || (coverageIssues?.some(issue => issue.materiality === "unknown" && (!issue.elementIds.length || issue.elementIds.some(id => relevant.has(id)))) ?? false);

  const hasMaterialLimitations = elements.some(e => e.limitations.some(l => l.materiality === "material"));
  const hasUnknownLimitations = elements.some(e => e.limitations.some(l => l.materiality === "unknown") || e.conflicts.some(c => c.materiality === "unknown"));

  const hasMaterialDependencies = d.dependencies.some(dep => dep.materiality === "material" && (!dep.elementIds.length || dep.elementIds.some(id => relevant.has(id))) && request.bundle.dependencies.find(x => x.id === dep.id)?.state !== "resolved_internal");
  const hasUnknownDependencies = d.dependencies.some(dep => dep.materiality === "unknown" && (!dep.elementIds.length || dep.elementIds.some(id => relevant.has(id))) && request.bundle.dependencies.find(x => x.id === dep.id)?.state !== "resolved_internal");

  const aggregation = aggregateElements(request.check.rule.aggregation, d.elements, request.check.rule.elements);

  if (aggregation.state === "satisfied") {
    if (hasUnknownLimitations || hasUnknownDependencies || hasUnknownCoverage) {
      if (hasUnknownLimitations) return decide("cannot_determine", "material_or_unknown_concern", { elements });
      if (hasUnknownDependencies) return decide("cannot_determine", "unresolved_material_dependency", { decisions: d.dependencies, dependencies: request.bundle.dependencies, relevantElementIds: [...relevant] });
      return decide("cannot_determine", "coverage_materiality_unknown", { coverageReasons: request.bundle.coverageReasons });
    }
    if (hasMaterialLimitations || hasMaterialDependencies || hasMaterialCoverageOmission) {
      return decide("partial", "qualified_satisfaction", { aggregation, hasMaterialLimitations, hasMaterialDependencies, hasMaterialCoverageOmission });
    }
    return decide("present", "aggregation_satisfied", { aggregation });
  }

  if (aggregation.supported > 0) {
    return decide("partial", "aggregation_partial", { aggregation });
  }

  if (d.applicability.state === "unknown") {
    return decide("cannot_determine", "applicability_unknown", { applicability: d.applicability });
  }

  return decide("gap", "aggregation_shortfall", { aggregation });
}
