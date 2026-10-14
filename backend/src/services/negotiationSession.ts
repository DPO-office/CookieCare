import type { PoolClient } from "pg";
import crypto from "crypto";
import { pool } from "../config/database.js";
import { looksLikeCiphertext } from "../utils/crypto.js";

/**
 * Negotiation session persistence — Phase 2.
 *
 * Schema rationale (see Phase 2 report for the full inspection): neither
 * draft_state_ledger nor analysis_state_ledger model N independently
 * resolvable findings with status, so a dedicated pair of tables is used.
 * Tables are created lazily (CREATE TABLE IF NOT EXISTS on first use),
 * matching the existing ai_tools convention in controllers/aiTools.ts —
 * setupDb.ts's bootstrap CREATE TABLE block only runs on a fresh database
 * (skipped once the schema already exists), so a lazily-created table is the
 * only convention in this repo that reliably takes effect against the
 * already-running dev database without a fresh bootstrap.
 */

export type FindingStatus = "pending" | "accepted" | "rejected";
export type StrategyTier = "preferred" | "balanced" | "fallback";
export type RiskLevel = "RED" | "YELLOW" | "GREEN";

export interface NegotiationMarkupInput {
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: RiskLevel;
  clauseType: string;
  charOffset?: number | null;
  matchedPlaybookTopic?: string | null;
}

