import { pool } from "../../config/database.js";
import { logger } from "../../utils/logger.js";

/**
 * Stale-job recovery sweep.
 *
 * Background jobs run IN-PROCESS (see jobQueue.addJobToQueue). If the server is
 * restarted, redeployed, or crashes while a job is mid-flight, that job's row is
 * left in `queued`/`processing` forever — there is no worker to resume it. The
 * UI then shows the item as perpetually "uploading"/"processing" (e.g. a stuck
 * AI Rulebook in the Vault), and any linked library_item never leaves its
 * "processing" state.
 *
 * This sweep marks such orphaned jobs as `failed` so the UI stops waiting and
 * the user can retry. It runs once at startup (to clear jobs stranded by the
 * restart that just happened) and then on an interval (to catch jobs that hang
 * for longer than any real job should while the server stays up).
 *
 * NOTE ON STATUS CASING: job rows contain BOTH lowercase statuses (jobQueue.ts:
 * 'processing'/'completed'/'failed') and uppercase statuses (some ingest
 * handlers: 'PROCESSING'/'COMPLETED'/'FAILED'). Every comparison here is
 * case-insensitive for that reason.
 */

// A job actively running longer than this is considered orphaned. The slowest
// real jobs (vendor/AI-ethics website scans, playbook structuring) finish in a
// couple of minutes; genuinely stuck jobs sit for hours or days.
const STALE_THRESHOLD_MINUTES = 30;

// How often to re-run the sweep while the server is up.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

interface SweptJob {
  id: string;
  type: string;
  payload: any;
}

/**
 * Mark orphaned queued/processing jobs as failed and unstick any library_items
 * they were populating. Safe to call repeatedly. Returns the number swept.
 */
export async function sweepStaleJobs(
  thresholdMinutes: number = STALE_THRESHOLD_MINUTES
): Promise<number> {
  let swept: SweptJob[] = [];
  try {
    const { rows } = await pool.query(
      `UPDATE jobs
         SET status = 'failed',
             error = COALESCE(NULLIF(error, ''), $2),
             message = $2,
             updated_at = NOW()
       WHERE LOWER(status) IN ('queued', 'processing')
         AND COALESCE(updated_at, created_at) < NOW() - ($1 || ' minutes')::interval
       RETURNING id, type, payload`,
      [
        String(thresholdMinutes),
        "Interrupted (server restart or timeout). Please retry — this task did not finish.",
      ]
    );
    swept = rows as SweptJob[];
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[staleJobSweep] Failed to sweep stale jobs");
    return 0;
  }

  if (swept.length === 0) return 0;

  // Unstick any library_items (AI Rulebooks / templates / clauses) that were
  // being populated by a swept ingest job, so they stop showing "processing".
  for (const job of swept) {
    const libraryItemId =
      job.payload && typeof job.payload === "object"
        ? job.payload.libraryItemId
        : undefined;
    if (!libraryItemId) continue;
    // NOTE: library_items.details is a TEXT column holding a JSON string (not
    // jsonb), so JSON operators (->>) are unavailable — guard with a text match
    // to avoid clobbering an item that already finished ("ready").
    await pool
      .query(
        `UPDATE library_items
           SET description = $1,
               details = $2
         WHERE id = $3
           AND COALESCE(details, '') NOT LIKE '%"status":"ready"%'
           AND COALESCE(details, '') NOT LIKE '%"status": "ready"%'`,
        [
          "Ingestion interrupted — please re-upload",
          JSON.stringify({
            status: "failed",
            error: "Ingestion interrupted (server restart or timeout). Please re-upload.",
          }),
          libraryItemId,
        ]
      )
      .catch((err) =>
        logger.warn(
          { err: err?.message, libraryItemId },
          "[staleJobSweep] Failed to unstick library_item"
        )
      );
  }

  logger.info(
    { count: swept.length, thresholdMinutes },
    "[staleJobSweep] Marked orphaned jobs as failed"
  );
  return swept.length;
}

/**
 * Run the sweep once now, then schedule it on a recurring interval. Called from
 * server runtime configuration. Idempotent — a second call is a no-op for the
 * timer.
 */
export function startStaleJobSweep(): void {
  // Startup sweep: clear anything stranded by the restart that just happened.
  sweepStaleJobs().catch((err) =>
    logger.warn({ err: err?.message }, "[staleJobSweep] startup sweep failed")
  );

  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepStaleJobs().catch((err) =>
      logger.warn({ err: err?.message }, "[staleJobSweep] interval sweep failed")
    );
  }, SWEEP_INTERVAL_MS);
  // Do not keep the event loop alive solely for this timer.
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}
