import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTLINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "derive-report-outline.ts"
);

describe("derive-report-outline has no hardcoded GDPR clusters", () => {
  it("does not contain CHAPEAU_REQ_IDS, MANDATORY_REQ_IDS, or Art 28 strings", () => {
    const source = readFileSync(OUTLINE_PATH, "utf8");
    assert.doesNotMatch(source, /CHAPEAU_REQ_IDS/);
    assert.doesNotMatch(source, /MANDATORY_REQ_IDS/);
    assert.doesNotMatch(source, /Art 28/);
    assert.doesNotMatch(source, /Article 28/);
  });
});
