import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { extractText } from "../../../../../utils/extractText.js";
import type { CanonicalTable, ParsedBlock, ParsedDocument, SourceBox, SourceProvenance, StructureWarning } from "./types.js";

const DOCLING_VERSION = "1.41.0";
const require = createRequire(path.join(process.cwd(), "package.json"));

type DoclingAddon = typeof import("docling.rs");
type DocumentConverter = InstanceType<DoclingAddon["DocumentConverter"]>;
type Pipeline = InstanceType<DoclingAddon["Pipeline"]>;

let doclingLoad: Promise<DoclingAddon> | undefined;
let converter: DocumentConverter | undefined;
let recoveryConverter: DocumentConverter | undefined;
let pdfPipeline: Pipeline | undefined;

function allowLegacyFallback(): boolean {
  const flag = (process.env.DOCUMENT_PARSER_FALLBACK || "").trim();
  if (flag === "1" || flag.toLowerCase() === "true") return true;
  if (flag === "0" || flag.toLowerCase() === "false") return false;
  // Production must use Docling. Local/test can fall back if the native addon is missing.
  return process.env.NODE_ENV !== "production";
}

function wireDoclingEnv(home = process.env.DOCLING_RS_HOME || process.cwd()) {
  const resolved = path.resolve(home);
  const models = fs.existsSync(path.join(resolved, ".models"))
    ? path.join(resolved, ".models")
    : path.join(resolved, "models");
  const pdfiumLibDir = process.env.PDFIUM_DYNAMIC_LIB_PATH || path.join(resolved, ".pdfium", "lib");
  process.env.DOCLING_RS_HOME = resolved;
  process.env.PDFIUM_DYNAMIC_LIB_PATH = pdfiumLibDir;
  const layout = path.join(models, "layout_heron.onnx");
  const ocrRec = path.join(models, "ocr_rec.onnx");
  const ocrDict = path.join(models, "ppocr_keys_v1.txt");
  if (fs.existsSync(layout)) process.env.DOCLING_LAYOUT_ONNX = layout;
  if (fs.existsSync(ocrRec)) process.env.DOCLING_OCR_REC_ONNX = ocrRec;
  if (fs.existsSync(ocrDict)) process.env.DOCLING_OCR_DICT = ocrDict;
  const nativeDirs = [
    pdfiumLibDir,
    path.join(resolved, "node_modules", "docling.rs"),
    path.join(resolved, "node_modules", "docling.rs-linux-x64-gnu"),
  ].filter((dir) => fs.existsSync(dir));
  const current = process.env.LD_LIBRARY_PATH || "";
  const merged = [...nativeDirs, ...current.split(path.delimiter).filter(Boolean)];
  process.env.LD_LIBRARY_PATH = [...new Set(merged)].join(path.delimiter);
}

function unwrapDocling(mod: Record<string, unknown>): DoclingAddon {
  const candidate = (mod.Pipeline ? mod : mod.default) as DoclingAddon | undefined;
  if (!candidate?.Pipeline || !candidate.checkDependencies) {
    throw new Error(`docling.rs export shape invalid: ${Object.keys(mod).join(",") || "(empty)"}`);
  }
  return candidate;
}

async function loadDocling(): Promise<DoclingAddon> {
  if (!doclingLoad) {
    wireDoclingEnv();
    doclingLoad = (async () => {
      try {
        return unwrapDocling(require("docling.rs") as Record<string, unknown>);
      } catch (cjsErr) {
        console.error("[docling] CJS load failed:", cjsErr);
        try {
          return unwrapDocling(await import("docling.rs") as Record<string, unknown>);
        } catch (esmErr) {
          const wrapped = esmErr instanceof Error ? esmErr : new Error(String(esmErr));
          console.error("[docling] ESM load failed:", wrapped);
          throw wrapped;
        }
      }
    })().catch((err) => {
      doclingLoad = undefined;
      throw err;
    });
  }
  return doclingLoad;
}