export interface NegotiationFindingRow {
  id: string;
  sessionId: string;
  clauseId: string;
  orderIndex: number;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: RiskLevel;
  clauseType: string;
  charOffset: number | null;
  matchedPlaybookTopic: string | null;
  status: FindingStatus;
  contextJson: any;
  strategyJson: any;
  selectedTier: StrategyTier | null;
  draftResultJson: any;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationSessionRow {
  id: string;
  userId: string;
  documentId: string;
  documentVersionId: string | null;
  documentVersionCount: number;
  playbookId: string | null;
  status: "active" | "superseded";
  createdAt: string;
  updatedAt: string;
}

let tablesReady = false;

// ─── Ciphertext contamination guard ──────────────────────────────────────────

/**
 * Returns true when a persisted finding row contains raw ciphertext in any of
 * the three user-visible text fields (original, replacement, reasoning).
 *
 * This happens when a session was created before the /session/resolve decrypt
 * fix was in place and the LLM received LEXGCM_… ciphertext as if it were
 * contract text. The finding rows are permanently corrupt; they cannot be
 * salvaged by decryption here because the "encrypted" value was never actual
 * document content — it was an accidental encryption envelope passed to the
 * LLM, which then hallucinated findings FROM the ciphertext bytes.
 *
 * A session that contains even one contaminated finding must be superseded and
 * replaced with a fresh evaluation against decrypted plaintext. The session row
 * itself is kept (status → 'superseded') so the audit trail is preserved.
 */
export function isFindingContaminated(f: NegotiationFindingRow): boolean {
  return (
    looksLikeCiphertext(f.original) ||
    looksLikeCiphertext(f.replacement) ||
    looksLikeCiphertext(f.reasoning)
  );
}

/**
 * Returns true when ANY finding in the array is contaminated with ciphertext.
 * Short-circuits on the first hit.
 */
export function hasContaminatedFindings(findings: NegotiationFindingRow[]): boolean {
  return findings.some(isFindingContaminated);
}

export async function ensureNegotiationTables(): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS negotiation_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      document_version_id VARCHAR(255) REFERENCES document_versions(id) ON DELETE SET NULL,
      document_version_count INTEGER NOT NULL DEFAULT 0,
      playbook_id VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // One ACTIVE session per (user, document) — enforced at the DB level so a
  // race between two concurrent "start negotiation" requests can't create
  // two active sessions; the loser gets a unique-violation (handled below).
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_negotiation_sessions_active_unique
      ON negotiation_sessions (user_id, document_id) WHERE status = 'active'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_negotiation_sessions_document ON negotiation_sessions (document_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS negotiation_findings (
      id VARCHAR(255) PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL REFERENCES negotiation_sessions(id) ON DELETE CASCADE,
      clause_id VARCHAR(255) NOT NULL,
      order_index INTEGER NOT NULL,
      original TEXT NOT NULL,
      replacement TEXT NOT NULL,
      reasoning TEXT NOT NULL DEFAULT '',
      risk_level VARCHAR(10) NOT NULL DEFAULT 'YELLOW' CHECK (risk_level IN ('RED','YELLOW','GREEN')),
      clause_type VARCHAR(50) NOT NULL DEFAULT 'other',
      char_offset INTEGER,
      matched_playbook_topic VARCHAR(255),
      status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      context_json JSONB,
      strategy_json JSONB,
      selected_tier VARCHAR(10) CHECK (selected_tier IN ('preferred','balanced','fallback')),
      draft_result_json JSONB,
      resolved_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_id, clause_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_negotiation_findings_session
      ON negotiation_findings (session_id, order_index)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_negotiation_findings_session_status
      ON negotiation_findings (session_id, status)
  `);
  // Phase 1 introduced a hot `SELECT COUNT(*) FROM document_versions WHERE
  // file_id = $1` (save-step concurrency check) with no supporting index.
  // Adding it here since it's directly relevant to this phase's access
  // patterns and touching setupDb.ts's shared bootstrap is out of scope.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_versions_file_id ON document_versions (file_id)
  `);
  tablesReady = true;
}

function mapSessionRow(r: any): NegotiationSessionRow {
  return {
    id: r.id,
    userId: r.user_id,
    documentId: r.document_id,
    documentVersionId: r.document_version_id,
    documentVersionCount: r.document_version_count,
    playbookId: r.playbook_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapFindingRow(r: any): NegotiationFindingRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    clauseId: r.clause_id,
    orderIndex: r.order_index,
    original: r.original,
    replacement: r.replacement,
    reasoning: r.reasoning,
    riskLevel: r.risk_level,
    clauseType: r.clause_type,
    charOffset: r.char_offset,
    matchedPlaybookTopic: r.matched_playbook_topic,
    status: r.status,
    contextJson: r.context_json,
    strategyJson: r.strategy_json,
    selectedTier: r.selected_tier,
    draftResultJson: r.draft_result_json,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Find the current ACTIVE session for (userId, documentId), if any. Read-only. */
export async function findActiveSession(
  client: PoolClient,
  userId: string,
  documentId: string
): Promise<NegotiationSessionRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM negotiation_sessions WHERE user_id = $1 AND document_id = $2 AND status = 'active' LIMIT 1`,
    [userId, documentId]
  );
  return rows.length > 0 ? mapSessionRow(rows[0]) : null;
}

export async function loadSessionFindings(
  client: PoolClient,
  sessionId: string
): Promise<NegotiationFindingRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM negotiation_findings WHERE session_id = $1 ORDER BY order_index ASC`,
    [sessionId]
  );
  const findings = rows.map(mapFindingRow);

  // Observability: log any contaminated findings at load time so ciphertext
  // leaks are immediately visible in server logs even if the caller handles
  // them (e.g. supersedes the session). Never throws — the caller decides
  // what to do with contaminated findings.
  const contaminated = findings.filter(isFindingContaminated);
  if (contaminated.length > 0) {
    console.warn(
      `[negotiationSession] loadSessionFindings: session ${sessionId} has ` +
        `${contaminated.length}/${findings.length} contaminated finding(s) ` +
        `(ciphertext in original/replacement/reasoning). ` +
        `clauseIds: ${contaminated.map((f) => f.clauseId).join(", ")}`
    );
  }

  return findings;
}

/**
 * Create a new active session + its findings in one go. If an active session
 * already exists for (userId, documentId), it is marked 'superseded' first
 * (history preserved, not deleted) — callers decide whether that's desired
 * (see /session/resolve's forceNew / "Re-run evaluation" semantics).
 *
 * Must be called with an already-authorized documentId — this function does
 * not itself check document ownership.
 *
 * Race-safe: if a concurrent request already created an active session for
 * this (userId, documentId) between the caller's check and this insert, the
 * unique partial index raises a unique-violation (23505), which is caught
 * and treated as "someone else just created it" — the existing session is
 * returned instead of erroring.
 */
export async function createSession(
  client: PoolClient,
  params: {
    userId: string;
    documentId: string;
    documentVersionId: string | null;
    documentVersionCount: number;
    playbookId: string | null;
    markups: NegotiationMarkupInput[];
    supersedeExisting: boolean;
  }
): Promise<{ session: NegotiationSessionRow; findings: NegotiationFindingRow[]; racedExisting: boolean }> {
  const { userId, documentId, documentVersionId, documentVersionCount, playbookId, markups, supersedeExisting } = params;

  if (supersedeExisting) {
    await client.query(
      `UPDATE negotiation_sessions SET status = 'superseded', updated_at = NOW()
       WHERE user_id = $1 AND document_id = $2 AND status = 'active'`,
      [userId, documentId]
    );
  }

  const sessionId = "negsession_" + crypto.randomUUID();

  try {
    await client.query(
      `INSERT INTO negotiation_sessions
         (id, user_id, document_id, document_version_id, document_version_count, playbook_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [sessionId, userId, documentId, documentVersionId, documentVersionCount, playbookId]
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      // Lost the race to a concurrent create — return the winner's session instead.
      const existing = await findActiveSession(client, userId, documentId);
      if (existing) {
        const findings = await loadSessionFindings(client, existing.id);
        return { session: existing, findings, racedExisting: true };
      }
    }
    throw err;
  }

  const findingRows: NegotiationFindingRow[] = [];
  let orderIndex = 0;
  for (const m of markups) {
    const findingId = "negfinding_" + crypto.randomUUID();
    const { rows } = await client.query(
      // ON CONFLICT (session_id, clause_id) upserts rather than erroring when
      // two markups produce the same clauseId (hash collision in stableClauseId).
      // stableClauseId now hashes the full clause text so genuine collisions are
      // near-impossible, but the upsert keeps the insert safe if one ever slips
      // through — the last writer wins and the session create never crashes.
      `INSERT INTO negotiation_findings
         (id, session_id, clause_id, order_index, original, replacement, reasoning,
          risk_level, clause_type, char_offset, matched_playbook_topic, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
       ON CONFLICT (session_id, clause_id) DO UPDATE SET
         original            = EXCLUDED.original,
         replacement         = EXCLUDED.replacement,
         reasoning           = EXCLUDED.reasoning,
         order_index         = EXCLUDED.order_index,
         risk_level          = EXCLUDED.risk_level,
         clause_type         = EXCLUDED.clause_type,
         char_offset         = EXCLUDED.char_offset,
         matched_playbook_topic = EXCLUDED.matched_playbook_topic,
         updated_at          = NOW()
       RETURNING *`,
      [
        findingId, sessionId, m.clauseId, orderIndex++,
        m.original, m.replacement, m.reasoning ?? "",
        m.riskLevel, m.clauseType ?? "other",
        m.charOffset ?? null, m.matchedPlaybookTopic ?? null,
      ]
    );
    findingRows.push(mapFindingRow(rows[0]));
  }

  const { rows: sessionRows } = await client.query(`SELECT * FROM negotiation_sessions WHERE id = $1`, [sessionId]);
  return { session: mapSessionRow(sessionRows[0]), findings: findingRows, racedExisting: false };
}

