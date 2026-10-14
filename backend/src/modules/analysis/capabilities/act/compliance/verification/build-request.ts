import type { VerificationRequest } from "../contracts/index.js";
export function buildVerificationPayload(r: VerificationRequest) {
  if (!r.check.rule)
    throw new Error("baseline_unavailable");
  return {
    checkId: r.check.checkId, ruleHash: r.check.rule.hash, bundleHash: r.bundle.hash,
    reviewScopeId: r.check.reviewScopeId, documents: r.check.documents, facetIds: r.check.facetIds, selectionReasons: r.check.selectionReasons, rule: r.check.rule,
    context: r.context, evidence: r.bundle
  };
}
