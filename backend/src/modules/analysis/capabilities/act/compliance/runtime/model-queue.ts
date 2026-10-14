/** A per-run FIFO permit pool. A check waiting for retrieval never holds a model permit. */
export type ModelCallScheduler = <T>(work: () => Promise<T>, signal?: AbortSignal, context?: Record<string, unknown>) => Promise<T>;
export function createModelCallQueue(limit: number, now: () => number, record: (data: Record<string, unknown>) => void): ModelCallScheduler {
  const observe = (data: Record<string, unknown>) => { try { record(data); } catch { /* Observer only. */ } };
  const pending: Array<() => void> = [];
  let active = 0;
  const drain = () => { while (active < limit && pending.length) pending.shift()!(); };
  return <T>(work: () => Promise<T>, signal?: AbortSignal, context: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
    const queuedAt = now();
    let started = false, cancelled = false;
    const abort = () => {
      if (!started) { cancelled = true; reject(signal?.reason ?? new Error("cancelled")); }
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    pending.push(() => {
      signal?.removeEventListener("abort", abort);
      if (cancelled || signal?.aborted) { reject(signal?.reason ?? new Error("cancelled")); return; }
      started = true; active++;
      const startedAt = now();
      observe({ ...context, state: "started", queueMs: startedAt - queuedAt, active });
      Promise.resolve().then(work).then(resolve, reject).finally(() => {
        active--;
        observe({ ...context, state: "finished", processingMs: now() - startedAt, active });
        drain();
      });
    });
    drain();
  });
}
