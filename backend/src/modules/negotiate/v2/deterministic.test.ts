/**
 * Unit tests for the DETERMINISTIC V2 components (no LLM, no DB).
 *   node --import tsx --test backend/src/modules/negotiate/v2/deterministic.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentDocument, locateQuote, normForHash, sha256 } from "./segment.js";
import { computeLegalSeverity, computeNegotiability, computeLNP } from "./severity.js";
import { emptyFactors, SEGMENTER_VERSION } from "./types.js";

const SAMPLE = `DATA PROCESSING AGREEMENT

1. Introduction
This DPA governs processing.

2.1 Sub-processors
Processor may appoint sub-processors without notice.

APPENDIX 2 SECURITY MEASURES
Vendor may update measures from time to time.`;

test("segmentation is deterministic: same input → identical clauseRefs + offsets", () => {
  const a = segmentDocument(SAMPLE);
  const b = segmentDocument(SAMPLE);
  assert.deepEqual(a.segments.map((s) => s.clauseRef), b.segments.map((s) => s.clauseRef));
  assert.equal(a.contentHash, b.contentHash);
  assert.equal(a.segmenterVersion, SEGMENTER_VERSION);
  assert.ok(a.segments.length >= 3, "should split into multiple clause units");
});

test("offsets are valid: segment text equals the document slice", () => {
  const { segments } = segmentDocument(SAMPLE);
  for (const s of segments) assert.equal(SAMPLE.slice(s.charStart, s.charEnd), s.text);
});

test("clauseRef is whitespace/punctuation-insensitive but content-sensitive", () => {
  const base = segmentDocument("2.1 Term\nThe term is one year.");
  const spaced = segmentDocument("2.1   Term\nThe   term  is   one   year.");
  const changed = segmentDocument("2.1 Term\nThe term is two years.");
  // same heading+content (modulo whitespace) → same ref
  assert.equal(base.segments.at(-1)!.clauseRef, spaced.segments.at(-1)!.clauseRef);
  // different content → different ref
  assert.notEqual(base.segments.at(-1)!.clauseRef, changed.segments.at(-1)!.clauseRef);
});

test("content hash changes iff content changes", () => {
  assert.equal(sha256("abc"), sha256("abc"));
  assert.notEqual(sha256("abc"), sha256("abd"));
});

test("locateQuote finds exact and re-whitespaced quotes", () => {
  const doc = "Processor may appoint   sub-processors without notice.";
  assert.equal(locateQuote("appoint   sub-processors", doc), doc.indexOf("appoint"));
  assert.ok(locateQuote("appoint sub-processors", doc) >= 0, "normalized match should succeed");
  assert.equal(locateQuote("nonexistent text", doc), -1);
});

test("normForHash collapses whitespace + unifies quotes/dashes + lowercases", () => {
  assert.equal(normForHash("  A—B  “x”  "), "a-b \"x\"");
});

// ── Severity L/N/P ──────────────────────────────────────────────────────────

test("L: GREEN dominates for market-standard / out-of-scope / cosmetic", () => {
  const f = emptyFactors();
  f.uncappedOrBroadExposure = true; // would be RED...
  f.marketStandardLanguage = true;  // ...but market-standard forces GREEN
  assert.equal(computeLegalSeverity(f), "GREEN");
});

test("L: RED anchors (uncapped, intl transfer, irreversible)", () => {
  for (const k of ["uncappedOrBroadExposure", "internationalTransferRisk", "irreversibleOrHardToRemedy"] as const) {
    const f = emptyFactors(); (f as any)[k] = true;
    assert.equal(computeLegalSeverity(f), "RED", `${k} should be RED`);
  }
});

test("L: absence is RED only when the missing term is regulatorily mandated", () => {
  const minorGap = { ...emptyFactors(), absenceOfRequiredTerm: true };
  assert.equal(computeLegalSeverity(minorGap), "YELLOW", "a missing minor clause is YELLOW, not RED");
  const mandatedGap = { ...emptyFactors(), absenceOfRequiredTerm: true, regulatoryMandatedTerm: true };
  assert.equal(computeLegalSeverity(mandatedGap), "RED", "a missing mandated term is RED");
});

test("L: one-sided-but-ordinary imbalance is YELLOW", () => {
  const f = emptyFactors(); f.unilateralOrOneSidedRight = true;
  assert.equal(computeLegalSeverity(f), "YELLOW");
});

test("L is monotone: adding a risk factor never lowers severity", () => {
  const order = { GREEN: 0, YELLOW: 1, RED: 2 } as const;
  const base = emptyFactors(); base.unilateralOrOneSidedRight = true; // YELLOW
  const stronger = { ...base, uncappedOrBroadExposure: true };        // RED
  assert.ok(order[computeLegalSeverity(stronger)] >= order[computeLegalSeverity(base)]);
});

test("N is separate from L: severe intl transfer is RED but only medium negotiability", () => {
  const f = emptyFactors(); f.internationalTransferRisk = true;
  assert.equal(computeLegalSeverity(f), "RED");
  assert.equal(computeNegotiability(f), "medium");
});

test("P/tier: GREEN is always minor; RED is primary", () => {
  const green = computeLNP({ ...emptyFactors(), marketStandardLanguage: true });
  assert.equal(green.L, "GREEN"); assert.equal(green.tier, "minor");
  const red = computeLNP({ ...emptyFactors(), uncappedOrBroadExposure: true });
  assert.equal(red.L, "RED"); assert.equal(red.tier, "primary"); assert.ok(red.priority >= 90);
});
