import test from "node:test";
import assert from "node:assert/strict";
import { createDoclingServer } from "./server.mjs";

const token = "test-token-with-at-least-thirty-two-characters";
const document = { body: { self_ref: "#/body", children: [] }, texts: [] };

async function fixture(t, convert, options = {}) {
  const server = createDoclingServer({ token, convert, ...options });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

function request(base, overrides = {}) {
  return fetch(`${base}/v1/convert`, { method: "POST", body: Buffer.from("%PDF-test"),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream",
      "X-Docling-Name": "test.pdf", "X-Docling-Format": "pdf", "X-Docling-Mode": "kb-pdf" }, ...overrides });
}

test("authenticates and returns the original document and status", async t => {
  const base = await fixture(t, async ({ bytes, mode }) => {
    assert.equal(bytes.toString(), "%PDF-test");
    assert.equal(mode, "kb-pdf");
    return { status: "success", document };
  });
  assert.equal((await fetch(`${base}/healthz`)).status, 401);
  const response = await request(base);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "success", document });
});

test("rejects invalid requests and failed conversions", async t => {
  const base = await fixture(t, async () => { throw new Error("private document content"); });
  assert.equal((await request(base, { headers: { Authorization: `Bearer ${token}` } })).status, 400);
  const response = await request(base);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "conversion_failed" });
});

test("holds the concurrency slot until conversion finishes, even after timeout", async t => {
  let release;
  const base = await fixture(t, async () => new Promise(resolve => { release = () => resolve({ status: "success", document }); }),
    { maxConcurrent: 1, timeoutMs: 50 });
  const first = request(base);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal((await request(base)).status, 503);
  assert.equal((await first).status, 504);
  assert.equal((await request(base)).status, 503);
  release();
});
