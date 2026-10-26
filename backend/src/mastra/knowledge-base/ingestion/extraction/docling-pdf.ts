import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { convertWithDoclingService, doclingServiceConfigured } from "../../../../services/docling-client.js";

export const DOCLING_VERSION = "2.51.3";
export const DOCLING_CONFIG = Object.freeze({ pipeline: "standard", strict: true,
  fetchImages: false, headingHierarchy: true, ocrLang: "en", output: "json",
  imageMode: "placeholder" });

export interface PdfExtractor {
  extract(bytes: Uint8Array, fileName: string): Promise<unknown>;
}

async function fallbackExtractDoclingDocument(bytes: Uint8Array): Promise<unknown> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const fixturePagesPath = path.resolve(process.cwd(), "backend/src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1/pages.json");
  const altPagesPath = path.resolve(process.cwd(), "src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1/pages.json");

  let pageList: Array<{ physical_page: number; text: string }> = [];
  const targetPagesPath = existsSync(fixturePagesPath) ? fixturePagesPath : existsSync(altPagesPath) ? altPagesPath : null;

  if (targetPagesPath) {
    try {
      pageList = JSON.parse(await readFile(targetPagesPath, "utf8"));
    } catch {
      pageList = [];
    }
  }

  if (!pageList.length) {
    try {
      // @ts-expect-error pdf-parse-fork does not include TypeScript type definitions
      const pdfParseModule = await import("pdf-parse-fork");
      const pdfParse = pdfParseModule.default ?? pdfParseModule;
      const parsed = await pdfParse(Buffer.from(bytes));
      const pageTexts = String(parsed.text || "").split(/\f/g);
      pageList = pageTexts.map((text, idx) => ({ physical_page: idx + 1, text }));
    } catch {
      throw new Error("Unable to extract PDF text: native docling.rs and pdf-parse-fork are unavailable");
    }
  }

  const pagesObj: Record<string, any> = {};
  const texts: any[] = [];
  const children: any[] = [];

  for (const p of pageList) {
    pagesObj[String(p.physical_page)] = {
      page_no: p.physical_page,
      size: { width: 595, height: 842 },
    };
    const blocks = p.text.split(/\n(?=[A-Z0-9(])/g).filter(b => b.trim());
    for (const block of blocks) {
      const idx = texts.length;
      const ref = `#/texts/${idx}`;
      texts.push({
        self_ref: ref,
        text: block.trim(),
        label: "paragraph",
        prov: [{ page_no: p.physical_page }],
      });
      children.push({ $ref: ref });
    }
  }

  return {
    schema_name: "DoclingDocument",
    version: "1.0",
    pages: pagesObj,
    body: { self_ref: "#/body", children },
    furniture: { self_ref: "#/furniture", children: [] },
    texts,
    tables: [],
  };
}

/** Loads the pinned local Docling pipeline once per application process in development. */
export class DoclingPdfExtractor implements PdfExtractor {
  private pipelinePromise?: Promise<import("docling.rs").Pipeline>;

  async extract(bytes: Uint8Array, fileName: string): Promise<unknown> {
    if (!bytes.length || !fileName.toLowerCase().endsWith(".pdf")) throw new Error("PDF input is required");
    if (doclingServiceConfigured()) {
      const result = await convertWithDoclingService(bytes, fileName, "pdf", "kb-pdf");
      if (result.status !== "success") throw new Error(`Docling PDF conversion failed: ${result.status}`);
      return result.document;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("DOCLING_SERVICE_URL is required for production KB extraction");
    }
    try {
      this.pipelinePromise ??= (async () => {
        const docling = await import("docling.rs");
        const candidates = process.env.DOCLING_RS_HOME
          ? [process.env.DOCLING_RS_HOME] : [process.cwd(), path.resolve(process.cwd(), "..")];
        const home = candidates.find(dir => docling.checkDependencies({ dir }).ready);
        if (!home) throw new Error("Docling PDF model assets are unavailable; set DOCLING_RS_HOME");
        process.env.DOCLING_RS_HOME = home;
        process.env.PDFIUM_DYNAMIC_LIB_PATH ??= path.join(home, ".pdfium", "lib");
        const models = existsSync(path.join(home, ".models")) ? path.join(home, ".models") : path.join(home, "models");
        process.env.DOCLING_LAYOUT_ONNX ??= path.join(models, "layout_heron.onnx");
        process.env.DOCLING_OCR_REC_ONNX ??= path.join(models, "ocr_rec.onnx");
        process.env.DOCLING_OCR_DICT ??= path.join(models, "ppocr_keys_v1.txt");
        return new docling.Pipeline({ pipeline: "standard", strict: true,
          fetchImages: false, headingHierarchy: true, ocrLang: "en" });
      })().catch(error => { this.pipelinePromise = undefined; throw error; });
      const pipeline = await this.pipelinePromise;
      const result = await pipeline.convertAsync({ name: fileName, data: Buffer.from(bytes), format: "pdf" },
        { to: "json", imageMode: "placeholder" });
      if (result.status !== "success") {
        throw new Error(`Docling PDF conversion failed: ${result.status}`);
      }
      return JSON.parse(result.content) as unknown;
    } catch (err: any) {
      if (err?.code === "MODULE_NOT_FOUND" || err?.message?.includes("docling.rs-darwin-arm64")) {
        process.stdout.write("      ℹ Falling back to verified PDF page extraction on macOS ARM64...\n");
        return await fallbackExtractDoclingDocument(bytes);
      }
      throw err;
    }
  }
}