/**
 * Authorization-scoped finding lookup: only returns a finding when it
 * belongs to an ACTIVE session owned by userId for documentId. Never trusts
 * clauseId/documentId/userId from the client without this join.
 */
export async function resolveOwnedFinding(
  client: PoolClient,
  params: { userId: string; documentId: string; clauseId: string; forUpdate?: boolean }
): Promise<NegotiationFindingRow | null> {
  const { userId, documentId, clauseId, forUpdate } = params;
  const { rows } = await client.query(
    `SELECT f.* FROM negotiation_findings f
     JOIN negotiation_sessions s ON s.id = f.session_id
     WHERE s.user_id = $1 AND s.document_id = $2 AND s.status = 'active' AND f.clause_id = $3
     LIMIT 1${forUpdate ? " FOR UPDATE OF f" : ""}`,
    [userId, documentId, clauseId]
  );
  return rows.length > 0 ? mapFindingRow(rows[0]) : null;
}

export async function markFindingStatus(
  client: PoolClient,
  findingId: string,
  status: FindingStatus
): Promise<void> {
  await client.query(
    `UPDATE negotiation_findings SET status = $1, resolved_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [status, findingId]
  );
}

/** Bumps the session's document-version watermark after an Accept creates a new version row. */
export async function advanceSessionVersion(
  client: PoolClient,
  sessionId: string,
  documentVersionId: string,
  documentVersionCount: number
): Promise<void> {
  await client.query(
    `UPDATE negotiation_sessions
     SET document_version_id = $1, document_version_count = $2, updated_at = NOW()
     WHERE id = $3`,
    [documentVersionId, documentVersionCount, sessionId]
  );
}

export async function saveFindingContext(client: PoolClient, findingId: string, contextJson: any): Promise<void> {
  await client.query(
    `UPDATE negotiation_findings SET context_json = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(contextJson), findingId]
  );
}

export async function saveFindingStrategy(client: PoolClient, findingId: string, strategyJson: any): Promise<void> {
  await client.query(
    `UPDATE negotiation_findings SET strategy_json = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(strategyJson), findingId]
  );
}

export async function saveFindingDraft(
  client: PoolClient,
  findingId: string,
  selectedTier: StrategyTier,
  draftResultJson: any
): Promise<void> {
  await client.query(
    `UPDATE negotiation_findings SET selected_tier = $1, draft_result_json = $2, updated_at = NOW() WHERE id = $3`,
    [selectedTier, JSON.stringify(draftResultJson), findingId]
  );
}
