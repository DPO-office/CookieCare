import { readFile } from "node:fs/promises";
import { DoclingPdfExtractor } from "../extraction/docling-pdf.js";
import { buildSourceMap } from "../extraction/source-map.js";
import { inspectOriginalPdf } from "../storage/pdf-metadata.js";

const file = process.argv[2];
if (!file) throw new Error("Usage: node --import tsx manual-docling-smoke.ts <pdf-path>");
const bytes = await readFile(file);
const original = await inspectOriginalPdf(bytes);
if (!original.pageCount) throw new Error("Original PDF page count is unavailable");
const raw = await new DoclingPdfExtractor().extract(bytes, "source.pdf");
const map = buildSourceMap(raw, original.pageCount);
const quote = process.argv[3];
const matches = quote ? map.spans.filter(span => map.text.slice(span.start, span.end).includes(quote))
  .map(span => ({ itemRef: span.itemRef, physicalPage: span.page, provenance: span.provenance })) : [];
console.log(JSON.stringify({ pages: map.pages.length, spans: map.spans.length,
  tableCells: map.spans.filter(span => span.kind === "table_cell").length,
  textLength: map.text.length, status: map.status, warnings: map.warnings.slice(0, 10),
  keys: Object.keys(raw as Record<string, unknown>), matches: matches.slice(0, 5) }));
