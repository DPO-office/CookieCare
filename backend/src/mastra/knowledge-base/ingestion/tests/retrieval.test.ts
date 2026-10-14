import assert from "node:assert/strict";
import { test } from "node:test";
import { SharedKbRetriever, type PublishedEntry } from "../retrieval/shared-retriever.js";

test("shared retrieval combines searches while fencing every linked record", async () => {
  const entry = (id: string, sourceVersionId: string, dependencyEntryIds: string[] = []): PublishedEntry => ({
    id, indexVersion: "index-1", sourceVersionId, purpose: "legal_passage",
    recordKind: "provision", recordId: id, recordRevision: 1, text: id,
    citation: `Rule ${id}`, dependencyEntryIds,
  });
  const entries = [entry("rule", "allowed", ["schedule", "hidden"]),
    entry("schedule", "allowed", ["rule"]), entry("hidden", "private")];
  const retriever = new SharedKbRetriever({
    scope: async () => ({ publicationId: "pub", indexVersion: "index-1",
      allowedSourceVersionIds: ["allowed"], approvedRecordKeys: ["provision:rule:1", "provision:schedule:1"] }),
    exactCitation: async () => [{ entryId: "rule" }],
    lexical: async () => [{ entryId: "hidden" }, { entryId: "rule" }],
    dense: async () => [{ entryId: "schedule" }],
    loadEntries: async ids => entries.filter(entry => ids.includes(entry.id)),
  });
  const result = await retriever.retrieve("alice", "pub", "Rule 8", "legal_passage");
  assert.deepEqual(result.entries.map(item => item.id), ["rule", "schedule"]);
  assert.equal(result.incompleteContext, true);
  assert.equal(result.publicationId, "pub");
});
