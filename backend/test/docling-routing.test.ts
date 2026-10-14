import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { parseDocument } from "../src/modules/analysis/capabilities/ingest/document-structure/parser.js";
import { DoclingPdfExtractor } from "../src/mastra/knowledge-base/ingestion/extraction/docling-pdf.js";

const document = { body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }] },
  texts: [{ self_ref: "#/texts/0", label: "text", text: "Remote clause" }] };

async function fixture(t: { after: (fn: () => void) => void }, status: number) {
  const previousUrl = process.env.DOCLING_SERVICE_URL;
  const previousToken = process.env.DOCLING_SERVICE_TOKEN;
  const modes: string[] = [];
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-token-with-at-least-thirty-two-characters");
    modes.push(String(req.headers["x-docling-mode"]));
    for await (const _chunk of req) { /* consume the document */ }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { status: "success", document } : { error: "busy" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.DOCLING_SERVICE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  process.env.DOCLING_SERVICE_TOKEN = "test-token-with-at-least-thirty-two-characters";
  t.after(() => {
    server.close();
    if (previousUrl === undefined) delete process.env.DOCLING_SERVICE_URL;
    else process.env.DOCLING_SERVICE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.DOCLING_SERVICE_TOKEN;
    else process.env.DOCLING_SERVICE_TOKEN = previousToken;
  });
  return modes;
}

test("analysis and KB extraction both use the remote Docling document", async t => {
  const modes = await fixture(t, 200);
  const parsed = await parseDocument(Buffer.from("%PDF-test"), "application/pdf", "test.pdf");
  assert.equal(parsed.parser.name, "docling.rs");
  assert.equal(parsed.canonicalText, "Remote clause");
  assert.deepEqual(await new DoclingPdfExtractor().extract(Buffer.from("%PDF-test"), "test.pdf"), document);
  assert.deepEqual(modes, ["analysis-pdf", "kb-pdf"]);
});

test("remote failures remain explicit; no parser fallback is used", async t => {
  const modes = await fixture(t, 503);
  await assert.rejects(() => parseDocument(Buffer.from("%PDF-test"), "application/pdf", "test.pdf"), /Docling failed/);
  await assert.rejects(() => new DoclingPdfExtractor().extract(Buffer.from("%PDF-test"), "test.pdf"), /HTTP 503/);
  assert.deepEqual(modes, ["analysis-pdf", "analysis-recovery", "kb-pdf"]);
});
