import { createScorer, notScorable } from "@mastra/core/evals";
import { reviewCaseInputSchema, reviewCaseOutputSchema } from "./review-case-workflow.js";

/** Provisional reference accuracy; skipped cases stay out of the mean. */
export const gdprProvisionalAccuracyScorer = createScorer({
  id: "kb-gdpr-provisional-accuracy-v1",
  description: "Scores evidence-backed GDPR case verdicts against AI-drafted reference expectations; human review remains visible separately.",
  type: { input: reviewCaseInputSchema, output: reviewCaseOutputSchema },
}).generateScore(({ run }) => run.output.status === "pass" ? 1 :
  run.output.status === "fail" ? 0 : notScorable(`Case ${run.output.status}`))
  .generateReason(({ run }) => `Case ${run.output.caseId}: ${run.output.status}. Human review: ${run.output.humanReviewStatus}. ${run.output.reasons.join(" ")}`);
