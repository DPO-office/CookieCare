/**
 * Shadow-mode execution (Stage 1 integration).
 *
 * Runs the V2 pipeline in parallel with V1 and records the result in a separate
 * table. V1 stays the only user-visible evaluator. HARD ISOLATION: every path
 * here is wrapped so a V2 failure can NEVER affect the V1 response — callers
 * invoke this fire-and-forget and it never rejects.
 */
import crypto from "crypto";
import { pool } from "../../../config/database.js";
import { runV2Pipeline } from "./pipeline.js";
import { toNegotiateMarkup } from "./adapt.js";

let shadowTableReady = false;

async function ensureShadowTable(): Promise<void> {
  if (shadowTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS negotiate_shadow_runs (
      id VARCHAR(255) PRIMARY KEY,
      document_id VARCHAR(255),
      content_hash VARCHAR(128),
      pipeline_version VARCHAR(64),
      evaluation_mode VARCHAR(64),
      v1_count INTEGER,
      v2_count INTEGER,
      v2_primary_count INTEGER,
      v2_llm_calls INTEGER,
      v2_embed_calls INTEGER,
      v2_result JSONB,
      comparison JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_negotiate_shadow_document ON negotiate_shadow_runs (document_id)`);
  shadowTableReady = true;
}

function norm(s: string): string { return (s || "").replace(/\s+/g, " ").trim().toLowerCase(); }

/** Lightweight V1-vs-V2 diff for at-a-glance triage in the shadow record. */
function compare(v1Markups: any[], v2Markups: any[]): any {
  const v1Keys = new Set(v1Markups.map((m) => norm(m.original).slice(0, 80)).filter(Boolean));
  const v2Keys = new Set(v2Markups.map((m) => norm(m.original).slice(0, 80)).filter(Boolean));
  const v2OnlyAbsence = v2Markups.filter((m) => m.v2?.isAbsence).map((m) => m.v2?.issueTag);
  let overlap = 0; for (const k of v2Keys) if (v1Keys.has(k)) overlap++;
  return {
    v1Count: v1Markups.length,
    v2Count: v2Markups.length,
    v2PrimaryCount: v2Markups.filter((m) => m.v2?.tier === "primary").length,
    v2AbsenceFindings: v2OnlyAbsence,
    textOverlap: overlap,
    v1RiskHistogram: hist(v1Markups.map((m) => m.riskLevel)),
    v2RiskHistogram: hist(v2Markups.map((m) => m.riskLevel)),
  };
}
function hist(bands: string[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const b of bands) h[b] = (h[b] || 0) + 1;
  return h;
}

export interface ShadowInput {
  documentId: string;
  documentText: string;
  v1Markups: any[];   // the V1 result that was actually shown to the user
}

/** Injectable dependencies (tests substitute these; production uses the real ones). */
export interface ShadowDeps {
  runPipeline: typeof runV2Pipeline;
  store: (row: any) => Promise<void>;
}

async function defaultStore(row: any): Promise<void> {
  await ensureShadowTable();
  await pool.query(
    `INSERT INTO negotiate_shadow_runs
       (id, document_id, content_hash, pipeline_version, evaluation_mode,
        v1_count, v2_count, v2_primary_count, v2_llm_calls, v2_embed_calls, v2_result, comparison)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [row.id, row.documentId, row.contentHash, row.pipelineVersion, row.evaluationMode,
     row.v1Count, row.v2Count, row.v2PrimaryCount, row.llmCalls, row.embedCalls,
     JSON.stringify(row.v2Result), JSON.stringify(row.comparison)]
  );
}

const DEFAULT_DEPS: ShadowDeps = { runPipeline: runV2Pipeline, store: defaultStore };

/**
 * Fire-and-forget. Runs V2, records the shadow result + comparison. NEVER throws.
 * Returns the persisted row id (or null on any failure) for tests/observability.
 */
export async function runShadowEvaluation(input: ShadowInput, deps: ShadowDeps = DEFAULT_DEPS): Promise<string | null> {
  try {
    const v2 = await deps.runPipeline(input.documentText);
    const v2Markups = v2.findings.map(toNegotiateMarkup);
    const comparison = compare(input.v1Markups ?? [], v2Markups);
    const id = "shadow_" + crypto.randomUUID();
    const contentHash = v2.contentHash;
    try {
      await deps.store({
        id, documentId: input.documentId, contentHash,
        pipelineVersion: v2.pipelineVersion, evaluationMode: v2.evaluationMode,
        v1Count: comparison.v1Count, v2Count: comparison.v2Count, v2PrimaryCount: comparison.v2PrimaryCount,
        llmCalls: v2.llmCalls, embedCalls: v2.embedCalls,
        v2Result: { ...v2, markups: v2Markups }, comparison,
      });
    } catch (dbErr: any) {
      // Storage failure must not matter — log the shadow result instead.
      console.warn(`[negotiate/v2-shadow] storage failed (non-fatal): ${dbErr?.message ?? dbErr}`);
    }
    console.log(
      `[negotiate/v2-shadow] doc=${input.documentId} mode=${v2.evaluationMode} ` +
      `v1=${comparison.v1Count} v2=${comparison.v2Count} (primary=${comparison.v2PrimaryCount}) ` +
      `absence=${comparison.v2AbsenceFindings.length} calls=${v2.llmCalls} embed=${v2.embedCalls}`
    );
    return id;
  } catch (err: any) {
    // Absolute isolation: never let a V2 shadow failure surface.
    console.warn(`[negotiate/v2-shadow] failed (non-fatal, V1 unaffected): ${err?.message ?? err}`);
    return null;
  }
}
