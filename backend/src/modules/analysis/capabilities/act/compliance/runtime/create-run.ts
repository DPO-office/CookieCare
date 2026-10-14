import type { ComplianceCheck, CompletionClient, VerificationContext } from "../contracts/index.js";
import type { ComplianceEventSink } from "../diagnostics/index.js";
import { CheckLedger } from "./check-ledger.js";
import { executionBudget, type ExecutionBudget } from "./budget.js";
import { createModelCallQueue, type ModelCallScheduler } from "./model-queue.js";
export interface ComplianceRun {
  analysisId: string;
  ledger: CheckLedger;
  context: VerificationContext;
  complete: CompletionClient;
  emit: ComplianceEventSink;
  now: () => number;
  budget: ExecutionBudget;
  scheduleCall: ModelCallScheduler;
}
export function createRun(args: Omit<ComplianceRun, "ledger" | "now" | "budget" | "scheduleCall"> & {
  checks: ComplianceCheck[];
  now?: () => number;
  budget?: ExecutionBudget;
}): ComplianceRun {
  const now = args.now ?? Date.now, budget = args.budget ?? executionBudget();
  const emit: ComplianceEventSink = event => {
      try {
        args.emit(structuredClone(event));
      }
      catch { /* Observability cannot change a business outcome. */ }
    };
  return {
    ...args, ledger: new CheckLedger(args.checks), now, budget, emit,
    scheduleCall: createModelCallQueue(budget.concurrency, now, data => emit({ event: "compliance.model.queue", analysisId: args.analysisId, timestamp: new Date(now()).toISOString(), ...data })),
  };
}
