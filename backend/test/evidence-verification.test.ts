import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Evidence verification rule: a fabricated "pass" quote not present in the draft
 * must be treated as unverified (downgraded to ambiguous by runCritique).
 * Pure unit of the substring check without invoking the LLM.
 */
function evidenceVerified(quote: string | undefined, document: string): boolean {
  if (!quote) return false;
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(document).includes(normalize(quote));
}

test("evidence quote found in draft verifies", () => {
  const doc = "The Processor shall implement appropriate technical and organisational measures.";
  assert.equal(
    evidenceVerified("appropriate technical and organisational measures", doc),
    true
  );
});

test("fabricated evidence does not verify", () => {
  const doc = "The Processor shall notify the Controller of a personal data breach.";
  assert.equal(
    evidenceVerified("Processor shall pay unlimited indemnities for any claim", doc),
    false
  );
});

test("pass without quote is not verified", () => {
  assert.equal(evidenceVerified(undefined, "anything"), false);
});
