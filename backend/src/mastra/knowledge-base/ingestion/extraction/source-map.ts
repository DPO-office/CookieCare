import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;
export interface SourceSpan {
  start: number;
  end: number;
  itemRef: string;
  page: number | null;
  provenance: unknown[];
  kind: "text" | "table_cell" | "item";
  row?: number;
  column?: number;
  bbox?: unknown;
}
export interface SourceMap {
  schemaVersion: 1;
  text: string;
  textHash: string;
  spans: SourceSpan[];
  pages: Array<{ physicalPage: number; printedPageLabel: string | null; width: number | null;
    height: number | null; itemCount: number; status: "mapped" | "missing" }>;
  warnings: string[];
  status: "mapped" | "needs_review";
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function reference(value: unknown): string | null {
  return typeof object(value)?.$ref === "string" ? object(value)!.$ref as string : null;
}
function pageOf(provenance: unknown[]): number | null {
  const pages = new Set(provenance.map(p => object(p)?.page_no).filter(
    (p): p is number => typeof p === "number" && Number.isInteger(p) && p > 0));
  return pages.size === 1 ? [...pages][0] : null;
}

/** Canonical text preserves Docling's characters. Offsets are JavaScript UTF-16 slice positions. */
export function buildSourceMap(raw: unknown, originalPageCount: number): SourceMap {
  const document = object(raw);
  if (!document || !object(document.body) || !object(document.pages) ||
      !Number.isInteger(originalPageCount) || originalPageCount < 1) {
    throw new Error("Docling document or original PDF page count is invalid");
  }
  const warnings: string[] = [];
  const seen = new Set<string>();
  const spans: SourceSpan[] = [];
  const parts: string[] = [];
  let length = 0;
  const append = (value: string, span: Omit<SourceSpan, "start" | "end">) => {
    if (!value.length) return;
    if (length) { parts.push("\n"); length++; }
    const start = length;
    parts.push(value);
    length += value.length;
    spans.push({ start, end: length, ...span });
  };
  const resolve = (ref: string): JsonObject => {
    if (!ref.startsWith("#/")) throw new Error(`Invalid Docling reference: ${ref}`);
    let value: unknown = document;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      value = Array.isArray(value) ? value[Number(key)] : object(value)?.[key];
    }
    const item = object(value);
    if (!item) throw new Error(`Missing Docling item: ${ref}`);
    return item;
  };
  const visit = (ref: string) => {
    if (seen.has(ref)) return;
    seen.add(ref);
    const item = resolve(ref);
    if (item.self_ref !== undefined && item.self_ref !== ref) throw new Error(`Docling reference mismatch: ${ref}`);
    const provenance = Array.isArray(item.prov) ? item.prov : [];
    const page = pageOf(provenance);
    if (typeof item.text === "string") {
      append(item.text, { itemRef: ref, page, provenance, kind: "text" });
      if (item.text && page === null) warnings.push(`No unique physical page for ${ref}`);
    } else if (Array.isArray(object(item.data)?.table_cells)) {
      const cells = object(item.data)!.table_cells as unknown[];
      const sorted = cells.map((cell, index) => ({ cell: object(cell), index })).sort((a, b) =>
        Number(a.cell?.start_row_offset_idx ?? 0) - Number(b.cell?.start_row_offset_idx ?? 0) ||
        Number(a.cell?.start_col_offset_idx ?? 0) - Number(b.cell?.start_col_offset_idx ?? 0) || a.index - b.index);
      for (const { cell, index } of sorted) {
        if (!cell || typeof cell.text !== "string") throw new Error(`Invalid table cell ${ref}:${index}`);
        append(cell.text, { itemRef: ref, page, provenance, kind: "table_cell",
          row: Number(cell.start_row_offset_idx), column: Number(cell.start_col_offset_idx), bbox: cell.bbox });
      }
      if (cells.length && page === null) warnings.push(`No unique physical page for ${ref}`);
    } else if (typeof item.content === "string") {
      append(item.content, { itemRef: ref, page, provenance, kind: "item" });
      if (item.content && page === null) warnings.push(`No unique physical page for ${ref}`);
    }
    const children = item.children;
    if (Array.isArray(children)) for (const child of children) {
      const childRef = reference(child);
      if (!childRef) throw new Error(`Invalid child reference in ${ref}`);
      visit(childRef);
    }
  };
  visit("#/body");
  if (object(document.furniture)) visit("#/furniture");
  for (const collection of ["texts", "tables", "pictures", "key_value_items", "form_items"]) {
    const items = document[collection];
    if (!Array.isArray(items)) continue;
    for (let i = 0; i < items.length; i++) {
      const ref = `#/${collection}/${i}`;
      if (!seen.has(ref)) { warnings.push(`Unreferenced Docling item retained: ${ref}`); visit(ref); }
    }
  }
  const rawPages = document.pages as JsonObject;
  const pageCounts = new Map<number, number>();
  for (const span of spans) if (span.page !== null) {
    if (span.page > originalPageCount) warnings.push(`Item outside original PDF: ${span.itemRef}`);
    pageCounts.set(span.page, (pageCounts.get(span.page) ?? 0) + 1);
  }
  const pages = Array.from({ length: originalPageCount }, (_, index) => {
    const physicalPage = index + 1;
    const entry = object(rawPages[String(physicalPage)]);
    const size = object(entry?.size);
    const itemCount = pageCounts.get(physicalPage) ?? 0;
    if (!entry || !itemCount) warnings.push(`No mapped text on physical page ${physicalPage}`);
    return { physicalPage, printedPageLabel: null,
      width: typeof size?.width === "number" ? size.width : null,
      height: typeof size?.height === "number" ? size.height : null,
      itemCount, status: entry && itemCount ? "mapped" as const : "missing" as const };
  });
  for (const key of Object.keys(rawPages)) {
    const page = Number(key);
    if (!Number.isInteger(page) || page < 1 || page > originalPageCount) warnings.push(`Docling page outside original PDF: ${key}`);
  }
  const text = parts.join("");
  if (!text) warnings.push("Docling extracted no text");
  for (const span of spans) if (!text.slice(span.start, span.end)) throw new Error("Empty source span");
  return { schemaVersion: 1, text, textHash: createHash("sha256").update(text).digest("hex"),
    spans, pages, warnings, status: warnings.length ? "needs_review" : "mapped" };
}
