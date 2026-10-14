/**
 * Optional: rebuild ingest-graph HTML from the latest persisted artifact(s)
 * without re-uploading.
 *
 *   npx tsx src/modules/analysis/temp/ingest-graph/dump-from-db.ts
 *   npx tsx .../dump-from-db.ts --ids doc_xxx,doc_yyy
 *   npx tsx .../dump-from-db.ts --latest 5
 */

import "../../../../config/index.js";
import { pool } from "../../../../config/database.js";
import { decryptData } from "../../../../utils/crypto.js";
import { DOCUMENT_GRAPH_SCHEMA_VERSION, type CanonicalDocumentGraph } from "../../capabilities/ingest/document-structure/types.js";
import { dumpIngestDocumentGraph } from "./dump-ingest-graph.js";

async function main() {
  const argv = process.argv.slice(2);
  let latest = 5;
  let ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--latest" && argv[i + 1]) latest = Number(argv[++i]) || 5;
    if (argv[i] === "--ids" && argv[i + 1]) {
      ids = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  let result;
  if (ids.length) {
    result = await pool.query(
      `SELECT encrypted_payload FROM document_structure_artifacts
       WHERE file_id = ANY($1::text[]) AND schema_version = $2
       ORDER BY updated_at DESC`,
      [ids, DOCUMENT_GRAPH_SCHEMA_VERSION]
    );
  } else {
    result = await pool.query(
      `SELECT DISTINCT ON (file_id) encrypted_payload
       FROM document_structure_artifacts
       WHERE schema_version = $1
       ORDER BY file_id, updated_at DESC
       LIMIT $2`,
      [DOCUMENT_GRAPH_SCHEMA_VERSION, latest]
    );
  }

  const graphs: CanonicalDocumentGraph[] = [];
  for (const row of result.rows) {
    try {
      graphs.push(JSON.parse(decryptData(row.encrypted_payload)) as CanonicalDocumentGraph);
    } catch (err) {
      console.warn("skip decrypt/parse", err);
    }
  }
  if (!graphs.length) {
    console.error("No document_structure_artifacts found. Upload a doc first.");
    process.exit(1);
  }
  dumpIngestDocumentGraph(graphs);
  await pool.end().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
