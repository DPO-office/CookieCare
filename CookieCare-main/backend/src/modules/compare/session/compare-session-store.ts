/**
 * compare-session-store.ts
 *
 * In-memory store that holds the serialised compare result for the duration
 * of a browser session.  No database, no Redis — intentionally ephemeral.
 *
 * A stored session is keyed by the job_id returned by POST /api/compare/start.
 * The compare-handler writes to this store once the pipeline completes.
 * The Compare Chat endpoint reads from it to answer follow-up questions.
 *
 * Design constraint (MVP):
 *   - Sessions expire after SESSION_TTL_MS (default 4 hours).
 *   - Max MAX_SESSIONS entries are held; oldest is evicted when the cap is hit.
 *   - The store is per-process — not shared across horizontally scaled nodes.
 *     A future version can swap the Map for a Redis hash without changing the
 *     chat agent, because the agent only receives a CompareSessionData object.
 */

export interface CompareSessionData {
  jobId: string;
  userId: string;
  title: string;
  originalFileName: string;
  revisedFileName: string;

  /** Parsed document texts — available for clause drafting questions */
  textA: string | null;
  textB: string | null;

  /**
   * Extracted clauses from both documents.
   * Stored so the drafting agent can locate and quote actual clause language
   * without re-running the pipeline.  Each entry has id, title, and text fields.
   */
  clausesA: Array<{ id: string; title: string; text: string }> | null;
  clausesB: Array<{ id: string; title: string; text: string }> | null;

  /** Structured artifacts from the pipeline — the AI's working context */
  alignment: any[] | null;
  differences: any[] | null;
  risks: any[] | null;
  executiveSummary: any | null;

  /**
   * Renderable PDF buffers for the comparison viewer.
   *
   * For PDF uploads this is the original uploaded PDF bytes.
   * For DOCX uploads this is the Playwright-converted PDF.
   *
   * Stored so the frontend can fetch them via
   *   GET /api/compare/:jobId/pdf?doc=original|revised
   * without requiring the browser to retain the original File objects.
   *
   * Intentionally kept as Buffer (not Base64) — they are never serialised to
   * JSON and only served via the streaming PDF endpoint.
   */
  pdfA: Buffer | null;
  pdfB: Buffer | null;

  /** Wall-clock time of last access — used for TTL eviction */
  lastAccessedAt: number;
  /** Creation time */
  createdAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** 4 hours — long enough for a working session, short enough to avoid unbounded growth */
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/** Maximum concurrent sessions in memory */
const MAX_SESSIONS = 200;

// ─── Store ────────────────────────────────────────────────────────────────────

class CompareSessionStore {
  private sessions = new Map<string, CompareSessionData>();

  /**
   * Persist a compare session after the pipeline completes.
   * The jobId is the session key — it is already known by the client.
   */
  set(jobId: string, data: Omit<CompareSessionData, "lastAccessedAt" | "createdAt">): void {
    this.evictExpired();

    // Evict oldest when at capacity
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = [...this.sessions.entries()].sort(
        (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
      )[0];
      if (oldest) {
        this.sessions.delete(oldest[0]);
      }
    }

    const now = Date.now();
    this.sessions.set(jobId, { ...data, lastAccessedAt: now, createdAt: now });
    console.log(`[CompareSessionStore] Stored session for job ${jobId} (total: ${this.sessions.size})`);
  }

  /**
   * Retrieve a session and refresh its last-access timestamp.
   * Returns null when the session is missing or expired.
   */
  get(jobId: string): CompareSessionData | null {
    const session = this.sessions.get(jobId);
    if (!session) return null;

    const now = Date.now();
    if (now - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(jobId);
      console.log(`[CompareSessionStore] Session ${jobId} expired and evicted.`);
      return null;
    }

    session.lastAccessedAt = now;
    return session;
  }

  /** Check whether a session exists for the given jobId (without refreshing TTL). */
  has(jobId: string): boolean {
    return this.sessions.has(jobId);
  }

  /** Remove a session explicitly (e.g. user resets the conversation). */
  delete(jobId: string): void {
    this.sessions.delete(jobId);
  }

  /** Remove all sessions that have exceeded the TTL. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  /** Diagnostic summary for health endpoints. */
  stats(): { size: number; maxSize: number; ttlHours: number } {
    return {
      size: this.sessions.size,
      maxSize: MAX_SESSIONS,
      ttlHours: SESSION_TTL_MS / 3_600_000,
    };
  }
}

/** Singleton — shared across the entire server process */
export const compareSessionStore = new CompareSessionStore();
