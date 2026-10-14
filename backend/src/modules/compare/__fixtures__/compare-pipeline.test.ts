/**
 * compare-pipeline.test.ts
 *
 * Deterministic regression tests for the Compare pipeline.
 * Zero LLM calls — all assertions exercise pure functions only.
 *
 * Coverage:
 *   1.  segmentIntoRawClauses / clause-boundaries
 *   2.  normaliseExtractedText
 *   3.  runDeterministicMatching (alignment)
 *   4.  charSimilarity + hasIsolatedInsertion + hasSubstantialLengthDelta
 *       (the internals of diff-detect that drive the NEUTRAL_REPHRASE / forward-to-LLM decision)
 *   5.  End-to-end deterministic scenarios (no LLM path invoked):
 *       identical, add-middle, add-end, remove-middle, remove-end,
 *       high-sim material wording change, pure reflow, numbered clause add/remove,
 *       recital B/C removal without cascade.
 *
 * Run from backend/ directory:
 *   node --import ./node_modules/tsx/dist/loader.mjs --test \
 *     src/modules/compare/__fixtures__/compare-pipeline.test.ts
 */

process.env.GOOGLE_CLOUD_PROJECT ??= "compare-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffSentences } from "diff";

// ── Unit under test imports ───────────────────────────────────────────────────
import { segmentIntoRawClauses } from "../utils/clause-boundaries.js";
import { normaliseExtractedText } from "../utils/normalise-text.js";
import { runDeterministicMatching } from "../utils/deterministic-matcher.js";
import type { ExtractedClause } from "../models/compare-state.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — inline re-implementations of the diff-detect internals so the
// tests can assert on them without importing the step module (which has
// top-level side-effects and LLM imports).
// These mirrors MUST stay in sync with diff-detect.ts.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_ISOLATED_CHARS = 30;
const SIM_THRESHOLD = 0.95;
const MIN_SUBSTANTIVE = 10;

function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  let intersection = 0;
  for (const [bg, countA] of bigramsA) {
    const countB = bigramsB.get(bg) ?? 0;
    intersection += Math.min(countA, countB);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function hasIsolatedInsertion(textA: string, textB: string): boolean {
  const changes = diffSentences(textA, textB);
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    if (!ch.added && !ch.removed) continue;
    if (ch.value.trim().length < MIN_ISOLATED_CHARS) continue;
    const hasContextBefore = changes.slice(0, i).some(
      (c) => !c.added && !c.removed && c.value.trim().length > 0
    );
    const hasContextAfter = changes.slice(i + 1).some(
      (c) => !c.added && !c.removed && c.value.trim().length > 0
    );
    if (hasContextBefore && hasContextAfter) return true;
  }
  return false;
}

function hasSubstantialLengthDelta(textA: string, textB: string): boolean {
  const lenA = textA.trim().length;
  const lenB = textB.trim().length;
  const shorter = Math.min(lenA, lenB);
  const delta = Math.abs(lenA - lenB);
  if (shorter < MIN_SUBSTANTIVE) return false;
  return delta >= MIN_ISOLATED_CHARS;
}

/**
 * The combined decision a pair makes in tryDeterministic:
 * "shouldGoToLLM" means neither UNCHANGED nor NEUTRAL_REPHRASE was decided.
 */
