import { pool } from "../../../../../../config/database.js";
import { executeEmbedding } from "../../../../../../llm/index.js";
import { GEMINI_EMBEDDING_MODEL } from "../../../../../../llm/config/model-specs.js";
import { withTransaction } from "../../../../../../utils/dbUtils.js";
import type {
  EmbeddingCacheKey,
  EvidenceEmbeddingCache,
  EvidenceUnit,
  InvestigationLogger,
} from "./types.js";

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const numbers = value.map(Number);
    return numbers.every(Number.isFinite) ? numbers : null;
  }
  if (typeof value !== "string") return null;
  const numbers = value.replace(/^\[|\]$/g, "").split(",").map(Number);
  return numbers.length > 0 && numbers.every(Number.isFinite) ? numbers : null;
}

export const databaseEvidenceEmbeddingCache: EvidenceEmbeddingCache = {
  async load(key) {
    return withTransaction(key.userId, "USER", async (client) => {
      const { rows } = await client.query(
        `SELECT node_id, content_hash, embedding::text AS embedding
         FROM document_evidence_embeddings
         WHERE user_id=$1 AND file_id=$2 AND version_id=$3
           AND graph_schema_version=$4 AND embedding_model=$5`,
        [key.userId, key.fileId, key.documentVersionId, key.graphSchemaVersion, key.embeddingModel]
      );
      const out = new Map<string, { contentHash: string; vector: number[] }>();
      for (const row of rows) {
        const vector = parseVector(row.embedding);
        if (vector) out.set(String(row.node_id), { contentHash: String(row.content_hash), vector });
      }
      return out;
    });
  },

  async upsert(key, rows) {
    if (rows.length === 0) return;
    await withTransaction(key.userId, "USER", async (client) => {
      for (const row of rows) {
        await client.query(
          `INSERT INTO document_evidence_embeddings
             (user_id,file_id,version_id,graph_schema_version,embedding_model,node_id,content_hash,embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector)
           ON CONFLICT (user_id,file_id,version_id,graph_schema_version,embedding_model,node_id)
           DO UPDATE SET content_hash=EXCLUDED.content_hash, embedding=EXCLUDED.embedding,
             updated_at=CURRENT_TIMESTAMP`,
          [key.userId, key.fileId, key.documentVersionId, key.graphSchemaVersion,
            key.embeddingModel, row.nodeId, row.contentHash, `[${row.vector.join(",")}]`]
        );
      }
    });
  },
};

export interface ResolveEmbeddingsInput {
  units: EvidenceUnit[];
  userId?: string;
  cache?: EvidenceEmbeddingCache;
  embed?: (texts: string[]) => Promise<Array<number[] | null>>;
  logger?: InvestigationLogger;
}

/** Load matching vectors and embed only cache misses. Database failures degrade safely. */
export async function resolveEvidenceEmbeddings(
  input: ResolveEmbeddingsInput
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  if (input.units.length === 0) return vectors;
  const graph = input.units[0].sourceGraph;
  const key: EmbeddingCacheKey | undefined = input.userId
    ? {
        userId: input.userId,
        fileId: graph.fileId,
        documentVersionId: graph.documentVersionId,
        graphSchemaVersion: graph.schemaVersion,
        embeddingModel: GEMINI_EMBEDDING_MODEL,
      }
    : undefined;
  const cache = input.cache ?? databaseEvidenceEmbeddingCache;
  let cached = new Map<string, { contentHash: string; vector: number[] }>();
  if (key) {
    try {
      cached = await cache.load(key);
    } catch (error) {
      input.logger?.("compliance.investigation.embedding_cache.degraded", {
        documentId: graph.fileId,
        operation: "load",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missing: EvidenceUnit[] = [];
  for (const unit of input.units) {
    const hit = cached.get(unit.unitId);
    if (hit?.contentHash === unit.contentHash) vectors.set(unit.unitId, hit.vector);
    else missing.push(unit);
  }
  input.logger?.("compliance.investigation.embedding_cache", {
    documentId: graph.fileId,
    hitCount: vectors.size,
    missCount: missing.length,
    hitRate: input.units.length > 0 ? vectors.size / input.units.length : 1,
  });
  if (missing.length === 0) return vectors;

  const embed = input.embed ?? executeEmbedding;
  let generated: Array<number[] | null>;
  try {
    generated = await embed(missing.map((unit) => unit.searchText));
  } catch (error) {
    input.logger?.("compliance.investigation.embedding.degraded", {
      documentId: graph.fileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return vectors;
  }
  const fresh: Array<{ nodeId: string; contentHash: string; vector: number[] }> = [];
  missing.forEach((unit, index) => {
    const vector = generated[index];
    if (!vector) return;
    vectors.set(unit.unitId, vector);
    fresh.push({ nodeId: unit.unitId, contentHash: unit.contentHash, vector });
  });
  if (key && fresh.length > 0) {
    try {
      await cache.upsert(key, fresh);
    } catch (error) {
      input.logger?.("compliance.investigation.embedding_cache.degraded", {
        documentId: graph.fileId,
        operation: "upsert",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return vectors;
}

/** Readiness probe used by setup/qualification tests. */
export async function evidenceEmbeddingTableAvailable(): Promise<boolean> {
  try {
    await pool.query("SELECT 1 FROM document_evidence_embeddings LIMIT 1");
    return true;
  } catch {
    return false;
  }
}
