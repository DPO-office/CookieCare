/**
 * llm-scheduler.ts
 *
 * Centralized Gemini request scheduler for the Compare pipeline.
 *
 * Problem being solved
 * ─────────────────────
 * The pipeline issues 7–10 sequential Gemini requests in rapid succession
 * (alignment batch → diff batches → risk batches → summary). The provider
 * returns 429 RESOURCE_EXHAUSTED once the burst quota window fills, and the
 * fixed-delay retry (6 s × 3) wastes the bulk of total execution time.
 *
 * Design
 * ───────
 * 1. Adaptive inter-request pacing
 *    A sliding window tracks the last N request timestamps. Before each new
 *    request, the scheduler computes how many requests landed in the last
 *    WINDOW_MS and sleeps just long enough to stay under REQUESTS_PER_WINDOW.
 *    Under light load this delay is 0 ms. Under heavy load it is proportional
 *    to real throughput, not an arbitrary constant.
 *
 * 2. Exponential backoff with jitter on 429
 *    When a 429 fires the scheduler retries with:
 *      delay = min(BASE_DELAY × 2^attempt + random(0, JITTER_MS), MAX_DELAY)
 *    Jitter prevents retry storms when multiple pipelines run concurrently.
 *    Retry-After hints in the error message are respected when present.
 *
 * 3. Single global singleton
 *    All Compare LLM calls share one scheduler instance so the pacing window
 *    reflects total Gemini load, not per-step load.
 *
 * 4. Transparent to callers
 *    `executeScheduled()` has the same signature as the existing
 *    `executeWithRetry()` in llm/index.ts. Steps call it identically and
 *    never import the scheduler directly — it is injected at the llm/index
 *    layer, keeping every pipeline step unchanged.
 *
 * Architecture constraint: this file lives in the compare utils folder
 * because it was created for the compare pipeline. It is intentionally
 * generic so future modules (drafting, DPA review) can reuse it without
 * modification.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Per-lane pacing config. Generation and embedding calls hit different Gemini
 * quota pools, so they get independently-tuned scheduler instances rather than
 * sharing one budget — a burst of clause embeddings must never starve (or be
 * starved by) chat/JSON generation calls. See constructor below.
 */
export interface SchedulerConfig {
  /** How many requests are allowed within windowMs before pacing kicks in */
  requestsPerWindow: number;
  /** Rolling window duration in ms used for adaptive pacing */
  windowMs: number;
  /** Minimum inter-request gap when running at full throughput (ms) */
  minInterRequestMs: number;
  /** Max in-flight calls. The multi-region pool + 429 failover absorb bursts above this. */
  maxInFlight: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  requestsPerWindow: Number(process.env.GEMINI_REQUESTS_PER_WINDOW || 8),
  windowMs: Number(process.env.GEMINI_WINDOW_MS || 12_000),
  minInterRequestMs: Number(process.env.GEMINI_MIN_GAP_MS || 400),
  maxInFlight: Math.max(1, Number(process.env.GEMINI_MAX_IN_FLIGHT || 4)),
};

/** Embedding lane — separate, generous budget (embedding quota » Pro generation quota). */
const EMBED_CONFIG: SchedulerConfig = {
  requestsPerWindow: Number(process.env.GEMINI_EMBED_REQUESTS_PER_WINDOW || 60),
  windowMs: Number(process.env.GEMINI_EMBED_WINDOW_MS || 12_000),
  minInterRequestMs: Number(process.env.GEMINI_EMBED_MIN_GAP_MS || 50),
  maxInFlight: Math.max(1, Number(process.env.GEMINI_EMBED_MAX_IN_FLIGHT || 4)),
};

/** Base backoff delay for the first 429 retry (ms) */
const BASE_BACKOFF_MS = 2_000;

/** Maximum backoff cap regardless of attempt count (ms) */
const MAX_BACKOFF_MS = 60_000;

/** Random jitter ceiling added on top of exponential delay (ms) */
const JITTER_MS = 1_500;

/** Maximum retry attempts before propagating the error */
const MAX_RETRIES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerStats {
  totalRequests: number;
  totalRetries: number;
  totalRateLimitHits: number;
  totalWaitMs: number;
  totalLlmMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.toLowerCase().includes("resource_exhausted") ||
    msg.toLowerCase().includes("resource exhausted") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("quota")
  );
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("other side closed")
  );
}

function isRetryableError(err: unknown): boolean {
  if (isRegionsExhausted(err)) return false;
  return isRateLimitError(err) || isTransientNetworkError(err);
}

function isRegionsExhausted(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      (err as { geminiRegionsExhausted?: boolean }).geminiRegionsExhausted
  );
}

/**
 * Parse a Retry-After hint from an error message, if the provider includes one.
 * Returns ms to wait, or null when no hint is present.
 */
function parseRetryAfterMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  // "Retry after N seconds" or "retryDelay: Ns"
  const secMatch = msg.match(/retry[- ]?after[:\s]+(\d+)\s*s/i);
  if (secMatch) return parseInt(secMatch[1], 10) * 1000;
  const msMatch = msg.match(/retry[- ]?after[:\s]+(\d+)\s*ms/i);
  if (msMatch) return parseInt(msMatch[1], 10);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Scheduler class ──────────────────────────────────────────────────────────

export class GeminiScheduler {
  private readonly config: SchedulerConfig;

  /** Timestamps (epoch ms) of the last N started requests */
  private readonly requestTimestamps: number[] = [];