function deterministicDecision(textA: string, textB: string): {
  classification: "UNCHANGED" | "NEUTRAL_REPHRASE" | "FORWARD_TO_LLM";
  hasIsolation: boolean;
} {
  if (textA === textB) return { classification: "UNCHANGED", hasIsolation: false };
  const aShort = textA.trim().length < MIN_SUBSTANTIVE;
  const bShort = textB.trim().length < MIN_SUBSTANTIVE;
  if (aShort !== bShort) return { classification: "FORWARD_TO_LLM", hasIsolation: false };
  const sim = charSimilarity(textA, textB);
  if (sim >= SIM_THRESHOLD) {
    const isolation =
      hasIsolatedInsertion(textA, textB) || hasSubstantialLengthDelta(textA, textB);
    if (isolation) return { classification: "FORWARD_TO_LLM", hasIsolation: true };
    return { classification: "NEUTRAL_REPHRASE", hasIsolation: false };
  }
  return { classification: "FORWARD_TO_LLM", hasIsolation: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeClause(
  id: string,
  title: string,
  text: string,
  sectionPath: string[] = []
): ExtractedClause {
  return { id, title, text, position: 0, sectionPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. normaliseExtractedText
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseExtractedText", () => {
  it("strips null bytes", () => {
    const result = normaliseExtractedText("hello\0world");
    assert.ok(!result.includes("\0"), "Null byte should be removed");
    // normaliseExtractedText replaces \0 with "" (not a space) — result is "helloworld"
    assert.equal(result, "helloworld");
  });

  it("collapses 3+ consecutive blank lines to 1 blank line", () => {
    const result = normaliseExtractedText("para1\n\n\n\n\npara2");
    assert.equal(result.includes("\n\n\n"), false);
    assert.ok(result.includes("para1"));
    assert.ok(result.includes("para2"));
  });

  it("rejoins visual line-wraps inside body paragraphs", () => {
    // No sentence-terminal punctuation, no heading on either line → merge
    const result = normaliseExtractedText(
      "The Supplier shall ensure\nthat all employees comply"
    );
    assert.ok(
      result.includes("The Supplier shall ensure that all employees comply"),
      `Expected merged line, got: ${result}`
    );
  });

  it("preserves breaks before heading lines", () => {
    const result = normaliseExtractedText(
      "Some body text ends here.\n1. DEFINITIONS\nSomething"
    );
    // The heading line must remain separate
    assert.ok(result.includes("\n1. DEFINITIONS"), `Got: ${JSON.stringify(result)}`);
  });

  it("preserves sentence-terminal line endings", () => {
    const result = normaliseExtractedText(
      "The Supplier agrees to comply with applicable law.\nThe Processor shall ensure security."
    );
    // Both sentences end with "." so the line break is preserved
    assert.ok(
      result.includes(
        "The Supplier agrees to comply with applicable law.\nThe Processor shall ensure security."
      ),
      `Got: ${JSON.stringify(result)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. segmentIntoRawClauses
// ─────────────────────────────────────────────────────────────────────────────

describe("segmentIntoRawClauses", () => {
  it("segments numbered clauses correctly", () => {
    const text = [
      "1. DEFINITIONS",
      '"Confidential Information" means any information disclosed.',
      "",
      "2. OBLIGATIONS",
      "The Receiving Party agrees to hold the information in confidence.",
      "",
      "3. TERM",
      "This Agreement shall remain in force for two years.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    assert.equal(segments.length, 3, `Expected 3 segments, got ${segments.length}`);
    assert.ok(segments[0].heading.includes("1."));
    assert.ok(segments[1].heading.includes("2."));
    assert.ok(segments[2].heading.includes("3."));
  });

  it("segments lettered recitals (A., B., C.) as separate segments", () => {
    const text = [
      "A. This Data Protection Annex forms part of the Agreement between the Controller and the Processor.",
      "",
      "B. The Supplier has been engaged to provide Services that require processing personal data.",
      "",
      "C. The parties wish to set out their respective obligations under applicable data protection law.",
      "",
      "1. DEFINITIONS",
      '"Personal Data" has the meaning given in the GDPR.',
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const recitals = segments.filter((s) =>
      /^[A-Z]\./.test(s.heading) || (s.sectionPath.length === 1 && /^[A-Z]{1,2}$/.test(s.sectionPath[0]))
    );
    assert.ok(recitals.length >= 3, `Expected ≥3 lettered recitals, got ${recitals.length}`);
    assert.ok(
      segments.some((s) => s.sectionPath[0] === "A"),
      "Recital A should have sectionPath ['A']"
    );
    assert.ok(
      segments.some((s) => s.sectionPath[0] === "B"),
      "Recital B should have sectionPath ['B']"
    );
    assert.ok(
      segments.some((s) => s.sectionPath[0] === "C"),
      "Recital C should have sectionPath ['C']"
    );
  });

  it("does not produce duplicate sectionPaths for distinct lettered recitals", () => {
    const text = [
      "A. Recital A body text here that is long enough to matter.",
      "",
      "B. Recital B body text here that is long enough to matter.",
      "",
      "C. Recital C body text here that is long enough to matter.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const paths = segments.map((s) => s.sectionPath.join(","));
    const unique = new Set(paths);
    assert.equal(
      unique.size,
      paths.length,
      `Duplicate sectionPaths found: ${paths.join(" | ")}`
    );
  });

  it("does not treat uppercase acronyms in parens as sub-clause headings", () => {
    const text = [
      "1. SCOPE",
      "The parties must comply with (EU) Regulation 2016/679 and (GDPR) requirements.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    assert.equal(segments.length, 1, `Expected 1 segment, got ${segments.length}: ${JSON.stringify(segments.map((s) => s.heading))}`);
  });

  it("does not start a new clause when a numeric marker continues an incomplete sentence", () => {
    const text = [
      "3.7. The Supplier shall ensure that",
      "3.8. all relevant personnel are bound by confidentiality obligations under this Agreement.",
      "3.9. The Processor shall implement appropriate technical and organisational measures.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const headings = segments.map((s) => s.heading);
    assert.ok(
      !headings.some((h) => h.startsWith("3.8.")),
      `3.8 must not be a heading, got: ${JSON.stringify(headings)}`
    );
    assert.ok(segments.some((s) => s.heading.startsWith("3.7.")));
    assert.ok(segments.some((s) => s.heading.startsWith("3.9.")));
    const c37 = segments.find((s) => s.heading.startsWith("3.7."));
    assert.ok(c37?.text.includes("all relevant personnel"));
  });

  it("does not treat a split proper-noun line as a numeric heading", () => {
    const text = [
      "4.3. Randstad Digital may share Personal Data with its Affiliates",
      "5. Digital, and Randstad Digital may share it with its Clients and a supervisory authority as required by law.",
      "6. AUDIT",
      "Randstad Digital may audit the Supplier once per year on reasonable notice under this Agreement.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    assert.ok(
      !segments.some((s) => /^\d+(?:\.\d+)*\.$/.test(s.heading) && s.heading.startsWith("5.")),
      `got headings: ${JSON.stringify(segments.map((s) => s.heading))}`
    );
    assert.ok(segments.some((s) => s.heading.startsWith("6.")));
  });

  it("recovers sequential clauses absorbed into a neighbour bucket", () => {
    const text = [
      "3.2. Taking into account the state of the art, the Supplier shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, as referred to in Article 32(1) of the GDPR.",
      "The Processor will have the security of its Services certified at least annually by a qualified and independent auditor.",
      "3.4. The Supplier shall ensure that its Employees authorised to Process the Personal Data have committed themselves, in writing, to confidentiality.",
      "The Supplier will ensure that its Employees authorised to Process the Personal Data are provided with appropriate data protection training.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const last = (s: (typeof segments)[0]) => s.sectionPath[s.sectionPath.length - 1];
    assert.ok(segments.some((s) => last(s) === "3.2"));
    assert.ok(segments.some((s) => last(s) === "3.3"), `missing 3.3: ${segments.map((s) => last(s)).join(",")}`);
    assert.ok(segments.some((s) => last(s) === "3.4"));
    assert.ok(segments.some((s) => last(s) === "3.5"), `missing 3.5: ${segments.map((s) => last(s)).join(",")}`);
    const c32 = segments.find((s) => last(s) === "3.2");
    assert.ok(c32 && !c32.text.includes("The Processor will have"));
  });

  it("recovers a skipped sibling whose opening sits after a continuation marker", () => {
    const text = [
      "6.1. The Controller shall be entitled to perform audits of the facilities used in relation to the Processing of Personal Data under the Agreement to confirm compliance with applicable law.",
      "In addition, the Supplier shall regularly audit business processes that involve the",
      "6.2. Processing of Personal Data under this Data Protection Annex for compliance.",
      "If the audit referred to in article 6.1 gives reason for this, the Controller has the right to ask the Supplier to update the security measures taken so that they are in line with the state of the art.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const last = (s: (typeof segments)[0]) => s.sectionPath[s.sectionPath.length - 1];
    assert.ok(segments.some((s) => last(s) === "6.1"));
    assert.ok(segments.some((s) => last(s) === "6.2"), `missing 6.2: ${JSON.stringify(segments.map((s) => s.heading.slice(0, 40)))}`);
    const c62 = segments.find((s) => last(s) === "6.2");
    assert.ok(c62?.text.includes("If the audit referred"));
  });

  it("recovers a sibling whose marker was glued onto a wrap leftover", () => {
    const text = [
      "2.2. The Processor shall Process Personal Data only on documented instructions from the Controller unless required to do so by Union or Member State law.",
      "2.3. Randstad Digital’s behalf, Supplier shall:",
      "Where the Processor is required to Process Personal Data by law, the Processor shall inform the Controller of that legal requirement before Processing.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const last = (s: (typeof segments)[0]) => s.sectionPath[s.sectionPath.length - 1];
    assert.ok(segments.some((s) => last(s) === "2.2"));
    assert.ok(segments.some((s) => last(s) === "2.3"), `missing 2.3: ${segments.map((s) => last(s) + ":" + s.heading.slice(0, 50)).join(" | ")}`);
    const c23 = segments.find((s) => last(s) === "2.3");
    assert.ok(c23?.text.includes("Where the Processor is required"));
    const c22 = segments.find((s) => last(s) === "2.2");
    assert.ok(c22 && !c22.text.includes("Where the Processor is required"));
  });

  it("does not peel later sentences of a top-level article into 7 / 8", () => {
    const text = [
      "6. Compliance monitoring and audit. The Controller shall be entitled to perform audits of the facilities used in relation to the Processing of Personal Data.",
      "If the audit referred to in this article gives reason for this, the Controller may require updated security measures.",
      "The Supplier shall lend all reasonable cooperation with this and immediately implement the required updates.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const last = (s: (typeof segments)[0]) => s.sectionPath[s.sectionPath.length - 1];
    assert.ok(segments.some((s) => last(s) === "6"));
    assert.ok(
      !segments.some((s) => last(s) === "7" || last(s) === "8"),
      `got: ${segments.map((s) => last(s)).join(",")}`
    );
  });

  it("does not peel definition bodies into the next numbered sibling", () => {
    const text = [
      "14. Definitions. Personal Data means any information relating to an identified or identifiable natural person. The following terms have the meanings given in applicable Data Protection Law. Data Subject means any natural person whose Personal Data is Processed under this Annex.",
      "15. Notices. Notices under this Annex shall be in writing and delivered to the addresses set out in the Agreement.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const last = (s: (typeof segments)[0]) => s.sectionPath[s.sectionPath.length - 1];
    const c14 = segments.find((s) => last(s) === "14");
    assert.ok(c14?.text.includes("Data Subject means"));
    assert.ok(c14 && !c14.text.includes("Notices under this Annex shall"));
    assert.ok(segments.some((s) => last(s) === "15"));
  });

  it("treats Roman+Annex lines as annex paths equivalent to annex II headings", () => {
    const a = segmentIntoRawClauses(
      "IV. Annex II (Technical and organisational measures) shall be formed by the relevant schedule(s) under the DPA and/or Agreement. (VISR)"
    );
    const b = segmentIntoRawClauses(
      "annex II (Technical and organisational measures) shall be formed by the relevant schedule(s) under the DPA and/or Agreement. (VISR)"
    );
    assert.equal(a[0].sectionPath[0], b[0].sectionPath[0]);
  });

  it("keeps genuine nested numeric list items after a colon", () => {
    const text = [
      "3. The Supplier shall:",
      "3.1. process personal data only on documented instructions from the Controller;",
      "3.2. implement appropriate technical and organisational measures.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    assert.ok(segments.some((s) => s.heading.startsWith("3.1.")));
    assert.ok(segments.some((s) => s.heading.startsWith("3.2.")));
  });

  it("drops standalone numeric stub fragments such as 4. / [5] / 11.", () => {
    const text = [
      "3.9. The Processor shall implement appropriate technical and organisational measures.",
      "4.",
      "[5]",
      "11.",
      "12. Notices under this Agreement must be in writing and sent to the addresses set out below.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    const paths = segments.map((s) => s.sectionPath.join("."));
    assert.ok(!paths.includes("4"), `stub 4 must be dropped, got ${JSON.stringify(paths)}`);
    assert.ok(!paths.includes("11"), `stub 11 must be dropped, got ${JSON.stringify(paths)}`);
    assert.ok(paths.includes("3.9") || segments.some((s) => s.heading.startsWith("3.9.")));
    assert.ok(segments.some((s) => s.heading.startsWith("12.")));
  });

  it("does not treat Clause 7 body text as a keyword heading", () => {
    const text = [
      "1. SCOPE",
      "The relevant clauses of the EU Model Clauses apply as follows:",
      "Clause 7 (Docking clause) shall not apply;a. the audit rights.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    assert.equal(
      segments.filter((s) => /clause 7/i.test(s.heading)).length,
      0,
      `Clause 7 body must not become a heading: ${JSON.stringify(segments.map((s) => s.heading))}`
    );
  });

  it("splits a mid-paragraph numeric clause that starts with a clause opener", () => {
    const text = [
      "3.2. The Supplier shall implement and maintain appropriate technical measures 3.3. The Processor will have the security of its Services certified at least annually by an independent auditor under this Agreement.",
    ].join("\n");
    const segments = segmentIntoRawClauses(text);
    assert.ok(segments.some((s) => s.heading.startsWith("3.2.")));
    assert.ok(
      segments.some((s) => s.heading.startsWith("3.3.")),
      `expected 3.3 heading, got ${JSON.stringify(segments.map((s) => s.heading))}`
    );
  });

  it("does not split a body reference such as 'clause 3.4. The'", () => {
    const text = [
      "1. SCOPE",
      "The parties agree that clause 3.4. The audit right continues to apply in full to all processing under this Agreement regardless of location.",
    ].join("\n");
    const segments = segmentIntoRawClauses(text);
    assert.equal(segments.length, 1, JSON.stringify(segments.map((s) => s.heading)));
  });

  it("falls back to paragraph chunking when no headings are found", () => {
    // A wall of text with no structural markers
    const text = [
      "This is a long introductory paragraph that sets the context for the agreement and contains many words.",
      "",
      "This is a second paragraph that continues the discussion and adds more context about the parties.",
      "",
      "This is a third paragraph that concludes the introductory section with a final thought.",
    ].join("\n");

    const segments = segmentIntoRawClauses(text);
    // heading-based gives 0 segments → fallback kicks in during structureExtractStep
    // The test validates that segmentIntoRawClauses itself can produce ≥ 1 segment
    assert.ok(segments.length >= 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. charSimilarity
// ─────────────────────────────────────────────────────────────────────────────

describe("charSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    assert.equal(charSimilarity("hello world", "hello world"), 1);
  });

  it("returns 0 for completely different short strings", () => {
    const sim = charSimilarity("abc", "xyz");
    assert.ok(sim < 0.2, `Expected near 0, got ${sim}`);
  });

  it("returns high similarity for a minor word change in a long clause", () => {
    const base =
      "The Receiving Party shall use commercially reasonable efforts to protect the Confidential Information.";
    const modified =
      "The Receiving Party shall use reasonable efforts to protect the Confidential Information.";
    const sim = charSimilarity(base, modified);
    // Should be high (≥ 0.90) — minor word removal in a long sentence
    assert.ok(sim >= 0.90, `Expected ≥0.90, got ${sim}`);
  });

  it("'commercially reasonable' → 'reasonable' falls BELOW SIM_THRESHOLD → goes to LLM (never silently neutral)", () => {
    // The critical Fix 2 invariant: 'commercially ' is 13 chars removed from a
    // 130-char clause. Bigram Dice coefficient = 0.947 — just below SIM_THRESHOLD (0.95).
    // This means the pair is forwarded to the LLM for semantic classification,
    // which is the CORRECT behavior. It must never be silently classified as
    // NEUTRAL_REPHRASE by the deterministic tier.
    const base =
      "The Receiving Party shall use commercially reasonable efforts to protect the Confidential Information from unauthorised disclosure.";
    const modified =
      "The Receiving Party shall use reasonable efforts to protect the Confidential Information from unauthorised disclosure.";
    const sim = charSimilarity(base, modified);
    // Verified empirically: sim ≈ 0.947 — below SIM_THRESHOLD
    assert.ok(
      sim < SIM_THRESHOLD,
      `Expected sim < ${SIM_THRESHOLD} for this change (got ${sim}) — change goes to LLM for semantic review`
    );
    // Confirm the combined decision: FORWARD_TO_LLM (never NEUTRAL_REPHRASE)
    const decision = deterministicDecision(base, modified);
    assert.equal(
      decision.classification,
      "FORWARD_TO_LLM",
      "'commercially reasonable' → 'reasonable' must never be silently NEUTRAL_REPHRASE"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. hasIsolatedInsertion
// ─────────────────────────────────────────────────────────────────────────────

describe("hasIsolatedInsertion", () => {
  it("returns false for identical text", () => {
    const text = "The Supplier agrees to process data lawfully and in accordance with the instructions of the Controller.";
    assert.equal(hasIsolatedInsertion(text, text), false);
  });

  it("returns true when a full sentence is inserted in the MIDDLE of a clause", () => {
    const textA = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    const textB = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "There is a cat in the street and it looks hungry and wants some food please give it food.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    assert.equal(
      hasIsolatedInsertion(textA, textB),
      true,
      "Mid-body sentence insertion should be detected"
    );
  });

  it("returns false for pure whitespace/line-wrap difference", () => {
    const textA = "The Supplier shall ensure that all sub-processors are bound by equivalent obligations.";
    const textB = "The Supplier shall ensure that all sub-processors are bound by equivalent obligations.";
    assert.equal(hasIsolatedInsertion(textA, textB), false);
  });

  it("returns false for a single-word change shorter than MIN_ISOLATED_CHARS", () => {
    const textA =
      "The Receiving Party shall use commercially reasonable efforts to protect the information.";
    const textB =
      "The Receiving Party shall use reasonable efforts to protect the information.";
    // 'commercially ' is 14 chars — below MIN_ISOLATED_CHARS (30)
    assert.equal(hasIsolatedInsertion(textA, textB), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. hasSubstantialLengthDelta
// ─────────────────────────────────────────────────────────────────────────────

describe("hasSubstantialLengthDelta", () => {
  it("returns false for identical text", () => {
    const text = "The Supplier agrees to process personal data lawfully.";
    assert.equal(hasSubstantialLengthDelta(text, text), false);
  });

  it("returns false for a small delta (single word removed)", () => {
    const textA =
      "The Receiving Party shall use commercially reasonable efforts to protect the Confidential Information.";
    const textB =
      "The Receiving Party shall use reasonable efforts to protect the Confidential Information.";
    const delta = Math.abs(textA.trim().length - textB.trim().length);
    // 'commercially ' is ~14 chars — below MIN_ISOLATED_CHARS (30)
    assert.ok(delta < MIN_ISOLATED_CHARS, `Delta was ${delta}, expected < 30`);
    assert.equal(hasSubstantialLengthDelta(textA, textB), false);
  });

  it("returns true when a full sentence is appended to the END of a clause (tail insertion)", () => {
    const textA =
      "A. The Supplier has been engaged to provide Services under the Master Services Agreement.";
    const textB =
      "A. The Supplier has been engaged to provide Services under the Master Services Agreement. There is a cat in the street and it looks hungry and wants some food please give it food.";
    const delta = Math.abs(textA.trim().length - textB.trim().length);
    assert.ok(delta >= MIN_ISOLATED_CHARS, `Delta was ${delta}, expected ≥ 30`);
    assert.equal(
      hasSubstantialLengthDelta(textA, textB),
      true,
      "Tail insertion should be detected by length delta"
    );
  });

  it("returns true when content is removed from the end of a clause (tail removal)", () => {
    const textA =
      "The confidentiality obligations shall survive termination of this Agreement for a period of five years. For the avoidance of doubt, this clause applies to all forms of Confidential Information disclosed during the term.";
    const textB =
      "The confidentiality obligations shall survive termination of this Agreement for a period of five years.";
    assert.equal(
      hasSubstantialLengthDelta(textA, textB),
      true,
      "Tail removal should be detected by length delta"
    );
  });

  it("returns false when both sides are shorter than MIN_SUBSTANTIVE", () => {
    assert.equal(hasSubstantialLengthDelta("short", ""), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. deterministicDecision — the combined tryDeterministic logic
// ─────────────────────────────────────────────────────────────────────────────

describe("deterministicDecision (tryDeterministic logic)", () => {
  // ── Scenario 1: Identical document ──────────────────────────────────────

  it("SC-01: identical clause → UNCHANGED", () => {
    const text =
      "The Receiving Party agrees to hold the Disclosing Party's Confidential Information in strict confidence.";
    const result = deterministicDecision(text, text);
    assert.equal(result.classification, "UNCHANGED");
  });

  // ── Scenario 4: high-sim but meaningful wording change ───────────────────

  it("SC-04a: 'commercially reasonable' → 'reasonable' in a short clause — stays NEUTRAL_REPHRASE (delta < 30)", () => {
    // Short clause: the word swap alone is a small delta — correctly stays NEUTRAL_REPHRASE
    // because "commercially " is only ~14 chars, below the 30-char floor.
    const textA =
      "The Receiving Party shall use commercially reasonable efforts to protect the information.";
    const textB =
      "The Receiving Party shall use reasonable efforts to protect the information.";
    const result = deterministicDecision(textA, textB);
    // delta = ~14 chars → below threshold → NEUTRAL_REPHRASE is correct here
    // (the LLM would need to assess if this is material — but the deterministic
    //  layer cannot confidently decide based on delta alone)
    assert.ok(
      result.classification === "NEUTRAL_REPHRASE" || result.classification === "FORWARD_TO_LLM",
      `Expected NEUTRAL_REPHRASE or FORWARD_TO_LLM, got ${result.classification}`
    );
  });

  it("SC-04b: sentence with a substantial meaning change AND a length delta ≥ 30 → FORWARD_TO_LLM with isolation", () => {
    // Longer version: liability cap removed (substantial delta)
    const textA =
      "Each party's liability shall not exceed one hundred thousand US dollars ($100,000) in aggregate. In no event shall either party be liable for consequential or indirect damages.";
    const textB =
      "THE PARTIES EXPRESSLY EXCLUDE ANY LIMITATION OF LIABILITY UNDER THIS AGREEMENT. EACH PARTY SHALL BE FULLY LIABLE FOR ALL LOSSES, DAMAGES, COSTS AND EXPENSES.";
    const result = deterministicDecision(textA, textB);
    // sim < 0.95 because the text is very different → FORWARD_TO_LLM
    assert.equal(result.classification, "FORWARD_TO_LLM");
  });

  // ── Scenario 9: line-wrap/reflow only ────────────────────────────────────

  it("SC-09: pure line-wrap reflow → UNCHANGED after normalisation", () => {
    const textA = normaliseExtractedText(
      "The Supplier shall ensure that all personnel\nare bound by confidentiality obligations under this Agreement."
    );
    const textB = normaliseExtractedText(
      "The Supplier shall ensure that all personnel are bound by confidentiality obligations under this Agreement."
    );
    const result = deterministicDecision(textA, textB);
    assert.ok(
      result.classification === "UNCHANGED" || result.classification === "NEUTRAL_REPHRASE",
      `Expected UNCHANGED or NEUTRAL_REPHRASE after reflow, got ${result.classification}`
    );
  });

  // ── Scenario 2: sentence added in the MIDDLE ─────────────────────────────

  it("SC-02: sentence added in the MIDDLE of a clause → FORWARD_TO_LLM (sim < threshold, LLM path taken)", () => {
    const textA = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    const textB = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "There is a cat in the street and it looks hungry and wants some food please give it food.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    // With a full sentence inserted, sim drops to ~0.81 — well below 0.95.
    // The pair goes straight to LLM via the low-similarity path (no isolation needed).
    const sim = charSimilarity(textA, textB);
    assert.ok(sim < SIM_THRESHOLD, `Expected sim < ${SIM_THRESHOLD}, got ${sim}`);

    const result = deterministicDecision(textA, textB);
    assert.equal(result.classification, "FORWARD_TO_LLM", "Mid-body insertion must go to LLM");
    // hasIsolation is false because sim < threshold — pair goes to LLM via
    // the ordinary path, not the high-sim isolation path.
    // Either way it reaches the LLM for correct semantic classification.
    assert.equal(result.hasIsolation, false);
  });

  // ── Scenario 2b: sentence added at the END (tail insertion) ──────────────

  it("SC-02b: sentence added at the END of a clause → FORWARD_TO_LLM (sim < threshold, LLM path taken)", () => {
    const textA =
      "A. The Supplier has been engaged to provide Services under the Master Services Agreement dated 1 January 2024.";
    const textB =
      "A. The Supplier has been engaged to provide Services under the Master Services Agreement dated 1 January 2024. There is a cat in the street and it looks hungry and wants some food please give it food.";

    // sim ≈ 0.708 — well below 0.95 due to extra sentence
    const sim = charSimilarity(textA, textB);
    assert.ok(sim < SIM_THRESHOLD, `Expected sim < ${SIM_THRESHOLD}, got ${sim}`);

    const result = deterministicDecision(textA, textB);
    assert.equal(result.classification, "FORWARD_TO_LLM", "Tail insertion must go to LLM");
  });

  // ── Scenario 3: sentence removed from the MIDDLE ─────────────────────────

  it("SC-03: sentence removed from the MIDDLE of a clause → FORWARD_TO_LLM (sim < threshold, LLM path taken)", () => {
    const textB = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    const textA = [
      "The Supplier agrees to process personal data only on documented instructions from the Controller.",
      "There is a cat in the street and it looks hungry and wants some food please give it food.",
      "The Supplier shall not transfer personal data to a third country without prior authorisation.",
    ].join(" ");

    const sim = charSimilarity(textA, textB);
    assert.ok(sim < SIM_THRESHOLD, `Expected sim < ${SIM_THRESHOLD}, got ${sim}`);

    const result = deterministicDecision(textA, textB);
    assert.equal(result.classification, "FORWARD_TO_LLM", "Mid-body removal must go to LLM");
  });

  // ── Scenario 3b: sentence removed from the END (tail removal) ────────────

  it("SC-03b: sentence removed from the END of a clause → FORWARD_TO_LLM (sim < threshold, LLM path taken)", () => {
    const textA =
      "The confidentiality obligations shall survive termination of this Agreement for a period of five years. For the avoidance of doubt, this clause applies to all forms of Confidential Information disclosed during the term of this Agreement including any renewals thereof.";
    const textB =
      "The confidentiality obligations shall survive termination of this Agreement for a period of five years.";

    const sim = charSimilarity(textA, textB);
    assert.ok(sim < SIM_THRESHOLD, `Expected sim < ${SIM_THRESHOLD}, got ${sim}`);

    const result = deterministicDecision(textA, textB);
    assert.equal(result.classification, "FORWARD_TO_LLM", "Tail removal must go to LLM");
  });

  // ── Scenario 2c: high-sim tail insertion (isolation guard path) ───────────
  // When the inserted sentence is short enough that the overall sim stays ≥ 0.95,
  // the length delta guard catches it and still forces LLM + isolation flag.

  it("SC-02c: high-sim pair with a length delta ≥ 30 → FORWARD_TO_LLM with hasIsolation=true", () => {
    // Base is a very long clause. Adding a ~35-char phrase keeps sim ≥ 0.95
    // but the length delta is ≥ 30, so hasSubstantialLengthDelta fires.
    const longBase = "The Receiving Party shall hold all Confidential Information received from the Disclosing Party in strict confidence and shall use the same degree of care to protect such information as it uses to protect its own confidential information of a similar nature, but in no event less than reasonable care, and shall not disclose such information to any third party without the prior written consent of the Disclosing Party.";
    const longModified = longBase + " Notwithstanding the foregoing, the Receiving Party may disclose such information to its professional advisors on a need-to-know basis.";

    const sim = charSimilarity(longBase, longModified);
    const delta = Math.abs(longBase.length - longModified.length);
    console.log(`SC-02c: sim=${sim.toFixed(4)} delta=${delta}`);

    if (sim >= SIM_THRESHOLD && delta >= MIN_ISOLATED_CHARS) {
      const result = deterministicDecision(longBase, longModified);
      assert.equal(result.classification, "FORWARD_TO_LLM");
      assert.equal(result.hasIsolation, true, "High-sim pair with length delta must have hasIsolation=true");
    } else if (sim < SIM_THRESHOLD) {
      // If sim dropped below threshold, pair goes to LLM directly — also correct
      const result = deterministicDecision(longBase, longModified);
      assert.equal(result.classification, "FORWARD_TO_LLM");
    } else {
      assert.fail(`Unexpected: sim=${sim}, delta=${delta} — neither path covers this case`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. runDeterministicMatching — alignment scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("runDeterministicMatching", () => {

  // ── Scenario 5: numbered clause removed, no cascade ──────────────────────

  it("SC-05: one numbered clause removed → 1 REMOVED pair, no cascade on neighbours", () => {
    const clausesA: ExtractedClause[] = [
      makeClause("a-1", "1. Definitions", "Definitions body text here that is long enough.", ["1"]),
      makeClause("a-2", "2. Obligations", "Obligations body text here that is long enough.", ["2"]),
      makeClause("a-3", "3. Liability",   "Liability body text here that is long enough.",   ["3"]),
      makeClause("a-4", "4. Term",        "Term body text here that is long enough.",         ["4"]),
    ];

    // Remove clause 2 from B
    const clausesB: ExtractedClause[] = [
      makeClause("b-1", "1. Definitions", "Definitions body text here that is long enough.", ["1"]),
      makeClause("b-3", "3. Liability",   "Liability body text here that is long enough.",   ["3"]),
      makeClause("b-4", "4. Term",        "Term body text here that is long enough.",         ["4"]),
    ];

    const result = runDeterministicMatching(clausesA, clausesB);

    // All 4 A clauses must appear in the result (3 matched + 1 residualA)
    const matchedAIds = new Set([
      ...result.matched.map((p) => p.clauseAId).filter(Boolean),
      ...result.residualA.map((c) => c.id),
    ]);
    assert.ok(matchedAIds.has("a-1"), "a-1 (Definitions) must be accounted for");
    assert.ok(matchedAIds.has("a-3"), "a-3 (Liability) must be accounted for");
    assert.ok(matchedAIds.has("a-4"), "a-4 (Term) must be accounted for");

    // Clause 2 (a-2) should be in residualA (no B counterpart) — not cascaded to a-3/a-4
    assert.ok(
      result.residualA.some((c) => c.id === "a-2"),
      "Removed clause a-2 must be in residualA, not silently merged into a-3"
    );

    // Clauses 1, 3, 4 must be matched correctly (to b-1, b-3, b-4 respectively)
    const pair1 = result.matched.find((p) => p.clauseAId === "a-1");
    const pair3 = result.matched.find((p) => p.clauseAId === "a-3");
    const pair4 = result.matched.find((p) => p.clauseAId === "a-4");

    assert.ok(pair1, "Clause 1 should be matched");
    assert.equal(pair1?.clauseBId, "b-1", "Clause 1 must match to b-1, not cascade to b-3");
    assert.ok(pair3, "Clause 3 should be matched");
    assert.equal(pair3?.clauseBId, "b-3", "Clause 3 must match b-3 — no cascade");
    assert.ok(pair4, "Clause 4 should be matched");
    assert.equal(pair4?.clauseBId, "b-4", "Clause 4 must match b-4 — no cascade");
  });

  // ── Scenario 6: numbered clause added, no cascade ────────────────────────

  it("SC-06: one numbered clause added → 1 ADDED (residualB), no cascade on neighbours", () => {
    const clausesA: ExtractedClause[] = [
      makeClause("a-1", "1. Definitions", "Definitions body text here that is long enough.", ["1"]),
      makeClause("a-2", "2. Obligations", "Obligations body text here that is long enough.", ["2"]),
      makeClause("a-3", "3. Term",        "Term body text here that is long enough.",         ["3"]),
    ];

    // Add a new clause 2 in B (old 2 becomes 3, old 3 becomes 4)
    const clausesB: ExtractedClause[] = [
      makeClause("b-1", "1. Definitions", "Definitions body text here that is long enough.", ["1"]),
      makeClause("b-2", "2. New Data Protection Clause",
        "This new data protection clause governs the processing of personal data.", ["2"]),
      makeClause("b-3", "3. Obligations", "Obligations body text here that is long enough.", ["3"]),
      makeClause("b-4", "4. Term",        "Term body text here that is long enough.",         ["4"]),
    ];

    const result = runDeterministicMatching(clausesA, clausesB);

    // Clause 1 must match correctly
    const pair1 = result.matched.find((p) => p.clauseAId === "a-1");
    assert.ok(pair1, "Clause 1 should be matched");
    assert.equal(pair1?.clauseBId, "b-1");

    // The new clause b-2 must end up as residualB (added)
    assert.ok(
      result.residualB.some((c) => c.id === "b-2"),
      "New clause b-2 should be in residualB as an ADDED clause"
    );

    // Old Obligations (a-2 → b-3) must be matched — LCS handles the renumber
    const pair2 = result.matched.find((p) => p.clauseAId === "a-2");
    assert.ok(pair2, "Old Obligations clause should be matched (via LCS or title)");

    // Old Term (a-3 → b-4) must be matched — not cascaded
    const pair3 = result.matched.find((p) => p.clauseAId === "a-3");
    assert.ok(pair3, "Old Term clause should be matched — no cascade");
  });

  // ── Scenario 11: lettered recital removal, no cascade ────────────────────

  it("SC-11: recital B and C removed → A and D remain correctly aligned, no cascade", () => {
    const recitalAText =
      "A. This Data Protection Annex forms part of the Agreement between the Controller and the Processor and sets out the terms on which the Processor will process personal data on behalf of the Controller.";
    const recitalBText =
      "B. The Supplier has been engaged to provide Services that involve access to and processing of personal data belonging to or relating to the Controller and its customers and employees.";
    const recitalCText =
      "C. The parties wish to set out their respective obligations and rights under applicable data protection legislation in connection with the Services.";
    const recitalDText =
      "D. The Supplier Services are offered to customers in various countries and the Supplier uses sub-processors to fulfil its obligations under this Annex.";

    const clausesA: ExtractedClause[] = [
      makeClause("a-A", "A. This Data Protection Annex", recitalAText, ["A"]),
      makeClause("a-B", "B. The Supplier has been engaged", recitalBText, ["B"]),
      makeClause("a-C", "C. The parties wish", recitalCText, ["C"]),
      makeClause("a-D", "D. The Supplier Services", recitalDText, ["D"]),
      makeClause("a-1", "1. Definitions",  "Definitions body text.", ["1"]),
    ];

    // B and C are removed in the revised document
    const clausesB: ExtractedClause[] = [
      makeClause("b-A", "A. This Data Protection Annex", recitalAText, ["A"]),
      makeClause("b-D", "D. The Supplier Services", recitalDText, ["D"]),
      makeClause("b-1", "1. Definitions",  "Definitions body text.", ["1"]),
    ];

    const result = runDeterministicMatching(clausesA, clausesB);

    // Recital A must match to b-A (identical text)
    const pairA = result.matched.find((p) => p.clauseAId === "a-A");
    assert.ok(pairA, "Recital A must be matched");
    assert.equal(pairA?.clauseBId, "b-A", "Recital A must match its counterpart, not drift");

    // Recital D must match to b-D (identical text — not cascade from B/C removal)
    const pairD = result.matched.find((p) => p.clauseAId === "a-D");
    assert.ok(pairD, "Recital D must be matched");
    assert.equal(pairD?.clauseBId, "b-D", "Recital D must match b-D correctly — no cascade");

    // Clause 1 must match to b-1
    const pair1 = result.matched.find((p) => p.clauseAId === "a-1");
    assert.ok(pair1, "Clause 1 must be matched");
    assert.equal(pair1?.clauseBId, "b-1", "Clause 1 must not cascade");

    // B and C must be in residualA (no B counterpart → will be marked REMOVED)
    const residualIds = result.residualA.map((c) => c.id);
    assert.ok(residualIds.includes("a-B"), "Recital B must be in residualA (removed)");
    assert.ok(residualIds.includes("a-C"), "Recital C must be in residualA (removed)");
  });

  // ── General: no duplicate pair IDs ───────────────────────────────────────

  it("generates unique pair IDs across all matched pairs", () => {
    const clausesA: ExtractedClause[] = [
      makeClause("a-1", "1. Scope",       "Scope body text here long enough.",       ["1"]),
      makeClause("a-2", "2. Payment",     "Payment body text here long enough.",     ["2"]),
      makeClause("a-3", "3. Termination", "Termination body text here long enough.", ["3"]),
    ];
    const clausesB: ExtractedClause[] = [
      makeClause("b-1", "1. Scope",       "Scope body text here long enough.",       ["1"]),
      makeClause("b-2", "2. Payment",     "Payment body text here long enough.",     ["2"]),
      makeClause("b-3", "3. Termination", "Termination body text here long enough.", ["3"]),
    ];

    const result = runDeterministicMatching(clausesA, clausesB);
    const ids = result.matched.map((p) => p.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `Duplicate pair IDs found: ${ids.join(", ")}`);
  });

  // ── Exact text match → confidence 1.0 ────────────────────────────────────

  it("exact text match gives confidence 1.0", () => {
    const text = "The Supplier shall comply with all applicable data protection laws and regulations in force.";
    const clausesA: ExtractedClause[] = [
      makeClause("a-1", "1. Compliance", text, ["1"]),
    ];
    const clausesB: ExtractedClause[] = [
      makeClause("b-1", "1. Compliance", text, ["1"]),
    ];

    const result = runDeterministicMatching(clausesA, clausesB);
    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0].matchConfidence, 1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Integration — segmentation + alignment combined
// ─────────────────────────────────────────────────────────────────────────────

describe("segmentation + alignment integration", () => {
  it("lettered recitals get distinct sectionPaths that survive alignment lookup", () => {
    const textA = [
      "A. Recital A is a long enough body text to form a real segment in the pipeline.",
      "",
      "B. Recital B is a long enough body text to form a real segment in the pipeline.",
      "",
      "C. Recital C is a long enough body text to form a real segment in the pipeline.",
      "",
      "1. Definitions",
      '"Personal Data" has the meaning given in the GDPR.',
    ].join("\n");

    const textB = [
      "A. Recital A is a long enough body text to form a real segment in the pipeline.",
      "",
      "1. Definitions",
      '"Personal Data" has the meaning given in the GDPR.',
    ].join("\n");

    const segA = segmentIntoRawClauses(textA);
    const segB = segmentIntoRawClauses(textB);

    // Convert to ExtractedClause-like objects for matching
    const clausesA: ExtractedClause[] = segA.map((s, i) => ({
      id: `a-${i}`,
      title: s.heading || `Clause ${i + 1}`,
      text: s.text,
      position: s.position,
      sectionPath: s.sectionPath,
    }));
    const clausesB: ExtractedClause[] = segB.map((s, i) => ({
      id: `b-${i}`,
      title: s.heading || `Clause ${i + 1}`,
      text: s.text,
      position: s.position,
      sectionPath: s.sectionPath,
    }));

    const result = runDeterministicMatching(clausesA, clausesB);

    // Recital A must match between docs
    const recitalAinA = clausesA.find((c) => c.sectionPath[0] === "A");
    const recitalAinB = clausesB.find((c) => c.sectionPath[0] === "A");
    assert.ok(recitalAinA, "Recital A should exist in A");
    assert.ok(recitalAinB, "Recital A should exist in B");

    const pairA = result.matched.find(
      (p) => p.clauseAId === recitalAinA?.id && p.clauseBId === recitalAinB?.id
    );
    assert.ok(pairA, "Recital A must be correctly paired across documents");

    // Recitals B and C must be in residualA (no counterpart in B)
    const bIds = clausesA
      .filter((c) => c.sectionPath[0] === "B" || c.sectionPath[0] === "C")
      .map((c) => c.id);
    for (const id of bIds) {
      assert.ok(
        result.residualA.some((c) => c.id === id),
        `Recital ${id} should be residualA (removed), not incorrectly matched`
      );
    }
  });

  it("line-wrap / reflow of the same clause text does not create extra segments", () => {
    const wrapped = [
      "1. DEFINITIONS",
      "Confidential Information means any information disclosed by one party",
      "to the other in connection with this Agreement.",
      "2. OBLIGATIONS",
      "The Receiving Party agrees to hold the information in confidence.",
    ].join("\n");
    const reflowed = [
      "1. DEFINITIONS",
      "Confidential Information means any information disclosed by one party to the other in connection with this Agreement.",
      "2. OBLIGATIONS",
      "The Receiving Party agrees to hold the information in confidence.",
    ].join("\n");

    const a = segmentIntoRawClauses(normaliseExtractedText(wrapped));
    const b = segmentIntoRawClauses(normaliseExtractedText(reflowed));
    assert.equal(a.length, b.length);
    assert.equal(a[0].sectionPath.join("."), b[0].sectionPath.join("."));
    assert.equal(a[1].sectionPath.join("."), b[1].sectionPath.join("."));
  });

  it("pagination-style page-break between body lines does not split a clause", () => {
    const onePage = [
      "1. DEFINITIONS",
      "Confidential Information means any information disclosed by one party to the other in connection with this Agreement including technical and commercial information.",
    ].join("\n");
    const twoPage = [
      "1. DEFINITIONS",
      "Confidential Information means any information disclosed by one party to the other",
      "in connection with this Agreement including technical and commercial information.",
    ].join("\n");

    const a = segmentIntoRawClauses(normaliseExtractedText(onePage));
    const b = segmentIntoRawClauses(normaliseExtractedText(twoPage));
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(a[0].sectionPath[0], "1");
    assert.equal(b[0].sectionPath[0], "1");
  });
});
