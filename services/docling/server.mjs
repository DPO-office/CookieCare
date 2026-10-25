import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 25 * 1024 * 1024;
const MODES = new Set(["analysis-pdf", "analysis-document", "analysis-recovery", "kb-pdf"]);

function authenticated(header, token) {
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(token).digest();
  return Boolean(supplied) && timingSafeEqual(left, right);
}

function send(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": bytes.length,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(bytes);
}

export function createDoclingServer({ token, convert, chunkDocument, maxConcurrent = 1, timeoutMs = 120_000 }) {
  if (!token || token.length < 32) throw new Error("DOCLING_SERVICE_TOKEN must be at least 32 characters");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) {
    throw new Error("DOCLING_MAX_CONCURRENT must be between 1 and 4");
  }
  let active = 0;
  return http.createServer(async (req, res) => {
    if (!authenticated(req.headers.authorization, token)) return send(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { status: "ok" });
    const chunkRequest = req.url === "/v1/chunk";
    if (req.method !== "POST" || !["/v1/convert", "/v1/chunk"].includes(req.url)) return send(res, 404, { error: "not_found" });
    if (active >= maxConcurrent) return send(res, 503, { error: "busy" });
    const mode = req.headers["x-docling-mode"];
    const format = req.headers["x-docling-format"];
    let name;
    try { name = decodeURIComponent(String(req.headers["x-docling-name"] ?? "")); }
    catch { return send(res, 400, { error: "invalid_name" }); }
    if (!chunkRequest && (!MODES.has(mode) || typeof format !== "string" || !/^[a-z0-9]{1,12}$/.test(format) ||
        !name || name.length > 255 || /[\\/\r\n]/.test(name) ||
        req.headers["content-type"] !== "application/octet-stream" ||
        ((mode === "kb-pdf" || mode === "analysis-pdf" || mode === "analysis-recovery") && format !== "pdf"))) {
      return send(res, 400, { error: "invalid_request" });
    }
    if (Number(req.headers["content-length"]) > MAX_BYTES) return send(res, 413, { error: "too_large" });
    active++;
    const deadline = setTimeout(() => {
      if (!res.headersSent && !res.destroyed) send(res, 504, { error: "conversion_timeout" });
    }, timeoutMs);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) { send(res, 413, { error: "too_large" }); return; }
        chunks.push(chunk);
      }
      if (!size) return send(res, 400, { error: "empty_document" });
      if (chunkRequest) {
        if (!chunkDocument) return send(res, 503, { error: "chunker_unavailable" });
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { return send(res, 400, { error: "invalid_json" }); }
        if (req.headers["content-type"] !== "application/json" || !body.document?.body ||
            !Number.isInteger(body.maxTokens) || body.maxTokens < 256 || body.maxTokens > 8192) {
          return send(res, 400, { error: "invalid_chunk_request" });
        }
        const result = await chunkDocument(body.document, body.maxTokens);
        if (!res.headersSent && !res.destroyed) send(res, 200, { chunks: result });
        return;
      }
      const result = await convert({ bytes: Buffer.concat(chunks), name, format, mode });
      if (res.headersSent) return;
      if (!result || !["success", "partial_success"].includes(result.status) ||
          !result.document || typeof result.document !== "object" ||
          !result.document.body || typeof result.document.body !== "object" ||
          Array.isArray(result.document.body)) {
        return send(res, 502, { error: "conversion_failed" });
      }
      send(res, 200, { status: result.status, document: result.document });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        send(res, error?.message === "conversion_timeout" ? 504 : 502,
          { error: error?.message === "conversion_timeout" ? "conversion_timeout" : "conversion_failed" });
      }
    } finally {
      clearTimeout(deadline);
      active--;
    }
  });
}

export async function createNativeConverter() {
  const docling = await import("docling.rs");
  const readiness = docling.checkDependencies({ dir: process.env.DOCLING_RS_HOME ?? process.cwd() });
  if (!readiness.ready) throw new Error(`Docling assets unavailable: ${readiness.missing.join(", ")}`);
  const pipeline = new docling.Pipeline({ pipeline: "standard", strict: true,
    fetchImages: false, headingHierarchy: true, ocrLang: "en" });
  const strict = new docling.DocumentConverter({ strict: true, fetchImages: false });
  const recovery = new docling.DocumentConverter({ strict: false, fetchImages: false });
  return async ({ bytes, name, format, mode }) => {
    const input = { name, data: bytes, format };
    const options = { to: "json", imageMode: "placeholder" };
    const result = mode === "analysis-recovery" ? await recovery.convertAsync(input, options)
      : mode === "analysis-document" ? await strict.convertAsync(input, options)
      : await pipeline.convertAsync(input, options);
    return { status: result.status, document: JSON.parse(result.content) };
  };
}

export async function createNativeChunker() {
  const { chunkDocumentAsync } = await import("docling.rs");
  return (document, maxTokens) => chunkDocumentAsync(JSON.stringify(document), {
    chunker: "hybrid", maxTokens, mergePeers: true,
    ...(process.env.DOCLING_CHUNK_TOKENIZER ? { tokenizer: process.env.DOCLING_CHUNK_TOKENIZER } : {}),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.DOCLING_SERVICE_TOKEN;
  const convert = await createNativeConverter();
  const chunkDocument = await createNativeChunker();
  createDoclingServer({ token, convert, chunkDocument, maxConcurrent: Number(process.env.DOCLING_MAX_CONCURRENT ?? 1) })
    .listen(Number(process.env.PORT ?? 8090), "0.0.0.0");
}