  /** Serializes callers so Promise.all bursts cannot all pass the pace check. */
  private inFlight = 0;
  private readonly waitQueue: Array<() => void> = [];

  private stats: SchedulerStats = {
    totalRequests: 0,
    totalRetries: 0,
    totalRateLimitHits: 0,
    totalWaitMs: 0,
    totalLlmMs: 0,
  };

  constructor(config: SchedulerConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  private async acquireSlot(): Promise<void> {
    if (this.inFlight < this.config.maxInFlight) {
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  // ── Adaptive pacing ─────────────────────────────────────────────────────

  /**
   * Compute how long to wait before issuing the next request.
   * Returns 0 when we are well within the rate window.
   */
  private computePaceDelay(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Drop timestamps outside the rolling window
    while (
      this.requestTimestamps.length > 0 &&
      this.requestTimestamps[0] < windowStart
    ) {
      this.requestTimestamps.shift();
    }

    if (this.requestTimestamps.length < this.config.requestsPerWindow) {
      // Below rate threshold — only enforce minimum gap
      if (this.requestTimestamps.length === 0) return 0;
      const lastTs = this.requestTimestamps[this.requestTimestamps.length - 1];
      const gap = now - lastTs;
      return gap >= this.config.minInterRequestMs ? 0 : this.config.minInterRequestMs - gap;
    }

    // At or above threshold — compute delay to push oldest request out of window
    const oldestInWindow = this.requestTimestamps[0];
    const timeUntilWindowSlides = this.config.windowMs - (now - oldestInWindow);
    return Math.max(0, timeUntilWindowSlides + this.config.minInterRequestMs);
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
    this.stats.totalRequests += 1;
  }

  // ── Public execution entry ──────────────────────────────────────────────

  /**
   * Execute a Gemini API call through the scheduler.
   *
   * Handles:
   *   1. Global in-flight limit (prevents Promise.all bursts)
   *   2. Adaptive pacing before the first attempt
   *   3. Exponential backoff + jitter on 429
   *   4. Retry-After hint respect
   *   5. Stats tracking
   *
   * @param fn     The async function that makes the actual Gemini API call.
   * @param label  Human-readable label for logging (e.g. "COMPARE_ALIGN batch 1").
   */
  async execute<T>(fn: () => Promise<T>, label = "LLM call"): Promise<T> {
    await this.acquireSlot();
    try {
      // ── Pre-request pacing ───────────────────────────────────────────────
      const paceDelay = this.computePaceDelay();
      if (paceDelay > 0) {
        console.log(
          `[GeminiScheduler] Pacing ${paceDelay}ms before ${label} ` +
            `(${this.requestTimestamps.length}/${this.config.requestsPerWindow} requests in window, inFlight=${this.inFlight})`
        );
        this.stats.totalWaitMs += paceDelay;
        await sleep(paceDelay);
      }

      let attempt = 0;

      while (true) {
        this.recordRequest();
        const llmStart = Date.now();

        try {
          const result = await fn();
          this.stats.totalLlmMs += Date.now() - llmStart;
          return result;
        } catch (err: unknown) {
          this.stats.totalLlmMs += Date.now() - llmStart;

        if (!isRetryableError(err) || attempt >= MAX_RETRIES) {
          throw err;
        }

        attempt += 1;
        this.stats.totalRetries += 1;
        if (isRateLimitError(err)) {
          this.stats.totalRateLimitHits += 1;
        }

        // Respect provider hint first
        const hintMs = parseRetryAfterMs(err);
        const expBackoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
          MAX_BACKOFF_MS
        );
        const jitter = Math.random() * JITTER_MS;
        const delay = hintMs !== null ? hintMs : expBackoff + jitter;

        console.warn(
          `[GeminiScheduler] ${isRateLimitError(err) ? "429" : "transient"} on ${label} — ` +
            `attempt ${attempt}/${MAX_RETRIES}, ` +
            `waiting ${Math.round(delay)}ms ` +
            `(${hintMs !== null ? "provider hint" : "exponential backoff + jitter"})`
        );

          this.stats.totalWaitMs += delay;
          await sleep(delay);

          // Re-apply pacing window after the wait so subsequent requests don't burst
          const paceAfterRetry = this.computePaceDelay();
          if (paceAfterRetry > 0) {
            this.stats.totalWaitMs += paceAfterRetry;
            await sleep(paceAfterRetry);
          }
        }
      }
    } finally {
      this.releaseSlot();
    }
  }

  // ── Stats access ────────────────────────────────────────────────────────

  getStats(): Readonly<SchedulerStats> {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalRetries: 0,
      totalRateLimitHits: 0,
      totalWaitMs: 0,
      totalLlmMs: 0,
    };
  }
}

// ─── Global singleton ─────────────────────────────────────────────────────────

/**
 * Single shared scheduler for all Compare pipeline (and general PAC) LLM
 * generation calls. Exported so the workflow can retrieve stats after execution.
 */
export const geminiScheduler = new GeminiScheduler(DEFAULT_CONFIG);

/**
 * Separate lane for embedding calls (Semantic Retrieval plan, R0). Embedding
 * quota is a different, larger pool than chat/JSON generation — a burst of
 * clause embeddings must never starve (or be starved by) generation calls,
 * so this is a fully independent scheduler instance, not a shared budget.
 */
export const geminiEmbedScheduler = new GeminiScheduler(EMBED_CONFIG);
