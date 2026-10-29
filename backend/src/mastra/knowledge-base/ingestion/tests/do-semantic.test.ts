import assert from "node:assert/strict";
import test from "node:test";
import { DigitalOceanInferenceClient } from "../../../../llm/provider/digitalocean-client.js";
import { DigitalOceanSemanticClient } from "../extraction/do-semantic.js";

const input = { sourceText: "See section 2.", sourceCitation: "Section 1", references: [] };

test("semantic retries increase output allowance and request low reasoning", async () => {
  const bodies: any[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop",
      message: { content: '{"links":[],"issues":[]}' } }] }));
  };
  const client = new DigitalOceanSemanticClient("glm-5.3", new DigitalOceanInferenceClient("test", fetcher));
  await client.decide(input, { attempt: 1 });
  await client.decide(input, { attempt: 2 });
  assert.deepEqual(bodies.map(body => body.max_completion_tokens), [8192, 16384]);
  assert.ok(bodies.every(body => body.reasoning_effort === "low"));
});

test("semantic incomplete response reports provider evidence without exposing reasoning text", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "private reasoning" } }],
    usage: { completion_tokens: 8192, completion_tokens_details: { reasoning_tokens: 8192 } },
  }));
  const client = new DigitalOceanSemanticClient("glm-5.3", new DigitalOceanInferenceClient("test", fetcher));
  await assert.rejects(client.decide(input), (error: Error) => {
    assert.match(error.message, /provider finish=length/);
    assert.match(error.message, /output tokens=8192\/8192/);
    assert.match(error.message, /answer characters=0/);
    assert.ok(!error.message.includes("private reasoning"));
    return true;
  });
});
