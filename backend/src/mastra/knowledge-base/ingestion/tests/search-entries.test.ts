import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchTextDrafts, embedSearchDrafts } from "../publication/search-entries.js";

test("long legal passages are fully covered and embeddings are checked", async () => {
  const citation = "Rule 8";
  const capacity = 100 - `${citation}\n`.length;
  const text = `${"a".repeat(capacity - 1)}😀${"b".repeat(20)}`;
  const drafts = buildSearchTextDrafts("idx-1", [{ kind: "provision", id: "p1", revision: 1,
    sourceVersionId: "v1", citation, text }], 100);
  assert.equal(drafts.length, 2);
  assert.equal(drafts.map(draft => text.slice(draft.sourceStart, draft.sourceEnd)).join(""), text);
  assert.ok(drafts.every(draft => !draft.text.includes("\uD83D\n")));
  const provider = { model: "test", dimensions: 2, configurationVersion: "1",
    documentTask: "retrieval/document", queryTask: "retrieval/query",
    embed: async (values: string[]) => values.map(() => [0.2, 0.8]) };
  const entries = await embedSearchDrafts(drafts, provider, 1);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.record.id, "p1");
  await assert.rejects(embedSearchDrafts(drafts, { ...provider,
    embed: async () => [[0.2]] }), /dimension|incomplete/i);
});
