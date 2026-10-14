import path from "node:path";
import { existsSync } from "node:fs";
import { convertWithDoclingService, doclingServiceConfigured } from "../../../../services/docling-client.js";

export const DOCLING_VERSION = "1.41.0";
export const DOCLING_CONFIG = Object.freeze({ pipeline: "standard", strict: true,
  fetchImages: false, headingHierarchy: true, ocrLang: "en", output: "json",
  imageMode: "placeholder" });

export interface PdfExtractor {
  extract(bytes: Uint8Array, fileName: string): Promise<unknown>;
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
  }
}
