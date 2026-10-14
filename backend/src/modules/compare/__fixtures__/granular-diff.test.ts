/**
 * granular-diff.test.ts
 *
 * Pure-function tests for atomic semantic changes inside one ClauseDifference.
 * No LLM. Alignment is not exercised here.
 */

process.env.GOOGLE_CLOUD_PROJECT ??= "compare-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AtomicChange, ClauseDifference } from "../models/compare-state.js";
import { computeStats } from "../prompts/executive-summary-prompt.js";
import { DifferenceResponseSchema } from "../schemas/difference-schema.js";
import {
  applyGranularChanges,
  changeFingerprint,
  dedupeChangesAcrossPairs,
  emptyAtomicChanges,
  sanitizeAtomicChanges,
} from "../utils/granular-diff.js";

const ORIGINAL_SECURITY = [
  "3.6. 1  it has implemented and maintains a comprehensive written information security program that complies with Privacy and",
  "Data Protection Law and Appendix 1. Encryption in transit uses TLS. Penetration testing is performed annually.",
  "Logs are retained for 30 days. Data at rest is protected using encryption.",
].join(" ");

const MODIFIED_SECURITY = [
  "3. 1 Security Requirements (ELEVATED PRIORITY)",
  "Supplier shall implement and maintain a comprehensive written information security program that complies with Privacy and",
  "Data Protection Law. Encryption in transit uses TLS 1.2+. Penetration testing is performed quarterly.",
  "Logs are retained for 1 year. Data at rest is protected using AES-256 encryption.",
].join(" ");

function change(partial: Partial<AtomicChange> & Pick<AtomicChange, "topic" | "originalSnippet" | "modifiedSnippet">): AtomicChange {
  return {
    classification: "MODIFIED_BROADER",
    summary: partial.summary ?? `${partial.topic} changed`,
    confidence: partial.confidence ?? 0.9,
    ...partial,
  };
}

const SECURITY_CHANGES: AtomicChange[] = [
  change({
    topic: "tls_in_transit",
    summary: "TLS requirement changed from TLS to TLS 1.2+ in transit",
    originalSnippet: "Encryption in transit uses TLS.",
    modifiedSnippet: "Encryption in transit uses TLS 1.2+.",
  }),
  change({
    topic: "penetration_testing",
    summary: "Pen-test frequency changed from annually to quarterly",
    originalSnippet: "Penetration testing is performed annually.",
    modifiedSnippet: "Penetration testing is performed quarterly.",
  }),
  change({
    topic: "log_retention",
    summary: "Log retention changed from 30 days to 1 year",
    originalSnippet: "Logs are retained for 30 days.",
    modifiedSnippet: "Logs are retained for 1 year.",
  }),
  change({
    topic: "encryption_at_rest",
    summary: "Encryption requirement strengthened to AES-256 at rest",
    originalSnippet: "Data at rest is protected using encryption.",
    modifiedSnippet: "Data at rest is protected using AES-256 encryption.",
  }),
];

function parentDiff(
  pairId: string,
  changes: AtomicChange[],
  extras: Partial<ClauseDifference> = {}
): ClauseDifference {
  const applied = applyGranularChanges(changes, ORIGINAL_SECURITY, MODIFIED_SECURITY, 0.8);
  return {
    pairId,
    clauseAId: "a-sec",
    clauseBId: "b-sec",
    classification: applied.rollup.classification,
    semanticSummary: applied.rollup.semanticSummary,
    confidence: applied.rollup.confidence,
    detectionMethod: "llm",
    changes: applied.changes,
    ...extras,
  };
}

