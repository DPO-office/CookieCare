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

function isLayoutDocument(mimeType: string, fileName = ""): boolean {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  return mime.includes("pdf") || mime.includes("wordprocessingml") || mime.includes("msword")
    || name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc");
}

function isDoclingGraph(graph: CanonicalDocumentGraph): boolean {
  return graph.parser.name === "docling.rs";
}

export async function ensureDocumentGraph(
  userId: string,
  fileId: string,
  options: { forceRebuild?: boolean; requireDocling?: boolean } = {}
): Promise<CanonicalDocumentGraph> {
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

  const fileName = String(source.title || fileId);
  const storedMime = String(source.mime_type || "application/octet-stream");
  const layoutDocument = isLayoutDocument(storedMime, fileName);
  const edited = Number(source.version_count ?? 0) > 1;
  const originalBytes = source.original_file ? Buffer.from(source.original_file, "base64") : null;

  if (!options.forceRebuild) {
    const existing = await loadLatestDocumentGraph(userId, fileId);
    if (existing) {
      const reuse = !layoutDocument || edited || isDoclingGraph(existing) || !originalBytes;
      if (reuse) {
        if (options.requireDocling && layoutDocument && !edited && !isDoclingGraph(existing)) {
          throw new Error(
            `Analysis requires Docling structure for ${fileName}, but the stored graph was built with ${existing.parser.name}. Re-upload the original PDF/DOCX.`
          );
        }
        return existing;
      }
    }
  }

  let versionId = source.version_id as string | undefined;
  const decrypted = source.is_encrypted ? decryptData(source.content) : String(source.content ?? "");
  // Untouched PDF/DOCX uploads must be graphed from original bytes so Docling
  // runs. Edited documents are plaintext and stay on the text-native path.
  if (layoutDocument && !edited && !originalBytes && options.requireDocling) {
    throw new Error(`Analysis requires the original ${fileName} bytes for Docling. Re-upload the document.`);
  }
  const canUseOriginal = Boolean(originalBytes) && !edited;
  const buffer = canUseOriginal ? originalBytes! : Buffer.from(decrypted, "utf8");
  const mimeType = canUseOriginal ? storedMime : "text/plain";
  if (!versionId) {
    versionId = `ver_${crypto.randomUUID()}`;
    const encryptedContent = source.is_encrypted ? source.content : encryptData(decrypted);
    await withTransaction(userId, "USER", async (client) => {
      await client.query(`INSERT INTO document_versions (id, file_id, content) VALUES ($1,$2,$3)`, [versionId, fileId, encryptedContent]);
    });
  }
  const graph = await buildDocumentGraph({ artifactId: `dsa_${crypto.randomUUID()}`, fileId,
    documentVersionId: versionId, fileName, mimeType, buffer });
  if (options.requireDocling && layoutDocument && !edited && !isDoclingGraph(graph)) {
    throw new Error(
      `Analysis requires Docling for ${fileName}, but the parser returned ${graph.parser.name}. Check Docling native assets on this instance.`
    );
  }
  await persistDocumentGraph(userId, graph);
  // An idempotent rebuild can update an existing (version, schema, parser)
  // row whose artifact id predates this attempt. Return the persisted record.
  return await loadLatestDocumentGraph(userId, fileId) ?? graph;
}
