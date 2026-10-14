/**
 * OPTIONAL offline rebuild (not the primary path).
 *
 * Primary: upload + run analysis in the app. The compliance pipeline dumps
 * the EXACT structural graph into ./out via dump-structure-tree.ts
 * (hooked from recordReferenceIndex). Open out/index.html after the run
 * reaches Phase 1B/1C.
 *
 * This script is only for rebuilding from DB/local files without a full
 * analysis run — it calls the same buildStructuralNodes/buildReferenceIndex
 * functions but is NOT the analysis object graph.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../../../../config/index.js";
import { pool } from "../../../../config/database.js";
import { decryptData } from "../../../../utils/crypto.js";
import { extractText } from "../../../../utils/extractText.js";
import {
  buildStructuralNodes,
  type StructuralNode,
} from "../../segmentation/structural-nodes.js";
import {
  buildReferenceIndex,
  type DefinitionIndexEntry,
  type ReferenceRecord,
} from "../../segmentation/reference-index.js";
import { segmentDocument } from "../../segmentation/segment-document.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOCS = path.join(__dirname, "docs");
const OUT_DIR = path.join(__dirname, "out");
const VIEWER_TEMPLATE = path.join(__dirname, "viewer.template.html");

const TEXT_EXTS = new Set([".txt", ".md", ".text"]);
const BINARY_EXTS = new Set([".pdf", ".docx"]);

interface DocPayload {
  documentId: string;
  sourceFile: string;
  fullText: string;
  charCount: number;
  lineCount: number;
  nodes: StructuralNode[];
  definitions: DefinitionIndexEntry[];
  references: ReferenceRecord[];
  countsByKind: Record<string, number>;
  orphanCount: number;
  legacySegmentCount: number;
}

interface CliArgs {
  fromDb: boolean;
  latest: number;
  ids: string[];
  title: string | null;
  docsDir: string;
  singleFile: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    fromDb: false,
    latest: 5,
    ids: [],
    title: null,
    docsDir: DEFAULT_DOCS,
    singleFile: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-db") {
      args.fromDb = true;
    } else if (a === "--latest" && argv[i + 1]) {
      args.latest = Math.max(1, Number(argv[++i]) || 5);
    } else if (a === "--ids" && argv[i + 1]) {
      args.ids = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      args.fromDb = true;
    } else if (a === "--title" && argv[i + 1]) {
      args.title = argv[++i];
      args.fromDb = true;
    } else if (a === "--docs" && argv[i + 1]) {
      args.docsDir = path.resolve(argv[++i]);
    } else if (a === "--file" && argv[i + 1]) {
      args.singleFile = path.resolve(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage (UI upload path):
  npx tsx src/modules/analysis/temp/structure-tree/build-structure-tree.ts --from-db
  npx tsx ... --from-db --latest 5
  npx tsx ... --from-db --ids doc_abc,doc_def
  npx tsx ... --from-db --title "partial title match"

Fallback:
  --file <path> | --docs <folder>

Writes out/<docId>.json and out/index.html`);
      process.exit(0);
    }
  }

  // Default to DB when no local file args are given.
  if (!args.singleFile && args.docsDir === DEFAULT_DOCS && !argv.includes("--docs")) {
    const hasLocalDocs =
      fs.existsSync(DEFAULT_DOCS) &&
      fs.readdirSync(DEFAULT_DOCS).some((n) => {
        const ext = path.extname(n).toLowerCase();
        return !n.startsWith(".") && (TEXT_EXTS.has(ext) || BINARY_EXTS.has(ext));
      });
    if (!hasLocalDocs || args.fromDb || args.ids.length || args.title) {
      args.fromDb = true;
    }
  }

  return args;
}

function slugDocId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

async function loadTextFromDisk(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTS.has(ext)) return fs.readFileSync(filePath, "utf8");
  if (BINARY_EXTS.has(ext)) {
    const buf = fs.readFileSync(filePath);
    const result = await extractText(buf, mimeFor(filePath));
    return result.text;
  }
  throw new Error(`Unsupported extension: ${ext} (${filePath})`);
}

function countKinds(nodes: StructuralNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  return counts;
}

function orphanCount(nodes: StructuralNode[]): number {
  const ids = new Set(nodes.map((n) => n.spanId));
  let orphans = 0;
  for (const n of nodes) {
    if (n.kind === "document") continue;
    if (n.parentSpanId && !ids.has(n.parentSpanId)) orphans += 1;
  }
  return orphans;
}

function buildPayload(documentId: string, sourceFile: string, fullTextRaw: string): DocPayload {
  const fullText = fullTextRaw.replace(/\r\n/g, "\n");
  const nodes = buildStructuralNodes({ documentId, fullText });
  const { definitions, references } = buildReferenceIndex(nodes);
  const legacy = segmentDocument(documentId, fullText, { title: sourceFile });
  return {
    documentId,
    sourceFile,
    fullText,
    charCount: fullText.length,
    lineCount: fullText.split("\n").length,
    nodes,
    definitions,
    references,
    countsByKind: countKinds(nodes),
    orphanCount: orphanCount(nodes),
    legacySegmentCount: legacy.segments.length,
  };
}

interface DbFileRow {
  id: string;
  title: string;
  content: string | null;
  is_encrypted: boolean;
  updated_at: Date | string;
  mime_type: string | null;
}

async function fetchDocsFromDb(args: CliArgs): Promise<Array<{ id: string; title: string; text: string }>> {
  let result;
  if (args.ids.length > 0) {
    result = await pool.query(
      `SELECT id, title, content, is_encrypted, updated_at, mime_type
       FROM files
       WHERE id = ANY($1::text[])
       ORDER BY updated_at DESC`,
      [args.ids]
    );
  } else if (args.title) {
    result = await pool.query(
      `SELECT id, title, content, is_encrypted, updated_at, mime_type
       FROM files
       WHERE title ILIKE $1
         AND content IS NOT NULL
         AND length(content) > 0
       ORDER BY updated_at DESC
       LIMIT $2`,
      [`%${args.title}%`, args.latest]
    );
  } else {
    // Latest uploaded/processed docs with extracted text.
    result = await pool.query(
      `SELECT id, title, content, is_encrypted, updated_at, mime_type
       FROM files
       WHERE content IS NOT NULL
         AND length(content) > 0
       ORDER BY updated_at DESC
       LIMIT $1`,
      [args.latest]
    );
  }

  const rows = result.rows as DbFileRow[];
  if (rows.length === 0) {
    throw new Error(
      "No documents with extracted content found in DB.\n" +
        "Upload via the UI and wait until file processing finishes, then re-run."
    );
  }

  const out: Array<{ id: string; title: string; text: string }> = [];
  for (const row of rows) {
    const raw = row.content ?? "";
    const text = row.is_encrypted ? decryptData(raw) : raw;
    if (!text || text.startsWith("[DECRYPTION")) {
      console.warn(`  skip ${row.id} (${row.title}): empty or decrypt failed`);
      continue;
    }
    out.push({ id: row.id, title: row.title || row.id, text });
  }
  if (out.length === 0) {
    throw new Error("Found file rows but none yielded usable decrypted text.");
  }
  return out;
}

function collectLocalFiles(docsDir: string, singleFile: string | null): string[] {
  if (singleFile) {
    if (!fs.existsSync(singleFile)) throw new Error(`File not found: ${singleFile}`);
    return [singleFile];
  }
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  return fs
    .readdirSync(docsDir)
    .filter((name) => {
      if (name.startsWith(".")) return false;
      const ext = path.extname(name).toLowerCase();
      return TEXT_EXTS.has(ext) || BINARY_EXTS.has(ext);
    })
    .map((name) => path.join(docsDir, name))
    .sort((a, b) => a.localeCompare(b));
}

function writeViewer(docs: DocPayload[]): void {
  if (!fs.existsSync(VIEWER_TEMPLATE)) {
    throw new Error(`Missing viewer template: ${VIEWER_TEMPLATE}`);
  }
  const template = fs.readFileSync(VIEWER_TEMPLATE, "utf8");
  const embed = docs.map((d) => ({
    documentId: d.documentId,
    sourceFile: d.sourceFile,
    charCount: d.charCount,
    lineCount: d.lineCount,
    countsByKind: d.countsByKind,
    orphanCount: d.orphanCount,
    legacySegmentCount: d.legacySegmentCount,
    nodes: d.nodes.map((n) => ({
      spanId: n.spanId,
      documentId: n.documentId,
      kind: n.kind,
      structuralPath: n.structuralPath,
      parentSpanId: n.parentSpanId,
      order: n.order,
      sourceOffsets: n.sourceOffsets,
      contentHash: n.contentHash,
      definedTerm: n.definedTerm,
      normalizedText: n.normalizedText,
      rawPreview: n.rawText.slice(0, 600),
    })),
    definitions: d.definitions,
    references: d.references,
  }));

  const html = template.replace(
    "/*__STRUCTURE_TREE_DATA__*/",
    `window.__STRUCTURE_TREE__ = ${JSON.stringify(embed, null, 2)};`
  );
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html, "utf8");
}