describe("granular semantic diff", () => {
  it("Security clause with 4 independent changes → 4 atomic changes, 1 parent", () => {
    const { changes, rollup } = applyGranularChanges(
      SECURITY_CHANGES,
      ORIGINAL_SECURITY,
      MODIFIED_SECURITY,
      0.8
    );
    assert.equal(changes.length, 4);
    assert.deepEqual(
      changes.map((c) => c.topic).sort(),
      ["encryption_at_rest", "log_retention", "penetration_testing", "tls_in_transit"]
    );
    assert.equal(rollup.classification, "MODIFIED_BROADER");
    assert.match(rollup.semanticSummary, /TLS/);
    assert.match(rollup.semanticSummary, /quarterly/i);
    assert.match(rollup.semanticSummary, /1 year/);
    assert.match(rollup.semanticSummary, /AES-256/);

    const diffs: ClauseDifference[] = [
      {
        pairId: "pair-sec",
        clauseAId: "a-sec",
        clauseBId: "b-sec",
        classification: rollup.classification,
        semanticSummary: rollup.semanticSummary,
        confidence: rollup.confidence,
        detectionMethod: "llm",
        changes,
      },
    ];
    assert.equal(diffs.length, 1);
    const stats = computeStats(diffs, []);
    assert.equal(stats.totalPairs, 1);
    assert.equal(stats.modifiedBroader, 1);
    assert.equal(stats.modifiedNarrower, 0);
  });

  it("Duplicate topic → deduplicated", () => {
    const dup = [
      SECURITY_CHANGES[0],
      change({
        topic: "TLS in transit",
        summary: "TLS raised again",
        originalSnippet: "Encryption in transit uses TLS.",
        modifiedSnippet: "Encryption in transit uses TLS 1.2+.",
        confidence: 0.5,
      }),
    ];
    const { changes } = applyGranularChanges(dup, ORIGINAL_SECURITY, MODIFIED_SECURITY, 0.8);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].topic, "tls_in_transit");
    assert.equal(changes[0].confidence, 0.9);
  });

  it("Same atomic change repeated across pairs → lower-confidence duplicate removed", () => {
    const high = parentDiff("pair-high", [SECURITY_CHANGES[0]]);
    const lowChange = {
      ...SECURITY_CHANGES[0],
      confidence: 0.4,
      summary: "TLS mentioned again",
    };
    const low = parentDiff("pair-low", [lowChange, SECURITY_CHANGES[1]]);
    assert.equal(changeFingerprint(high.changes![0]), changeFingerprint(low.changes![0]));

    const out = dedupeChangesAcrossPairs([high, low]);
    assert.equal(out.length, 2, "still one parent row per pair");
    assert.equal(out[0].changes?.length, 1);
    assert.equal(out[1].changes?.length, 1);
    assert.equal(out[1].changes![0].topic, "penetration_testing");
    assert.equal(out[1].classification, "MODIFIED_BROADER");
  });

  it("Identical text → changes []", () => {
    const same = "The Supplier shall maintain a written information security program.";
    const { changes, rollup } = applyGranularChanges(
      [
        change({
          topic: "security_program",
          summary: "Invented tightening",
          originalSnippet: same,
          modifiedSnippet: same,
        }),
      ],
      same,
      same,
      0.9
    );
    assert.deepEqual(changes, emptyAtomicChanges());
    assert.equal(rollup.classification, "NEUTRAL_REPHRASE");
  });

  it("Neutral rephrase → no fabricated atomic material change", () => {
    const a = "The Supplier shall maintain a written information security program that complies with applicable law.";
    const b = "Supplier will keep a written information security programme that complies with applicable law.";
    const { changes, rollup } = applyGranularChanges(
      [
        change({
          topic: "security_program",
          classification: "MODIFIED_BROADER",
          summary: "Security programme invented as broader",
          originalSnippet: a,
          modifiedSnippet: b,
        }),
      ],
      a,
      b,
      0.7
    );
    assert.equal(changes.length, 0, "whole-clause restatement is not an independent change");
    assert.equal(rollup.classification, "NEUTRAL_REPHRASE");

    const evidencedRephrase = applyGranularChanges(
      [
        {
          topic: "defined_term",
          classification: "NEUTRAL_REPHRASE",
          summary: "British spelling of programme only",
          originalSnippet: "information security program that complies",
          modifiedSnippet: "information security programme that complies",
          confidence: 0.8,
        },
      ],
      a,
      b,
      0.7
    );
    assert.equal(evidencedRephrase.changes.length, 1);
    assert.equal(evidencedRephrase.rollup.classification, "NEUTRAL_REPHRASE");
  });

  it("Added/Removed/Uncertain → no granular changes", () => {
    const added: ClauseDifference = {
      pairId: "p-add",
      clauseAId: null,
      clauseBId: "b-1",
      classification: "ADDED",
      semanticSummary: "",
      confidence: 0.9,
      detectionMethod: "identical",
      changes: emptyAtomicChanges(),
    };
    const removed: ClauseDifference = {
      pairId: "p-rem",
      clauseAId: "a-1",
      clauseBId: null,
      classification: "REMOVED",
      semanticSummary: "",
      confidence: 0.9,
      detectionMethod: "identical",
      changes: emptyAtomicChanges(),
    };
    const uncertain: ClauseDifference = {
      pairId: "p-unc",
      clauseAId: "a-2",
      clauseBId: null,
      classification: "UNCHANGED",
      semanticSummary: "Correspondence could not be established.",
      confidence: 0.2,
      detectionMethod: "fallback",
      changes: emptyAtomicChanges(),
    };
    assert.equal(added.changes?.length, 0);
    assert.equal(removed.changes?.length, 0);
    assert.equal(uncertain.changes?.length, 0);
    const leftover = sanitizeAtomicChanges(SECURITY_CHANGES, "", "only B text");
    assert.equal(leftover.length, 0);
  });

  it("Existing 1:1 alignment/statistics remain unchanged", () => {
    const { changes, rollup } = applyGranularChanges(
      SECURITY_CHANGES,
      ORIGINAL_SECURITY,
      MODIFIED_SECURITY,
      0.8
    );
    const diffs: ClauseDifference[] = [
      {
        pairId: "pair-sec",
        clauseAId: "a-sec",
        clauseBId: "b-sec",
        classification: rollup.classification,
        semanticSummary: rollup.semanticSummary,
        confidence: rollup.confidence,
        detectionMethod: "llm",
        changes,
      },
      {
        pairId: "pair-add",
        clauseAId: null,
        clauseBId: "b-new",
        classification: "ADDED",
        semanticSummary: "",
        confidence: 0.88,
        detectionMethod: "identical",
        changes: emptyAtomicChanges(),
      },
      {
        pairId: "pair-unc",
        clauseAId: "a-orphan",
        clauseBId: null,
        classification: "UNCHANGED",
        semanticSummary: "Correspondence could not be established.",
        confidence: 0.2,
        detectionMethod: "fallback",
        changes: emptyAtomicChanges(),
      },
    ];
    const stats = computeStats(diffs, []);
    assert.equal(stats.totalPairs, 3);
    assert.equal(stats.modifiedBroader, 1);
    assert.equal(stats.added, 1);
    assert.equal(stats.unchanged, 1);
    assert.equal(stats.fallbackCount, 1);
    const material = stats.added + stats.removed + stats.modifiedBroader + stats.modifiedNarrower;
    assert.equal(material, 2);
  });

  it("parses LLM payloads that omit changes (backward compatible)", () => {
    const parsed = DifferenceResponseSchema.safeParse([
      {
        pairId: "pair-1",
        clauseAId: null,
        clauseBId: null,
        classification: "MODIFIED_BROADER",
        semanticSummary: "Audit frequency increased to quarterly.",
        confidence: 0.9,
      },
    ]);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data[0].changes, []);
    }
  });

  it("drops invented snippets that are not in the source texts", () => {
    const { changes } = applyGranularChanges(
      [
        change({
          topic: "quantum_encryption",
          summary: "Invented quantum requirement",
          originalSnippet: "uses rot13 on all payloads",
          modifiedSnippet: "uses post-quantum kyber",
        }),
      ],
      ORIGINAL_SECURITY,
      MODIFIED_SECURITY,
      0.9
    );
    assert.equal(changes.length, 0);
  });
});