async function getConverter() {
  const { DocumentConverter } = await loadDocling();
  return (converter ??= new DocumentConverter({ strict: true, fetchImages: false }));
}

async function getRecoveryConverter() {
  const { DocumentConverter } = await loadDocling();
  return (recoveryConverter ??= new DocumentConverter({ strict: false, fetchImages: false }));
}

function resolveDoclingHome(checkDependencies: DoclingAddon["checkDependencies"]): string {
  if (process.env.DOCLING_RS_HOME) return process.env.DOCLING_RS_HOME;

  // Root scripts install assets beside the repository package.json. Most app
  // entrypoints run there, while backend-local tests and scripts run one level
  // deeper. Probe both without tying the deployment to a machine-specific path.
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];
  return candidates.find((candidate) => checkDependencies({ dir: candidate }).ready) ?? process.cwd();
}

export async function getDocumentParserReadiness() {
  try {
    const { checkDependencies } = await loadDocling();
    const home = resolveDoclingHome(checkDependencies);
    const status = checkDependencies({ dir: home });
    // docling.rs resolves the native model paths from this variable when the
    // warm Pipeline is constructed and when its guarded conversion runs.
    if (status.ready && !process.env.DOCLING_RS_HOME) process.env.DOCLING_RS_HOME = home;
    return {
      ready: status.ready,
      pdfReady: status.ready,
      pdfium: status.pdfium,
      layout: status.layout,
      ocr: status.ocr,
      tableformer: status.tableformer,
      missing: status.missing,
      error: undefined as string | undefined,
    };
  } catch (err) {
    return {
      ready: false,
      pdfReady: false,
      pdfium: false,
      layout: false,
      ocr: false,
      tableformer: false,
      missing: ["docling.rs native addon"],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatForMime(mimeType: string, fileName: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized.includes("wordprocessingml")) return "docx";
  if (normalized === "application/msword") return "doc";
  if (normalized === "text/markdown") return "md";
  if (normalized === "text/html") return "html";
  if (normalized === "text/csv") return "csv";
  if (normalized === "application/json") return "json";
  return fileName.split(".").pop()?.toLowerCase() || "txt";
}

function fileNameForFormat(fileName: string, format: string): string {
  const trimmed = fileName.trim() || "document";
  return trimmed.toLowerCase().endsWith(`.${format}`) ? trimmed : `${trimmed}.${format}`;
}

function sourceBox(value: any): SourceBox | undefined {
  const bbox = value?.bbox ?? value;
  const left = Number(bbox?.l ?? bbox?.left);
  const top = Number(bbox?.t ?? bbox?.top);
  const right = Number(bbox?.r ?? bbox?.right);
  const bottom = Number(bbox?.b ?? bbox?.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return undefined;
  return { left, top, right, bottom, coordOrigin: bbox?.coord_origin };
}

function provenance(item: any, itemRef: string): SourceProvenance[] {
  const records = Array.isArray(item?.prov) ? item.prov : [];
  if (!records.length) return [{ itemRef }];
  return records.map((record: any) => ({
    itemRef,
    page: Number.isFinite(Number(record?.page_no ?? record?.page)) ? Number(record.page_no ?? record.page) : undefined,
    bbox: sourceBox(record),
    charSpan: Number.isFinite(Number(record?.charspan?.[0])) && Number.isFinite(Number(record?.charspan?.[1]))
      ? [Number(record.charspan[0]), Number(record.charspan[1])]
      : undefined,
  }));
}

function tableFromItem(item: any): CanonicalTable {
  const data = item?.data ?? {};
  const rawCells = Array.isArray(data.table_cells) ? data.table_cells : [];
  return {
    rows: Number(data.num_rows ?? 0),
    columns: Number(data.num_cols ?? 0),
    cells: rawCells.map((cell: any) => ({
      text: String(cell?.text ?? ""),
      rowStart: Number(cell?.start_row_offset_idx ?? 0),
      rowEnd: Number(cell?.end_row_offset_idx ?? 0),
      columnStart: Number(cell?.start_col_offset_idx ?? 0),
      columnEnd: Number(cell?.end_col_offset_idx ?? 0),
      rowSpan: Number(cell?.row_span ?? 1),
      columnSpan: Number(cell?.col_span ?? 1),
      columnHeader: cell?.column_header === true,
      rowHeader: cell?.row_header === true,
    })),
  };
}

function tableText(table: CanonicalTable): string {
  if (!table.rows || !table.columns) return table.cells.map((cell) => cell.text).join("\t");
  const grid: string[][] = Array.from({ length: table.rows }, () => Array(table.columns).fill(""));
  for (const cell of table.cells) {
    if (grid[cell.rowStart]?.[cell.columnStart] !== undefined) grid[cell.rowStart][cell.columnStart] = cell.text;
  }
  return grid.map((row) => row.join("\t")).join("\n");
}

function itemAtRef(document: any, ref: string): any {
  if (ref === "#/body") return document.body;
  let value: any = document;
  for (const part of ref.replace(/^#\//, "").split("/")) value = value?.[part];
  return value;
}

function orderedItems(document: any): Array<{ ref: string; item: any }> {
  const output: Array<{ ref: string; item: any }> = [];
  const visited = new Set<string>();
  const visit = (entry: any) => {
    const ref = typeof entry?.$ref === "string" ? entry.$ref : entry?.self_ref;
    if (!ref || visited.has(ref)) return;
    visited.add(ref);
    const item = itemAtRef(document, ref) ?? entry;
    const isContainer = ref === "#/body" || ref.startsWith("#/groups/");
    if (!isContainer) output.push({ ref, item });
    for (const child of Array.isArray(item?.children) ? item.children : []) visit(child);
  };
  visit(document.body ?? { self_ref: "#/body", children: [] });
  return output;
}

function blocksFromDocling(document: any): { canonicalText: string; blocks: ParsedBlock[]; pageCount?: number } {
  const pending = orderedItems(document).map(({ ref, item }) => {
    const table = ref.startsWith("#/tables/") || item?.label === "table" ? tableFromItem(item) : undefined;
    return {
      sourceItemRef: ref,
      label: String(item?.label ?? "unknown"),
      level: Number.isFinite(Number(item?.level)) ? Number(item.level) : undefined,
      text: table ? tableText(table) : String(item?.text ?? item?.orig ?? "").trim(),
      provenance: provenance(item, ref),
      table,
    };
  }).filter((block) => block.text.length > 0 || block.table);

  let cursor = 0;
  const pieces: string[] = [];
  const blocks: ParsedBlock[] = [];
  for (const block of pending) {
    if (pieces.length) cursor += 1;
    const start = cursor;
    pieces.push(block.text);
    cursor += block.text.length;
    blocks.push({ ...block, sourceRange: [start, cursor] });
  }
  const pages = blocks.flatMap((block) => block.provenance.map((record) => record.page)).filter((page): page is number => page !== undefined);
  const pageCount = pages.length ? Math.max(...pages) + (Math.min(...pages) === 0 ? 1 : 0) : undefined;
  return { canonicalText: pieces.join("\n"), blocks, pageCount };
}

function nativeTextDocument(buffer: Buffer, format: string): ParsedDocument {
  const text = buffer.toString("utf8").replace(/\0/g, "").replace(/\r\n/g, "\n");
  let cursor = 0;
  const blocks: ParsedBlock[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    const start = cursor;
    cursor += line.length + 1;
    if (!line.trim()) continue;
    const leading = line.length - line.trimStart().length;
    const value = line.trim();
    blocks.push({ sourceItemRef: `#/text-lines/${index}`, label: "text", text: value,
      sourceRange: [start + leading, start + leading + value.length],
      provenance: [{ itemRef: `#/text-lines/${index}` }] });
  }
  return { parser: { name: "text-native", version: "1", format, status: "success" }, canonicalText: text, blocks, warnings: [] };
}

async function legacyFallback(buffer: Buffer, mimeType: string, format: string, cause: unknown): Promise<ParsedDocument> {
  const extracted = await extractText(buffer, mimeType);
  const text = typeof extracted === "string" ? extracted : extracted.text;
  const native = nativeTextDocument(Buffer.from(text), format);
  const warning: StructureWarning = {
    code: "format_parser_fallback", severity: "critical",
    message: `Docling could not parse this ${format} document; legacy extraction was retained for recovery only (${cause instanceof Error ? cause.message : String(cause)}).`,
  };
  return { ...native, parser: { name: "legacy-fallback", version: "1", format, status: "partial_success" }, warnings: [warning] };
}

export async function parseDocument(buffer: Buffer, mimeType: string, fileName: string): Promise<ParsedDocument> {
  const format = formatForMime(mimeType, fileName);
  if (["txt", "json", "csv"].includes(format)) return nativeTextDocument(buffer, format);
  try {
    let result;
    if (format === "pdf") {
      const dependencies = await getDocumentParserReadiness();
      if (!dependencies.ready) throw new Error(`Docling PDF dependencies missing: ${dependencies.missing.join(", ")}${dependencies.error ? ` (${dependencies.error})` : ""}`);
      const { Pipeline } = await loadDocling();
      pdfPipeline ??= new Pipeline({ strict: true, fetchImages: false, headingHierarchy: true, ocrLang: "en" });
      result = await pdfPipeline.convertAsync(
        { name: fileNameForFormat(fileName, format), data: buffer, format },
        { to: "json", imageMode: "placeholder" }
      );
    } else {
      result = await (await getConverter()).convertAsync(
        { name: fileNameForFormat(fileName, format), data: buffer, format },
        { to: "json", imageMode: "placeholder" }
      );
    }
    const parsed = blocksFromDocling(JSON.parse(result.content));
    const warnings: StructureWarning[] = result.status === "success" ? [] : [{
      code: "docling_partial_success", severity: "warning", message: `Docling completed with status ${result.status}.`,
    }];
    console.log(`[docling] parsed ${format} with docling.rs@${DOCLING_VERSION} status=${result.status}`);
    return { parser: { name: "docling.rs", version: DOCLING_VERSION, format, status: result.status }, ...parsed, warnings };
  } catch (error) {
    if (format === "pdf" && (await getDocumentParserReadiness()).ready) {
      try {
        const recovered = await (await getRecoveryConverter()).convertAsync(
          { name: fileNameForFormat(fileName, format), data: buffer, format },
          { to: "json", imageMode: "placeholder" }
        );
        const parsed = blocksFromDocling(JSON.parse(recovered.content));
        console.log(`[docling] recovered ${format} with tolerant docling.rs pass status=${recovered.status}`);
        return {
          parser: { name: "docling.rs", version: DOCLING_VERSION, format, status: recovered.status },
          ...parsed,
          warnings: [{
            code: "docling_recovery_pass",
            severity: "warning",
            message: "The warm strict PDF pass failed; Docling recovered the document with its tolerant conversion pass.",
          }],
        };
      } catch (recoveryError) {
        if (allowLegacyFallback()) {
          return legacyFallback(buffer, mimeType, format,
            `strict pass: ${error instanceof Error ? error.message : String(error)}; recovery pass: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
        }
        throw new Error(
          `Docling failed to parse this ${format} document: ` +
          `${error instanceof Error ? error.message : String(error)}; recovery: ` +
          `${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
        );
      }
    }
    if (allowLegacyFallback()) {
      return legacyFallback(buffer, mimeType, format, error);
    }
    throw new Error(
      `Docling is required for ${format} parsing in production. ` +
      `${error instanceof Error ? error.message : String(error)}. ` +
      `Set DOCUMENT_PARSER_FALLBACK=1 only as an emergency override.`
    );
  }
}
