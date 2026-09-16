import type { CompletionClient, VerificationRequest, VerificationResult } from "../contracts/index.js";
import { verifyRequirement } from "./verify-requirement.js";
import { traceVerification, verificationDifferences, type VerificationTrace } from "../diagnostics/index.js";
export async function reviewDecision(r: VerificationRequest, first: VerificationResult, complete: CompletionClient, signal: AbortSignal, trace?: VerificationTrace, extraPrompt = ""): Promise<VerificationResult> {
  if (first.kind !== "verified" || !first.decision.reviewRequired.length)
    return first;
  const reviewTrace = trace ? { ...trace, phase: trace.phase === "cross_review" ? "cross_review" as const : "review" as const } : undefined;
  traceVerification(reviewTrace, r, "review.started", { reasons: first.decision.reviewRequired, first });
  const suffix = "\nIndependently review concerns: " + JSON.stringify(first.decision.reviewRequired) + ". Read the source afresh; do not prefer positive conclusions." + extraPrompt;
  const second = await verifyRequirement(r, complete, signal, 120000, reviewTrace, suffix);
  if (second.kind !== "verified") {
    traceVerification(reviewTrace, r, "review.unavailable", { first, second });
    return { ...first, decision: { ...first.decision, reviewRequired: ["review_unavailable"] } };
  }
  const signature = (v: typeof first) => JSON.stringify({
    applicability: v.decision.applicability.state,
    elements: [...v.decision.elements].sort((a, b) => a.elementId.localeCompare(b.elementId)).map(e => [
      e.elementId, e.state, e.applicability.state, e.actorScope.relationshipScope,
      e.limitations.filter(c=>c.materiality==="material").map(c=>[c.materiality,[...c.evidenceIds].sort()]).sort(),
      e.conflicts.filter(c=>c.materiality==="material").map(c=>[c.materiality,[...c.evidenceIds].sort()]).sort(),
    ]),
    dependencies: [...v.decision.dependencies].filter(d=>d.materiality==="material")
      .sort((a, b) => a.id.localeCompare(b.id)).map(d => [d.id, d.materiality, [...d.elementIds].sort()])
  });
  const firstSignature = signature(first), secondSignature = signature(second);
  traceVerification(reviewTrace, r, "review.comparison", {
    first, second, agree: firstSignature === secondSignature,
    differences: verificationDifferences(JSON.parse(firstSignature), JSON.parse(secondSignature)),
  });
  if (firstSignature !== secondSignature)
    return { ...first, decision: { ...first.decision, reviewRequired: ["semantic_disagreement"] } };
  return { ...second, attempts: first.attempts + second.attempts, decision: { ...second.decision, reviewRequired: [] } };
}
