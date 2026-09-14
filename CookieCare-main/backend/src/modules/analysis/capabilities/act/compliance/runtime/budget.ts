import { setMaxListeners } from "node:events";
export interface ExecutionBudget {
  concurrency: number;
  /** Null disables the shared deadline for diagnostic runs. */
  stageMs: number | null;
}
export function executionBudget(env: Record<string, string | undefined> = process.env): ExecutionBudget {
  const value = (name: string, fallback: number, min: number, max: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  };
  const disableDeadline = ["true", "1"].includes((env.COMPLIANCE_VERIFICATION_DISABLE_TIME_BUDGET ?? "").trim().toLowerCase());
  return {
    concurrency: value("ANALYSIS_COMPLIANCE_SIDE_CHANNEL_CONCURRENCY", 4, 1, 16),
    stageMs: disableDeadline || !env.ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS ? null : value("ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS", 45000, 100, 300000),
  };
}
/** Bounded concurrency, with an optional shared deadline and isolated late results. */
export async function runBudgeted<T, R>(items: T[], budget: ExecutionBudget, worker: (item: T, signal: AbortSignal) => Promise<R>, failure: (item: T, reason: string) => R, now: () => number = Date.now): Promise<R[]> {
  const controller = new AbortController();
  setMaxListeners(Math.max(10, items.length * 3 + 4), controller.signal);
  const deadline = budget.stageMs === null ? null : now() + budget.stageMs;
  const results: R[] = new Array(items.length);
  let next = 0;
  const timer = budget.stageMs === null ? undefined : setTimeout(() => controller.abort(new Error("budget_exhausted")), budget.stageMs);
  async function run() {
    while (next < items.length) {
      const index = next++, item = items[index];
      if (controller.signal.aborted || (deadline !== null && now() >= deadline)) {
        results[index] = failure(item, "budget_exhausted");
        continue;
      }
      let listener: (() => void) | undefined;
      try {
        const aborted = new Promise<R>(resolve => { listener = () => resolve(failure(item, "budget_exhausted")); controller.signal.addEventListener("abort", listener, { once: true }); });
        results[index] = await Promise.race([worker(item, controller.signal).catch(error => failure(item, String(error))), aborted]);
      }
      finally {
        if (listener)
          controller.signal.removeEventListener("abort", listener);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(budget.concurrency, items.length) }, run));
  }
  finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return results;
}
