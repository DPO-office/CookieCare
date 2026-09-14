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
  // An evidence-role reassessment (the model used a supporting passage as proof)
  // is only load-bearing when it is the element's SOLE support. If the element
  // already has independent primary proof, the reassessment cannot change the
  // outcome, so it must not flip a stable verdict to judgment_required — this is
  // the main source of same-document run-to-run instability. Drop such flags and
  // let aggregation decide.
  const loadBearing = (reason: string): boolean => {
    if (!reason.startsWith("role_reassessment:")) return true;
    const elementId = reason.slice("role_reassessment:".length);
    const element = d.elements.find(e => e.elementId === elementId);
    return !element?.citations.some(c => c.use === "proof" && c.originalRole === "primary");
  };
  const reviewRequired = d.reviewRequired.filter(loadBearing);
  if (reviewRequired.length) {
    // A flagged review means a human should look, not that the evidence is
    // insufficient. Disagreement, cross-rule conflict, and a load-bearing
    // reassessment are "judgment_required"; only a review that could not run at
    // all leaves us unable to determine.
    const humanReview = reviewRequired.includes("semantic_disagreement")
      || reviewRequired.includes("cross_rule_conflict")
      || reviewRequired.every(reason => reason.startsWith("role_reassessment:"));
    return decide(humanReview ? "judgment_required" : "cannot_determine", "review_unresolved", { reviewRequired });
  }
  if (d.applicability.state === "unknown")
    return decide("cannot_determine", "applicability_unknown", { applicability: d.applicability });
  if (d.applicability.state === "not_applicable" && d.elements.some(e=>[...e.limitations,...e.conflicts].some(c=>c.materiality!=="immaterial")))
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
  const elements=d.elements.filter(e=>relevant.has(e.elementId) && e.applicability.state!=="not_applicable");
  if (elements.some(e=>e.limitations.some(l=>l.materiality!=="immaterial") || e.conflicts.some(c=>c.materiality==="unknown"))) return decide("cannot_determine", "material_or_unknown_concern", { elements });
  if (request.check.rule.relationshipScopes.length && elements.some(e=>(e.state==="supported" || e.state==="contradicted" || e.conflicts.some(c=>c.materiality==="material")) && !request.check.rule!.relationshipScopes.includes(e.actorScope.relationshipScope))) return decide("cannot_determine", "actor_scope_unresolved", { allowed: request.check.rule.relationshipScopes, elements });
  if (elements.some(e=>e.conflicts.some(c=>c.materiality==="material"))) return decide("conflicting", "material_conflict", { elements });
  const material = d.dependencies.some(dep => dep.materiality !== "immaterial" && (!dep.elementIds.length || dep.elementIds.some(id => relevant.has(id))) && request.bundle.dependencies.find(x => x.id === dep.id)?.state !== "resolved_internal");
  if (material)
    return decide("cannot_determine", "unresolved_material_dependency", { decisions: d.dependencies, dependencies: request.bundle.dependencies, relevantElementIds: [...relevant] });
  if (d.elements.some(e => relevant.has(e.elementId) && e.state === "contradicted"))
    return decide("conflicting", "contradicted_element", { elements });
  if (request.bundle.executionStatus !== "complete")
    return decide("cannot_determine", "investigation_execution_not_complete", { executionStatus: request.bundle.executionStatus, coverageReasons: request.bundle.coverageReasons, unestablishedElementIds: request.bundle.unestablishedElementIds });
  const coverageIssues = request.bundle.coverageIssues;
  if (coverageIssues?.some(issue => issue.materiality !== "immaterial" && (!issue.elementIds.length || issue.elementIds.some(id => relevant.has(id)))))
    return decide("cannot_determine", "material_coverage_omission", { coverageIssues });
  // An old string-only exclusion has no reliable materiality. Do not silently
  // infer that historical coverage was adequate.
  if (!coverageIssues && request.bundle.coverageReasons.length)
    return decide("cannot_determine", "coverage_materiality_unknown", { coverageReasons: request.bundle.coverageReasons });
  const aggregation = aggregateElements(request.check.rule.aggregation, d.elements);
  if (aggregation.state === "unknown" || aggregation.state === "excluded")
    return decide("cannot_determine", "aggregation_unresolved", { aggregation });
  if (aggregation.state === "satisfied")
    return decide("present", "aggregation_satisfied", { aggregation });
  return decide(aggregation.supported ? "partial" : "gap", "aggregation_shortfall", { aggregation });
}
