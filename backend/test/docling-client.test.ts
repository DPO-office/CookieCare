import assert from "node:assert/strict";
import test from "node:test";
import { convertWithDoclingService } from "../src/services/docling-client.js";

const document = { body: { self_ref: "#/body", children: [] } };
const input = Buffer.from("%PDF-test");

function configure(t: { after: (fn: () => void) => void }) {
  const previousUrl = process.env.DOCLING_SERVICE_URL;
  const previousToken = process.env.DOCLING_SERVICE_TOKEN;
  process.env.DOCLING_SERVICE_URL = "http://127.0.0.1:8090/";
  process.env.DOCLING_SERVICE_TOKEN = "test-token-with-at-least-thirty-two-characters";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.DOCLING_SERVICE_URL;
    else process.env.DOCLING_SERVICE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.DOCLING_SERVICE_TOKEN;
    else process.env.DOCLING_SERVICE_TOKEN = previousToken;
  });
}

test("sends authenticated bytes and preserves Docling JSON", async t => {
  configure(t);
  const result = await convertWithDoclingService(input, "test.pdf", "pdf", "kb-pdf", {
    fetcher: async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization,
        "Bearer test-token-with-at-least-thirty-two-characters");
      assert.equal((init?.headers as Record<string, string>)["X-Docling-Mode"], "kb-pdf");
      assert.deepEqual(init?.body, input);
      return Response.json({ status: "success", document });
    },
  });
  assert.deepEqual(result.document, document);
});

test("rejects invalid input, malformed response, and unavailable service", async t => {
  configure(t);
  await assert.rejects(() => convertWithDoclingService(Buffer.alloc(0), "test.pdf", "pdf", "kb-pdf"), /input size/);
  await assert.rejects(() => convertWithDoclingService(input, "test.pdf", "pdf", "kb-pdf",
    { fetcher: async () => Response.json({ status: "success", document: {} }) }), /invalid document/);
  await assert.rejects(() => convertWithDoclingService(input, "test.pdf", "pdf", "kb-pdf",
    { fetcher: async () => { throw new Error("unavailable"); } }), /unavailable/);
});

test("times out a slow service", async t => {
  configure(t);
  await assert.rejects(() => convertWithDoclingService(input, "test.pdf", "pdf", "kb-pdf", {
    timeoutMs: 10,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  }), /timed out/);
});
