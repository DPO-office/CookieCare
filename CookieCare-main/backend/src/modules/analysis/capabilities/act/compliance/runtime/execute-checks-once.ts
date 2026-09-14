import type { ComplianceCheck, VerificationRequest } from "../contracts/index.js";
import { verifyRequirement } from "../verification/index.js";
import { lockOutcomeWithAudit } from "../assessment/index.js";
import type { VerificationTrace } from "../diagnostics/index.js";
import { runBudgeted } from "./budget.js";
import type { ComplianceRun } from "./create-run.js";
import type { CheckExecutionServices } from "./check-execution-services.js";

/**
 * Canonical one-call verification executor.
 *
 * Exactly one initial LLM verification call per check (all proof elements judged
 * together), plus at most one repair inside `verifyRequirement`. No additional
 * investigation, no cross-rule pass, no second-opinion review: a model-flagged
 * `reviewRequired` is carried into the decision and resolved deterministically by
 * `assessRequirement` (→ `judgment_required`). Total model calls are therefore
 * bounded by `N + repairCount`. Every check is locked and finished on the ledger,
 * so every selected check yields exactly one terminal outcome.
 */
export async function executeChecksOnce(run: ComplianceRun, services: Pick<CheckExecutionServices, "bundle">): Promise<void> {
  const checks = [...run.ledger.checks.values()];
  const record = (event: string, check: ComplianceCheck, payload: Record<string, unknown> = {}) => run.emit({ event, analysisId: run.analysisId, timestamp: new Date(run.now()).toISOString(), checkId: check.checkId, requirementId: check.ruleId, ...payload });
  const traceFor = (check: ComplianceCheck): VerificationTrace => ({
    phase: "verify", round: 0, now: run.now, emit: (event, payload) => record("compliance.verification." + event, check, payload),
  });
  const queuedAt = run.now();
  const completeFor = (check: ComplianceCheck) => (prompt: string, schema: Record<string, unknown>, signal: AbortSignal) =>
    run.scheduleCall(() => run.complete(prompt, schema, signal), signal, { checkId: check.checkId, requirementId: check.ruleId, stage: "verification" });

  const completed = await runBudgeted(checks, run.budget, async (check, signal) => {
    const checkStartedAt = run.now();
    record("compliance.verification.check.started", check, { queueMs: checkStartedAt - queuedAt });
    const request: VerificationRequest = {
      check, bundle: services.bundle(check), context: {
        ...run.context, questions: run.context.questions.filter(q => !q.id.startsWith("facet:") || check.facetIds.includes(q.id.slice(6))),
      },
    };
    record("compliance.verify.input", check, { bundleId: request.bundle.bundleId, bundleHash: request.bundle.hash, ruleHash: check.rule?.hash, elementIds: check.rule?.elements.map(e => e.id) ?? [], evidenceRoles: request.bundle.passages.map(p => [p.evidenceId, p.role]) });
    const result = await verifyRequirement(request, completeFor(check), signal, 120000, traceFor(check));
    record("compliance.verification.check.finished", check, { elapsedMs: run.now() - checkStartedAt, result, requestBundleHash: request.bundle.hash });
    return { request, result };
  }, (check, reason) => {
    record("compliance.verification.check.execution_failed", check, { reason, elapsedSinceQueueMs: run.now() - queuedAt });
    return {
      request: { check, bundle: services.bundle(check), context: run.context },
      result: { kind: "incomplete" as const, reason: reason.includes("budget") ? "budget_exhausted" : "verification_failed", errors: [reason], attempts: 0 },
    };
  }, run.now);

  for (const { request, result } of completed) {
    const { outcome, audit } = lockOutcomeWithAudit(request, result);
    record("compliance.lock.audit", request.check, { ...audit, bundleHash: request.bundle.hash, outcomeId: outcome.outcomeId, status: outcome.status });
    run.ledger.finish(outcome);
    record("compliance.verify.outcome", request.check, { outcomeId: outcome.outcomeId, kind: outcome.kind, status: outcome.status, reasonCodes: outcome.reasonCodes, bundleHash: request.bundle.hash, verification: outcome.verification });
  }
  const reconciliation = run.ledger.reconcile();
  run.emit({ event: "compliance.run.reconciliation", analysisId: run.analysisId, timestamp: new Date(run.now()).toISOString(), planned: checks.length, terminal: run.ledger.outcomes.size, missingRequirementIds: reconciliation.missing, duplicateRequirementIds: reconciliation.duplicates, unexpectedCheckIds: reconciliation.unexpected });
}
