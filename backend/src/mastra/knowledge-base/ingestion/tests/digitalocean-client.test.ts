import assert from "node:assert/strict";
import test from "node:test";
import { DigitalOceanInferenceClient, DO_CHAT_URL } from "../../../../llm/provider/digitalocean-client.js";
import { DigitalOceanProvider } from "../../../../llm/provider/digitalocean-provider.js";

test("DigitalOcean chat sends bearer key, model, reasoning and JSON schema", async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } });
  };
  const client = new DigitalOceanInferenceClient("fixture-secret", fetcher);
  const result = await client.chat({ model: "glm-5.3", systemInstruction: "system", prompt: "user",
    temperature: 0, maxCompletionTokens: 8192, reasoningEffort: "high",
    responseSchema: { type: "object", properties: { ok: { type: "boolean" } } } });
  assert.equal(request?.url, DO_CHAT_URL);
  assert.equal(request?.headers.get("Authorization"), "Bearer fixture-secret");
  const body = await request!.json() as { model: string; reasoning_effort: string;
    response_format: { type: string }; messages: unknown[] };
  assert.equal(body.model, "glm-5.3");
  assert.equal(body.reasoning_effort, "high");
  assert.equal(body.response_format.type, "json_schema");
  assert.deepEqual(body.messages, [{ role: "system", content: "system" }, { role: "user", content: "user" }]);
  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.usage?.totalTokens, 17);
});

test("DigitalOcean provider preserves top-level array JSON contracts", async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ choices: [{ message: { content: '{"result":[{"id":"a"}]}' },
      finish_reason: "stop" }] });
  };
  const provider = new DigitalOceanProvider(new DigitalOceanInferenceClient("fixture", fetcher));
  const result = await provider.getJsonCompletion<Array<{ id: string }>>("prompt", "system",
    { type: "array", items: { type: "object", properties: { id: { type: "string" } } } },
    { model: "glm-5.3-flash", temperature: 0 });
  assert.deepEqual(result, [{ id: "a" }]);
  const body = await request!.json() as { response_format: { json_schema: { strict: boolean;
    schema: { type: string; properties: { result: { type: string } } } } } };
  assert.equal(body.response_format.json_schema.strict, false);
  assert.equal(body.response_format.json_schema.schema.type, "object");
  assert.equal(body.response_format.json_schema.schema.properties.result.type, "array");
});

test("DigitalOcean stream assembles split SSE chunks and reports truncation", async () => {
  const event = 'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}\n\n';
  const last = 'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"length"}]}\n\ndata: [DONE]\n';
  const encoder = new TextEncoder();
  const fetcher: typeof fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(event.slice(0, 12)));
    controller.enqueue(encoder.encode(event.slice(12) + last));
    controller.close();
  } }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const chunks: string[] = [];
  const result = await new DigitalOceanInferenceClient("fixture", fetcher).chatStream({
    model: "glm-5.3", systemInstruction: "", prompt: "hi" }, chunk => chunks.push(chunk));
  assert.deepEqual(chunks, ["hello", " world"]);
  assert.equal(result.text, "hello world");
  assert.equal(result.finishReason, "length");
});
