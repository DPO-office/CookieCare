import assert from "node:assert/strict";
import { test } from "node:test";
import { hashRevision, KB_SCHEMA_VERSION } from "../schemas/common.js";
import { publicationPreflight } from "../publication/preflight.js";

test("publication requires exact latest approval, reviewed source and verified indexes", () => {
  const payload = { schemaVersion: KB_SCHEMA_VERSION, id: "pub-1", sourceVersionIds: ["v1"],
    reviewedScope: [{ id: "p1", revision: 1 }],
    approvedRecords: [{ kind: "provision" as const, record: { id: "p1", revision: 1 },
      revisionHash: "b".repeat(64), reviewDecisionId: "review-1" }],
    indexVersion: "idx-1", lexicalStatus: "ready" as const, denseStatus: "ready" as const,
    state: "building" as const, createdAt: "2026-10-12T00:00:00.000Z" };
  const manifest = { ...payload, manifestHash: hashRevision(payload) };
  const sources = [{ sourceVersionId: "v1", authorityVerified: true,
    extractionMapped: true, structureReviewed: true }];
  const records = [{ kind: "provision" as const, id: "p1", revision: 1,
    contentHash: "b".repeat(64), sourceVersionId: "v1", latestReviewId: "review-1",
    latestDecision: "approve" as const }];
  const index = { indexVersion: "idx-1", lexicalBackend: "opensearch" as const,
    lexicalVerified: true, denseVerified: true, indexedRecordKeys: ["provision:p1:1"] };
  assert.equal(publicationPreflight(manifest, sources, records, index).ready, true);
  assert.ok(publicationPreflight(manifest, sources,
    [{ ...records[0]!, latestReviewId: "review-2", latestDecision: "reject" }], index)
    .issues.some(issue => issue.code === "record_not_approved"));
  assert.ok(publicationPreflight(manifest, sources, records,
    { ...index, lexicalVerified: false, indexedRecordKeys: [] }).issues.some(issue => issue.code === "index_unverified"));
  assert.ok(publicationPreflight(manifest,
    [{ ...sources[0]!, extractionMapped: false }], records, index).issues.some(issue => issue.code === "source_unready"));
  assert.ok(publicationPreflight(manifest, sources, [...records,
    { ...records[0]!, revision: 2, latestReviewId: null, latestDecision: null }], index)
    .issues.some(issue => issue.code === "record_not_approved"));
});
