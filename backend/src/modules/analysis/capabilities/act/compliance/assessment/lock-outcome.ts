import { createHash } from "node:crypto";
import type { ComplianceCheckOutcome, VerificationRequest, VerificationResult } from "../contracts/index.js";
import { assessRequirementWithReason, type AssessmentDecision } from "./assess-requirement.js";
import { buildExplanation } from "./build-explanation.js";
export function lockOutcome(r: VerificationRequest, result: VerificationResult): ComplianceCheckOutcome {
  return lockOutcomeWithAudit(r, result).outcome;
}
export interface LockAudit {
  assessment: AssessmentDecision;
  validationErrors: string[];
  verificationResult: VerificationResult;
  decision: "assessment_accepted" | "incomplete_preserved";
}
/** Pure finalization: the runtime, not Lock, decides where to write this audit. */
export function lockOutcomeWithAudit(r: VerificationRequest, result: VerificationResult): { outcome: ComplianceCheckOutcome; audit: LockAudit } {
  const validationErrors: string[] = [];
  const verificationResult = result;
  if (result.kind === "verified") {
    const d = result.decision, ids = d.elements.map(e => e.elementId);
    const expected = r.check.rule?.elements.map(e => e.id) ?? [];
    if (d.checkId !== r.check.checkId || d.ruleHash !== r.check.rule?.hash || d.bundleHash !== r.bundle.hash)
      validationErrors.push("decision_identity_or_version_mismatch");
    if (r.bundle.checkId !== r.check.checkId || JSON.stringify(r.bundle.documentVersions) !== JSON.stringify(r.check.documents))
      validationErrors.push("bundle_scope_or_version_mismatch");
    if (![d.applicability,...d.elements.map(e=>e.applicability)].every(a=>
        a.state !== "not_applicable" || (a.basis.trim().length > 0 && (a.evidenceIds.length > 0 || a.contextFactIds.length > 0)
          && a.evidenceIds.every(id=>r.bundle.passages.some(p=>p.evidenceId===id))
          && a.contextFactIds.every(id=>r.context.facts.some(f=>f.id===id)))))
      validationErrors.push("ungrounded_not_applicable");
    if (!(ids.length === expected.length && new Set(ids).size === ids.length && expected.every(id => ids.includes(id))))
      validationErrors.push("element_set_mismatch");
    for (const e of d.elements) {
        if (e.state === "supported" && !e.citations.some(c => c.use === "proof"))
          validationErrors.push("support_without_proof:" + e.elementId);
        if (e.state === "contradicted" && !e.citations.some(c => c.use === "conflict"))
          validationErrors.push("contradiction_without_evidence:" + e.elementId);
        for (const c of e.citations) {
          const p = r.bundle.passages.find(p => p.evidenceId === c.evidenceId);
          if (!(p && p.documentId === c.documentId && c.range[0] >= p.range[0] && c.range[1] <= p.range[1] && p.text.slice(c.range[0] - p.range[0], c.range[1] - p.range[0]) === c.quote))
            validationErrors.push("source_citation_mismatch:" + e.elementId + ":" + c.evidenceId);
        }
    }
    if (validationErrors.length)
      result = { kind: "incomplete", reason: "lock_validation_failed", errors: [], attempts: result.attempts };
  }
  const assessment = assessRequirementWithReason(r, result), status = assessment.status;
  const audit: LockAudit = { assessment, validationErrors, verificationResult, decision: result.kind === "verified" && status !== "verification_incomplete" ? "assessment_accepted" : "incomplete_preserved" };
  const outcomeId = "outcome:" + r.check.checkId;
  const evidence = result.kind === "verified" ? result.decision.elements.flatMap(e => e.citations) : [...(result.validatedEvidence ?? [])];
  // Retain source-validated related evidence even when semantic verification fails.
  for (const p of r.bundle.passages)
    if (!evidence.some(c => c.evidenceId === p.evidenceId))
      evidence.push({
        evidenceId: p.evidenceId, documentId: p.documentId, nodeId: p.nodeId, quote: p.text, range: p.range, path: p.path,
        originalRole: p.role, use: "related", explanation: p.reason || "Located during investigation; sufficiency is not established.",
      });
  const common = {
    outcomeId, check: r.check, bundle: r.bundle, evidence,
    reasonCodes: result.kind === "incomplete" ? [result.reason] : [status, ...result.decision.reviewRequired],
    explanation: buildExplanation(r, result, status)
  };
  if (result.kind === "verified" && status !== "verification_incomplete")
    return { audit, outcome: {
      ...common, kind: "assessment", status, verification: result.decision,
      lockedAssessmentId: "lock:" + createHash("sha256").update(JSON.stringify([outcomeId, r.bundle.hash, result.decision, status])).digest("hex").slice(0, 24),
    } };
  return { audit, outcome: { ...common, kind: "incomplete", status: "verification_incomplete",
    validatedElements: result.kind === "incomplete" ? result.validatedElements : undefined } };
}
