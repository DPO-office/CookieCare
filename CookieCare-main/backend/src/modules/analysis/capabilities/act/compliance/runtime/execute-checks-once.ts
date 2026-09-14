import type { ComplianceCheck, VerificationRequest, VerificationResult, RequirementStatus } from "../contracts/index.js";
import { verifyRequirement } from "../verification/index.js";
import { lockOutcomeWithAudit, assessRequirement } from "../assessment/index.js";
import type { VerificationTrace } from "../diagnostics/index.js";
import { runBudgeted } from "./budget.js";
import type { ComplianceRun } from "./create-run.js";
import type { CheckExecutionServices } from "./check-execution-services.js";

// Statuses that are genuinely borderline and can flip run-to-run on the same
// evidence. Confident ends (present / gap / not_applicable) do not resample.
const UNSTABLE_STATUS = new Set<RequirementStatus>(["partial", "cannot_determine", "judgment_required", "conflicting"]);
// Tie-break order when samples split with no majority: the most cautious survives.
const CAUTION_ORDER: RequirementStatus[] = ["judgment_required", "conflicting", "cannot_determine", "verification_incomplete", "partial", "gap", "not_applicable", "present"];

function selfConsistencySamples(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.ANALYSIS_COMPLIANCE_SELF_CONSISTENCY);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

/** Pick the majority verdict across samples; on a true split, keep the most
 *  cautious one so a genuinely uncertain requirement lands consistently. */
function consensusResult(request: VerificationRequest, results: VerificationResult[]): VerificationResult {
  const assessed = results.map(res => ({ res, status: assessRequirement(request, res) }));
  const counts = new Map<RequirementStatus, number>();
  for (const a of assessed) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
  const majority = [...counts].find(([, n]) => n * 2 > results.length)?.[0];
  const target = majority ?? [...counts.keys()].sort((a, b) => CAUTION_ORDER.indexOf(a) - CAUTION_ORDER.indexOf(b))[0];
  return assessed.find(a => a.status === target)!.res;
}

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
    let result = await verifyRequirement(request, completeFor(check), signal, 120000, traceFor(check));
    // Self-consistency (adaptive): only a borderline verdict on the same evidence
    // is resampled and voted, so clear-cut checks stay at one call while marginal
    // ones stop flipping run-to-run.
    const samples = selfConsistencySamples();
    if (samples > 1 && result.kind === "verified" && UNSTABLE_STATUS.has(assessRequirement(request, result))) {
      const results: VerificationResult[] = [result];
      for (let i = 1; i < samples && !signal.aborted; i += 1)
        results.push(await verifyRequirement(request, completeFor(check), signal, 120000, traceFor(check)));
      result = consensusResult(request, results);
      record("compliance.verification.self_consistency", check, { samples: results.length, statuses: results.map(r => assessRequirement(request, r)), chosen: assessRequirement(request, result) });
    }
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