function writeJson(payload: DocPayload): void {
  const jsonPath = path.join(OUT_DIR, `${slugDocId(payload.documentId)}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        documentId: payload.documentId,
        sourceFile: payload.sourceFile,
        charCount: payload.charCount,
        lineCount: payload.lineCount,
        countsByKind: payload.countsByKind,
        orphanCount: payload.orphanCount,
        legacySegmentCount: payload.legacySegmentCount,
        nodes: payload.nodes,
        definitions: payload.definitions,
        references: payload.references,
        fullText: payload.fullText,
      },
      null,
      2
    ),
    "utf8"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const payloads: DocPayload[] = [];

  if (args.fromDb) {
    console.log(
      `Fetching from DB` +
        (args.ids.length
          ? ` (ids=${args.ids.join(",")})`
          : args.title
            ? ` (title~"${args.title}", limit=${args.latest})`
            : ` (latest ${args.latest} with content)`) +
        "…"
    );
    const docs = await fetchDocsFromDb(args);
    for (const doc of docs) {
      process.stdout.write(`  Building: ${doc.title} (${doc.id}) … `);
      const payload = buildPayload(doc.id, doc.title, doc.text);
      payloads.push(payload);
      writeJson(payload);
      console.log(
        `${payload.nodes.length} nodes | orphans=${payload.orphanCount} | refs=${payload.references.length}`
      );
    }
  } else {
    const files = collectLocalFiles(args.docsDir, args.singleFile);
    if (files.length === 0) {
      console.error(
        "No local docs and --from-db not set.\n" +
          "Upload via UI then run with --from-db, or pass --file / --docs."
      );
      process.exit(1);
    }
    for (const file of files) {
      process.stdout.write(`Building: ${path.basename(file)} … `);
      const text = await loadTextFromDisk(file);
      const payload = buildPayload(slugDocId(file), path.basename(file), text);
      payloads.push(payload);
      writeJson(payload);
      console.log(
        `${payload.nodes.length} nodes | orphans=${payload.orphanCount} | refs=${payload.references.length}`
      );
    }
  }

  writeViewer(payloads);
  console.log(`\nViewer: ${path.join(OUT_DIR, "index.html")}`);
  console.log("Open that file in a browser to inspect the system tree.");
  await pool.end().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
