import assert from "node:assert/strict";
import test from "node:test";
import { mastra } from "../../../index.js";
import { KB_SCHEMA_VERSION, hashText } from "../schemas/index.js";
import { sourceIntakeWorkflow } from "../workflows/source-intake-workflow.js";

function input() {
  return {
    source: {
      schemaVersion: KB_SCHEMA_VERSION, id: "source-1", instrumentId: "eu-2016-679", title: "GDPR",
      issuer: "European Union", jurisdiction: "EU",
      access: { visibility: "private" as const, ownerUserId: "user-1" }, authorityStatus: "verified" as const,
    },
    version: {
      schemaVersion: KB_SCHEMA_VERSION, id: "version-1", sourceId: "source-1", uploadRevision: 1,
      objectKey: "private/source-1/version-1.pdf", checksum: hashText("fixture"), originalFileName: "gdpr.pdf",
      mimeType: "application/pdf", byteSize: 7, language: "en", uploadedAt: "2026-10-10T00:00:00Z",
      enactedOn: null, effectiveFrom: null, effectiveUntil: null, originalPageCount: null,
      extractionVersion: null, supportStatus: "pending" as const,
    },
    readability: "readable" as "unknown" | "readable" | "unreadable",
  };
}

async function run(data: ReturnType<typeof input>) {
  const instance = await sourceIntakeWorkflow.createRun();
  return instance.start({ inputData: data });
}

test("Mastra registers the source intake workflow", () => {
  assert.ok(mastra.getWorkflow("sourceIntakeWorkflow"));
  assert.ok(mastra.getWorkflow("processIngestionWorkflow"));
});

test("a valid pilot PDF remains review-required", async () => {
  const result = await run(input());
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.result, {
      sourceId: "source-1", sourceVersionId: "version-1",
      status: "review_required", reason: "pilot_requires_review",
    });
  }
});

test("a source/version mismatch fails the workflow", async () => {
  const data = input();
  data.version.sourceId = "other-source";
  assert.equal((await run(data)).status, "failed");
});

test("unsupported and unreadable inputs are explicit", async () => {
  const unsupported = input();
  unsupported.version.mimeType = "application/msword";
  const first = await run(unsupported);
  assert.equal(first.status, "success");
  if (first.status === "success") assert.equal(first.result.status, "unsupported");

  const unreadable = input();
  unreadable.readability = "unreadable";
  const second = await run(unreadable);
  assert.equal(second.status, "success");
  if (second.status === "success") assert.equal(second.result.status, "unreadable");
});
