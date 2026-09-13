import crypto from "node:crypto";
import { pool } from "../../../../../config/database.js";
import { decryptData, encryptData } from "../../../../../utils/crypto.js";
import { withTransaction } from "../../../../../utils/dbUtils.js";
import { buildDocumentGraph } from "./build-document-graph.js";
import { DOCUMENT_GRAPH_SCHEMA_VERSION, type CanonicalDocumentGraph } from "./types.js";
import { dumpIngestDocumentGraph } from "../../../temp/ingest-graph/dump-ingest-graph.js";

export async function persistDocumentGraph(userId: string, graph: CanonicalDocumentGraph): Promise<void> {
  const encrypted = encryptData(JSON.stringify(graph));
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `INSERT INTO document_structure_artifacts
       (id, file_id, version_id, user_id, source_sha256, schema_version, parser_name, parser_version,
        parser_options, status, quality_summary, identity_status, identity_summary, encrypted_payload, warnings, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP)
       ON CONFLICT (version_id, schema_version, parser_version)
       DO UPDATE SET source_sha256=EXCLUDED.source_sha256, parser_name=EXCLUDED.parser_name,
         parser_options=EXCLUDED.parser_options, status=EXCLUDED.status,
         quality_summary=EXCLUDED.quality_summary, identity_status=EXCLUDED.identity_status,
         identity_summary=EXCLUDED.identity_summary, encrypted_payload=EXCLUDED.encrypted_payload,
         warnings=EXCLUDED.warnings, updated_at=CURRENT_TIMESTAMP`,
      [graph.artifactId, graph.fileId, graph.documentVersionId, userId, graph.sourceSha256,
        graph.schemaVersion, graph.parser.name, graph.parser.version,
        JSON.stringify({ format: graph.parser.format, status: graph.parser.status }), graph.quality.status,
        JSON.stringify(graph.quality), graph.identity.status, JSON.stringify(graph.identity), encrypted, JSON.stringify(graph.warnings)]
    );
  });
  // Temp viewer: exact ingest artifact (physical + relation graph). Non-fatal.
  dumpIngestDocumentGraph(graph);
}

export async function loadLatestDocumentGraph(userId: string, fileId: string): Promise<CanonicalDocumentGraph | null> {
  return withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query(
      `SELECT a.encrypted_payload
       FROM document_structure_artifacts a
       WHERE a.file_id = $1
         AND a.schema_version = $2
         AND a.version_id = (SELECT id FROM document_versions WHERE file_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1)
       ORDER BY a.updated_at DESC LIMIT 1`,
      [fileId, DOCUMENT_GRAPH_SCHEMA_VERSION]
    );
    if (!rows.length || !rows[0].encrypted_payload) return null;
    return JSON.parse(decryptData(rows[0].encrypted_payload)) as CanonicalDocumentGraph;
  });
}

export async function ensureDocumentGraph(
  userId: string,
  fileId: string,
  options: { forceRebuild?: boolean } = {}
): Promise<CanonicalDocumentGraph> {
  if (!options.forceRebuild) {
    const existing = await loadLatestDocumentGraph(userId, fileId);
    if (existing) return existing;
  }

  const source = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query(
      `SELECT f.id, f.title, f.mime_type, f.original_file, f.content, f.is_encrypted,
              (SELECT id FROM document_versions WHERE file_id=f.id ORDER BY created_at DESC, id DESC LIMIT 1) AS version_id,
              (SELECT COUNT(*)::int FROM document_versions WHERE file_id=f.id) AS version_count
       FROM files f WHERE f.id=$1 LIMIT 1`, [fileId]
    );
    return rows[0];
  });
  if (!source) throw new Error(`Document not found: ${fileId}`);
  let versionId = source.version_id as string | undefined;
  const decrypted = source.is_encrypted ? decryptData(source.content) : String(source.content ?? "");
  // original_file is immutable while files.content represents the latest
  // version. Preserve the rich source only for an untouched initial upload;
  // edited documents must be graphed from their current canonical text.
  const canUseOriginal = Boolean(source.original_file) && Number(source.version_count ?? 0) <= 1;
  const buffer = canUseOriginal ? Buffer.from(source.original_file, "base64") : Buffer.from(decrypted, "utf8");
  const mimeType = canUseOriginal ? String(source.mime_type || "application/octet-stream") : "text/plain";
  if (!versionId) {
    versionId = `ver_${crypto.randomUUID()}`;
    const encryptedContent = source.is_encrypted ? source.content : encryptData(decrypted);
    await withTransaction(userId, "USER", async (client) => {
      await client.query(`INSERT INTO document_versions (id, file_id, content) VALUES ($1,$2,$3)`, [versionId, fileId, encryptedContent]);
    });
  }
  const graph = await buildDocumentGraph({ artifactId: `dsa_${crypto.randomUUID()}`, fileId,
    documentVersionId: versionId, fileName: String(source.title || fileId), mimeType, buffer });
  await persistDocumentGraph(userId, graph);
  // An idempotent rebuild can update an existing (version, schema, parser)
  // row whose artifact id predates this attempt. Return the persisted record.
  return await loadLatestDocumentGraph(userId, fileId) ?? graph;
}
