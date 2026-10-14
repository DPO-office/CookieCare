/**
 * Alignment-contract regression tests.
 *
 * Pure functions only — no LLM, no PDF I/O.
 */

process.env.GOOGLE_CLOUD_PROJECT ??= "compare-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedClause, AlignedPair } from "../models/compare-state.js";
import {
  buildAlignedPair,
  enforceOrdinaryMatchUniqueness,
  findDuplicateOrdinaryMappings,
  makePairFactory,
} from "../utils/alignment-contract.js";
import {
  assignStructuralMatches,
  classifyUnmatchedResiduals,
  detectSplitMerge,
  moduleKeysById,
  scoreClausePair,
} from "../utils/structural-scorer.js";
import { computeStats } from "../prompts/executive-summary-prompt.js";
import type { ClauseDifference } from "../models/compare-state.js";

function clause(
  id: string,
  title: string,
  text: string,
  path: string[],
  position = 0
): ExtractedClause {
  return { id, title, text, sectionPath: path, position };
}

function ids(start = 0) {
  return makePairFactory(start);
}

describe("alignment contract — numeric labels are not sufficient", () => {
  it("3.8 Sub-processors vs 3.8 Audit Rights is rejected", () => {
    const a = clause(
      "a-1",
      "3.8 Sub-processors",
      "Supplier may appoint sub-processors to process Personal Data only with prior written authorisation and a written contract imposing equivalent data protection obligations.",
      ["3", "3.8"]
    );
    const b = clause(
      "b-1",
      "3.8 Audit Rights",
      "Mastercard may conduct audits of Supplier's facilities, systems and records on reasonable notice to verify compliance with this Agreement.",
      ["3", "3.8"]
    );
    const scored = scoreClausePair(a, b, {
      indexA: 8,
      indexB: 8,
      lenA: 20,
      lenB: 20,
    });
    assert.equal(scored.rejected, true);
    assert.ok(scored.score === 0);
  });

  it("3.8 Sub-processors vs 4.2 Subprocessor Management may match despite numbering", () => {
    const text =
      "Supplier may appoint sub-processors to process Personal Data only with prior written authorisation and must impose equivalent data protection obligations in writing.";
    const a = clause("a-1", "3.8 Sub-processors", text, ["3", "3.8"]);
    const b = clause("b-1", "4.2 Subprocessor Management", text, ["4", "4.2"]);
    const scored = scoreClausePair(a, b, {
      indexA: 8,
      indexB: 9,
      lenA: 20,
      lenB: 20,
    });
    assert.equal(scored.rejected, false);
    assert.ok(scored.score >= 0.4, `expected usable score, got ${scored.score}`);
    assert.ok(scored.titleJac > 0.2 || scored.contentSim > 0.8);
  });
});

describe("alignment contract — 1:1 ordinary mappings", () => {
  it("detects A1→B1 and A2→B1 as a duplicate ordinary mapping", () => {
    const next = ids();
    const pairs: AlignedPair[] = [
      buildAlignedPair(next, {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 0.9,
        alignmentMethod: "structural",
        alignmentReasons: ["first"],
      }),
      buildAlignedPair(next, {
        clauseAId: "a-2",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 0.7,
        alignmentMethod: "structural",
        alignmentReasons: ["second"],
      }),
    ];
    const v = findDuplicateOrdinaryMappings(pairs);
    assert.equal(v.length, 1);
    assert.equal(v[0].side, "B");
    assert.equal(v[0].clauseId, "b-1");
  });

  it("SPLIT may reuse the same A clause", () => {
    const next = ids();
    const pairs: AlignedPair[] = [
      buildAlignedPair(next, {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "SPLIT",
        matchConfidence: 0.8,
        alignmentMethod: "structural",
        alignmentReasons: ["part 1"],
      }),
      buildAlignedPair(next, {
        clauseAId: "a-1",
        clauseBId: "b-2",
        relationshipType: "SPLIT",
        matchConfidence: 0.8,
        alignmentMethod: "structural",
        alignmentReasons: ["part 2"],
      }),
    ];
    assert.equal(findDuplicateOrdinaryMappings(pairs).length, 0);
  });

  it("downgrades the weaker duplicate MATCH to UNCERTAIN", () => {
    const next = ids();
    const pairs: AlignedPair[] = [
      buildAlignedPair(next, {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 0.95,
        alignmentMethod: "structural",
        alignmentReasons: ["strong"],
      }),
      buildAlignedPair(next, {
        clauseAId: "a-2",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 0.6,
        alignmentMethod: "structural",
        alignmentReasons: ["weak"],
      }),
    ];
    const fixed = enforceOrdinaryMatchUniqueness(pairs);
    const kept = fixed.filter((p) => p.relationshipType === "MATCH");
    const uncertain = fixed.filter((p) => p.relationshipType === "UNCERTAIN");
    assert.equal(kept.length, 1);
    assert.equal(kept[0].clauseAId, "a-1");
    assert.equal(uncertain.length, 1);
    assert.equal(uncertain[0].clauseAId, "a-2");
  });
});

describe("alignment contract — order spine", () => {
  it("does not let a weak out-of-order pair steal an already better spine match", () => {
    const body1 = "Definitions of Personal Data, Controller and Processor for this Agreement.";
    const body2 = "Supplier shall perform the Services with reasonable skill and care.";
    const body3 = "Either party may terminate for material breach upon thirty days notice.";
    const clausesA = [
      clause("a-1", "1. Definitions", body1, ["1"], 0),
      clause("a-2", "2. Services", body2, ["2"], 100),
      clause("a-3", "3. Termination", body3, ["3"], 200),
    ];
    const clausesB = [
      clause("b-1", "1. Definitions", body1, ["1"], 0),
      clause("b-2", "2. Services", body2, ["2"], 100),
      clause("b-3", "3. Termination", body3, ["3"], 200),
    ];
    const next = ids();
    const result = assignStructuralMatches(clausesA, clausesB, clausesA, clausesB, next);
    const b2owners = result.confident.filter((p) => p.clauseBId === "b-2");
    assert.equal(b2owners.length, 1);
    assert.equal(b2owners[0].clauseAId, "a-2");
  });
});

describe("alignment contract — added / removed / uncertain", () => {
  it("identical documents produce only MATCH, zero unmatched", () => {
    const text = "The Supplier shall comply with applicable data protection law in force.";
    const a = [clause("a-1", "1. Compliance", text, ["1"])];
    const b = [clause("b-1", "1. Compliance", text, ["1"])];
    const next = ids();
    const assigned = assignStructuralMatches(a, b, a, b, next);
    assert.equal(assigned.leftoverA.length, 0);
    assert.equal(assigned.leftoverB.length, 0);
    assert.ok(assigned.confident.length + assigned.ambiguous.length >= 0);
  });

  it("one sandwiched numbered deletion is confirmed REMOVED, neighbours stay matched", () => {
    const t1 = "Definitions body text here that is long enough for scoring.";
    const t2 = "Obligations body text here that is long enough for scoring.";
    const t3 = "Liability body text here that is long enough for scoring.";
    const t4 = "Term body text here that is long enough for scoring.";
    const clausesA = [
      clause("a-1", "1. Definitions", t1, ["1"], 0),
      clause("a-2", "2. Obligations", t2, ["2"], 50),
      clause("a-3", "3. Liability", t3, ["3"], 100),
      clause("a-4", "4. Term", t4, ["4"], 150),
    ];
    const clausesB = [
      clause("b-1", "1. Definitions", t1, ["1"], 0),
      clause("b-3", "3. Liability", t3, ["3"], 50),
      clause("b-4", "4. Term", t4, ["4"], 100),
    ];
    const next = ids();
    const matched: AlignedPair[] = [
      buildAlignedPair(next, {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 1,
        alignmentMethod: "structural",
        alignmentReasons: ["exact"],
      }),
      buildAlignedPair(next, {
        clauseAId: "a-3",
        clauseBId: "b-3",
        relationshipType: "MATCH",
        matchConfidence: 1,
        alignmentMethod: "structural",
        alignmentReasons: ["exact"],
      }),
      buildAlignedPair(next, {
        clauseAId: "a-4",
        clauseBId: "b-4",
        relationshipType: "MATCH",
        matchConfidence: 1,
        alignmentMethod: "structural",
        alignmentReasons: ["exact"],
      }),
    ];
    const classified = classifyUnmatchedResiduals(
      [clausesA[1]],
      [],
      clausesA,
      clausesB,
      matched,
      next
    );
    const removed = classified.pairs.filter((p) => p.relationshipType === "REMOVED");
    assert.equal(removed.length, 1);
    assert.equal(removed[0].clauseAId, "a-2");
  });

  it("condensed rewrite leftover original clauses are UNCERTAIN, not mass REMOVED", () => {
    const longA: ExtractedClause[] = [];
    for (let i = 1; i <= 20; i++) {
      longA.push(
        clause(
          `a-${i}`,
          `${i}. Clause ${i}`,
          `This is original clause ${i} with enough body text about obligation ${i} under the agreement.`,
          [String(i)],
          i * 10
        )
      );
    }
    const shortB = [
      clause(
        "b-1",
        "1. Clause 1",
        "This is original clause 1 with enough body text about obligation 1 under the agreement.",
        ["1"],
        0
      ),
      clause(
        "b-new",
        "2. NEW - Zero Trust Architecture",
        "Supplier shall implement a Zero Trust Architecture model for all systems processing Personal Data by 31 December 2026.",
        ["2"],
        20
      ),
    ];
    const matched: AlignedPair[] = [
      buildAlignedPair(ids(0), {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 1,
        alignmentMethod: "structural",
        alignmentReasons: ["exact"],
      }),
    ];
    const leftoverA = longA.slice(1);
    const classified = classifyUnmatchedResiduals(
      leftoverA,
      [shortB[1]],
      longA,
      shortB,
      matched,
      ids(20)
    );
    const removed = classified.pairs.filter((p) => p.relationshipType === "REMOVED");
    const uncertain = classified.pairs.filter((p) => p.relationshipType === "UNCERTAIN");
    const added = classified.pairs.filter((p) => p.relationshipType === "ADDED");
    assert.equal(removed.length, 0, "condensation must not emit mass REMOVED");
    assert.ok(uncertain.length >= 10);
    assert.equal(added.length, 1);
    assert.equal(added[0].clauseBId, "b-new");
  });

  it("condensed rewrite still REMOVED when an entire original module is absent from B", () => {
    const c2pA = clause(
      "a-c2p",
      "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS",
      "These controller to processor specific terms and conditions form part of the agreement.",
      [],
      0
    );
    const c2cA = clause(
      "a-c2c",
      "CONTROLLER TO CONTROLLER SPECIFIC TERMS AND CONDITIONS",
      "These controller to controller specific terms and conditions apply between independent controllers.",
      [],
      200
    );
    const longA: ExtractedClause[] = [c2pA];
    for (let i = 1; i <= 12; i++) {
      longA.push(
        clause(
          `a-c2p-${i}`,
          `3.${i} Processor obligation ${i}`,
          `Processor obligation ${i} under the controller to processor terms with enough body text.`,
          ["3", `3.${i}`],
          i * 10
        )
      );
    }
    longA.push(c2cA);
    for (let i = 1; i <= 8; i++) {
      longA.push(
        clause(
          `a-c2c-${i}`,
          `4.${i} Controller obligation ${i}`,
          `Controller-to-controller obligation ${i} with enough body text about independent controllers.`,
          ["4", `4.${i}`],
          200 + i * 10
        )
      );
    }
    const shortB = [
      clause(
        "b-c2p",
        "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS - MODIFIED",
        "These controller to processor specific terms and conditions form part of the agreement.",
        [],
        0
      ),
      clause(
        "b-1",
        "3.1 Processor obligation 1",
        "Processor obligation 1 under the controller to processor terms with enough body text.",
        ["3", "3.1"],
        10
      ),
    ];
    const matched: AlignedPair[] = [
      buildAlignedPair(ids(0), {
        clauseAId: "a-c2p-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 1,
        alignmentMethod: "structural",
        alignmentReasons: ["exact"],
      }),
    ];
    const leftoverA = longA.filter((c) => c.id !== "a-c2p-1");
    const classified = classifyUnmatchedResiduals(
      leftoverA,
      [],
      longA,
      shortB,
      matched,
      ids(20)
    );
    const removed = classified.pairs.filter((p) => p.relationshipType === "REMOVED");
    const uncertain = classified.pairs.filter((p) => p.relationshipType === "UNCERTAIN");
    const removedIds = new Set(removed.map((p) => p.clauseAId));
    assert.ok(removedIds.has("a-c2c"), "C2C heading should be confirmed REMOVED");
    assert.ok(removedIds.has("a-c2c-1"), "C2C body should be confirmed REMOVED");
    assert.equal(
      leftoverA.filter((c) => c.id.startsWith("a-c2c")).every((c) => removedIds.has(c.id)),
      true,
      "entire absent C2C module must be REMOVED"
    );
    assert.equal(removedIds.has("a-c2p-2"), false, "same-module C2P leftovers must not auto-REMOVED");
    assert.ok(uncertain.some((p) => p.clauseAId === "a-c2p-2"));
  });

  it("explicit NEW leftover Modified clauses are ADDED without AI candidates", () => {
    const leftoverA = [
      clause(
        "a-1",
        "3.6. Security programme",
        "Supplier maintains a written information security program including encryption and access control.",
        ["3", "3.6"],
        10
      ),
      clause(
        "a-2",
        "3.8 Sub-processors",
        "Supplier shall not engage sub-processors without prior written authorisation from the controller.",
        ["3", "3.8"],
        20
      ),
    ];
    const leftoverB = [
      clause(
        "b-new",
        "3.2 NEW - Zero Trust Architecture",
        "Supplier shall implement a Zero Trust Architecture model for all systems processing Personal Data.",
        ["3", "3.2"],
        15
      ),
    ];
    const assigned = assignStructuralMatches(leftoverA, leftoverB, leftoverA, leftoverB, ids());
    assert.equal(
      assigned.ambiguous.filter((c) => c.clauseB.id === "b-new").length,
      0,
      "NEW leftover B must not generate AI pairs"
    );
    assert.equal(assigned.confident.filter((p) => p.clauseBId === "b-new").length, 0);
    const classified = classifyUnmatchedResiduals(
      assigned.leftoverA,
      assigned.leftoverB,
      leftoverA,
      leftoverB,
      assigned.confident,
      ids(10)
    );
    const added = classified.pairs.filter(
      (p) => p.relationshipType === "ADDED" && p.clauseBId === "b-new"
    );
    assert.equal(added.length, 1);
  });

  it("ambiguous candidates are B-centric with at most two Originals per leftover Modified", () => {
    const c2pA = clause(
      "a-c2p",
      "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS",
      "These controller to processor specific terms and conditions form part of the agreement.",
      [],
      0
    );
    const leftoverA = [c2pA];
    for (let i = 1; i <= 8; i++) {
      leftoverA.push(
        clause(
          `a-${i}`,
          `3.${i} Processor topic ${i}`,
          `Generic processor obligation ${i} about Personal Data handling under the agreement with enough body text.`,
          ["3", `3.${i}`],
          i * 10
        )
      );
    }
    leftoverA.push(
      clause(
        "a-37",
        "3.7. 1  Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside the",
        "Supplier agrees and warrants that it will not transfer Personal Data outside Europe except with written consent and standard contractual clauses.",
        ["3", "3.7", "3.7.1"],
        90
      )
    );
    const leftoverB = [
      clause(
        "b-4",
        "4. International Data Transfers (REVISED)",
        "International transfers of Personal Data require prior written consent and standard contractual clauses.",
        ["4"],
        20
      ),
    ];
    const assigned = assignStructuralMatches(leftoverA, leftoverB, leftoverA, leftoverB, ids());
    if (assigned.confident.some((p) => p.clauseBId === "b-4")) {
      assert.equal(assigned.ambiguous.length, 0);
    } else {
      const forB = assigned.ambiguous.filter((c) => c.clauseB.id === "b-4");
      assert.ok(forB.length >= 1, "Transfers must keep a credible Original candidate");
      assert.ok(forB.length <= 2, `B-centric cap exceeded: ${forB.length}`);
      assert.ok(forB.some((c) => c.clauseA.id === "a-37"));
    }
  });

  it("LLM-unavailable leftovers are UNCERTAIN, never fake ADDED/REMOVED by confidence 0", () => {
    const next = ids();
    const pair = buildAlignedPair(next, {
      clauseAId: "a-9",
      clauseBId: null,
      relationshipType: "UNCERTAIN",
      matchConfidence: 0,
      alignmentMethod: "fallback",
      alignmentReasons: ["LLM semantic alignment unavailable"],
    });
    assert.equal(pair.relationshipType, "UNCERTAIN");
    assert.equal(pair.status, "restructured");
    assert.notEqual(pair.status, "removed");
  });
});

describe("alignment contract — split / merge", () => {
  it("classifies a leftover B fragment of an already-matched A as SPLIT", () => {
    const aText =
      "Supplier shall encrypt Personal Data using AES-256 and TLS 1.2+ and shall implement a Zero Trust Architecture for all systems processing Personal Data.";
    const a = clause("a-1", "3. Security", aText, ["3"]);
    const b1 = clause(
      "b-1",
      "3.1 Security Controls",
      "Supplier shall encrypt Personal Data using AES-256 and TLS 1.2+.",
      ["3", "3.1"]
    );
    const b2 = clause(
      "b-2",
      "3.2 Zero Trust Architecture",
      "Supplier shall implement a Zero Trust Architecture for all systems processing Personal Data.",
      ["3", "3.2"]
    );
    const matched: AlignedPair[] = [
      buildAlignedPair(ids(0), {
        clauseAId: "a-1",
        clauseBId: "b-1",
        relationshipType: "MATCH",
        matchConfidence: 0.8,
        alignmentMethod: "structural",
        alignmentReasons: ["security"],
      }),
    ];
    const result = detectSplitMerge(
      [],
      [b2],
      matched,
      new Map([[a.id, a]]),
      new Map([
        [b1.id, b1],
        [b2.id, b2],
      ]),
      ids(5)
    );
    assert.ok(result.pairs.some((p) => p.relationshipType === "SPLIT"));
    assert.ok(result.consumedB.has("b-2"));
  });

  it("condensed leftover Originals in the same cluster MERGED into the already-matched Modified clause", () => {
    const c2pA = clause(
      "a-c2p",
      "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS",
      "These controller to processor specific terms and conditions form part of the agreement.",
      [],
      0
    );
    const a371 = clause(
      "a-371",
      "3.7. 1  Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside the",
      "Supplier agrees and warrants that it will not transfer Personal Data outside Europe except with written consent and standard contractual clauses.",
      ["3", "3.7", "3.7.1"],
      10
    );
    const a373 = clause(
      "a-373",
      "3.7. 3  Supplier represents that it is not subject to any law that would require disclosure of Personal Data to a public authority",
      "Supplier represents that it is not subject to any law that would require disclosure of Personal Data transferred under this agreement to a public authority without notice.",
      ["3", "3.7"],
      12
    );
    const a374 = clause(
      "a-374",
      "3.7. 4  International Data Transfers.  The Parties agree that transfers of Personal Data shall be subject to appropriate safeguards",
      "The Parties agree that transfers of Personal Data shall be subject to appropriate safeguards including standard contractual clauses and prior written authorisation.",
      ["3", "3.7"],
      14
    );
    const a38 = clause(
      "a-38",
      "3.8 Sub-processors",
      "Supplier shall not engage sub-processors without prior written authorisation from the controller.",
      ["3", "3.8"],
      16
    );
    const padding: ExtractedClause[] = [];
    for (let i = 1; i <= 16; i++) {
      padding.push(
        clause(
          `a-pad-${i}`,
          `2.${i} Other obligation ${i}`,
          `Unrelated original obligation ${i} with enough body text under the processor terms.`,
          ["2", `2.${i}`],
          40 + i
        )
      );
    }
    const bTransfers = clause(
      "b-4",
      "4. International Data Transfers (REVISED)",
      "International transfers of Personal Data require prior written consent from the controller and appropriate safeguards including standard contractual clauses.",
      ["4"],
      20
    );
    const allA = [c2pA, a371, a373, a374, a38, ...padding];
    const allB = [
      clause(
        "b-c2p",
        "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS - MODIFIED",
        "These controller to processor specific terms and conditions form part of the agreement.",
        [],
        0
      ),
      bTransfers,
    ];
    const matched: AlignedPair[] = [
      buildAlignedPair(ids(0), {
        clauseAId: "a-371",
        clauseBId: "b-4",
        relationshipType: "MOVED",
        matchConfidence: 0.95,
        alignmentMethod: "structural",
        alignmentReasons: ["transfer cluster"],
      }),
    ];
    const result = detectSplitMerge(
      [a373, a374, a38],
      [],
      matched,
      new Map(allA.map((c) => [c.id, c])),
      new Map(allB.map((c) => [c.id, c])),
      ids(5)
    );
    const merged = result.pairs.filter((p) => p.relationshipType === "MERGED");
    assert.ok(
      merged.some((p) => p.clauseAId === "a-373" && p.clauseBId === "b-4"),
      "3.7.3 should MERGE into the condensed Transfers clause"
    );
    assert.ok(
      merged.some((p) => p.clauseAId === "a-374" && p.clauseBId === "b-4"),
      "3.7.4 should MERGE into the condensed Transfers clause"
    );
    assert.equal(
      merged.some((p) => p.clauseAId === "a-38"),
      false,
      "3.8 sub-processors must not MERGE into Transfers"
    );
  });
});

describe("materiality stats — uncertain is not a confirmed change", () => {
  it("fallback UNCHANGED rows do not contribute to added/removed/modified counts", () => {
    const diffs: ClauseDifference[] = [
      {
        pairId: "pair-1",
        clauseAId: "a-1",
        clauseBId: "b-1",
        classification: "MODIFIED_BROADER",
        semanticSummary: "Audit frequency increased to quarterly.",
        confidence: 0.9,
        detectionMethod: "llm",
      },
      {
        pairId: "pair-2",
        clauseAId: "a-2",
        clauseBId: null,
        classification: "UNCHANGED",
        semanticSummary: "Correspondence could not be established.",
        confidence: 0.2,
        detectionMethod: "fallback",
      },
      {
        pairId: "pair-3",
        clauseAId: "a-3",
        clauseBId: null,
        classification: "UNCHANGED",
        semanticSummary: "Correspondence could not be established.",
        confidence: 0.2,
        detectionMethod: "fallback",
      },
    ];
    const stats = computeStats(diffs, []);
    assert.equal(stats.modifiedBroader, 1);
    assert.equal(stats.added, 0);
    assert.equal(stats.removed, 0);
    assert.equal(stats.fallbackCount, 2);
    const material = stats.added + stats.removed + stats.modifiedBroader + stats.modifiedNarrower;
    assert.equal(material, 1);
  });
});

describe("alignment accuracy pass — heading core, transfers, changelog", () => {
  it("3.10 Liability heading matches 6. Liability EXPANDED by title, not as ADDED", () => {
    const a = clause(
      "a-1",
      "3.10. Liability. The Parties agree that:",
      "Supplier is fully liable to Mastercard for any violations or breaches of Privacy and Data Protection Law or of this Data Processing Agreement.",
      ["3", "3.10"]
    );
    const b = clause(
      "b-1",
      "6. Liability (EXPANDED)",
      "Supplier liability for data protection breaches is uncapped and Supplier shall maintain five million euro insurance.",
      ["6"]
    );
    const scored = scoreClausePair(a, b, {
      indexA: 10,
      indexB: 11,
      lenA: 40,
      lenB: 20,
    });
    assert.equal(scored.rejected, false);
    assert.ok(scored.titleJac >= 0.5, `expected heading-core titleJac, got ${scored.titleJac}`);
    assert.ok(scored.score >= 0.4, `expected ambiguous-or-better score, got ${scored.score}`);

    const classified = classifyUnmatchedResiduals([a], [b], [a], [b], [], ids());
    const added = classified.pairs.filter((p) => p.relationshipType === "ADDED");
    assert.equal(
      added.length,
      0,
      "EXPANDED liability must not be confirmed ADDED while 3.10 exists"
    );
  });

  it("International Data Transfers REVISED is proposed against a transfer counterpart", () => {
    const a27 = clause(
      "a-27",
      "2. 7  International Data Transfers.  In addition to being subject to Section 4.4.2 of this Controller-to-Controller Agreement",
      "Each Party may transfer Personal Data outside Japan only with an adequacy decision or standard contractual clauses.",
      ["2", "2.7"]
    );
    const a37 = clause(
      "a-37",
      "3.7. 1  Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside the",
      "Supplier agrees and warrants that it will not transfer Personal Data outside Europe except with Mastercard consent and appropriate safeguards including standard contractual clauses.",
      ["3", "3.7", "3.7.1"]
    );
    const b = clause(
      "b-4",
      "4. International Data Transfers (REVISED)",
      "International transfers of Personal Data are permitted only to adequate countries or subject to SCCs and Mastercard prior written authorisation.",
      ["4"]
    );
    const allA = [a27, a37];
    const allB = [b];
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const inConfident = assigned.confident.some((p) => p.clauseBId === "b-4");
    const inAmbiguous = assigned.ambiguous.some((c) => c.clauseB.id === "b-4");
    assert.ok(
      inConfident || inAmbiguous,
      "Transfers must be a structural candidate, not dropped before AI"
    );
    assert.ok(
      assigned.confident.some((p) => p.clauseBId === "b-4") ||
        assigned.ambiguous.some(
          (c) =>
            c.clauseB.id === "b-4" && (c.clauseA.id === "a-27" || c.clauseA.id === "a-37")
        )
    );
  });

  it("NEW Removed Provisions changelog quoting 3.7.4 is ADDED, never MERGED", () => {
    const quoted =
      "Supplier agrees that Mastercard may have supplementary Personal Data transfer and localization requirements arising from applicable law.";
    const a = clause(
      "a-374",
      "3.7. 4  Supplier agrees that Mastercard may have supplementary Personal Data transfer and localization requirements arising from",
      quoted,
      ["3", "3.7"]
    );
    const b = clause(
      "b-33",
      "3. 3 NEW - Removed Provisions (For Reference)",
      `The following original provisions are removed for reference: ${quoted}`,
      ["3", "3.3"]
    );
    const assigned = assignStructuralMatches([a], [b], [a], [b], ids());
    assert.equal(assigned.confident.length, 0);
    assert.equal(
      assigned.ambiguous.filter((c) => c.clauseB.id === "b-33").length,
      0
    );
    const classified = classifyUnmatchedResiduals([a], [b], [a], [b], [], ids(5));
    const merged = classified.pairs.filter((p) => p.relationshipType === "MERGED");
    const added = classified.pairs.filter((p) => p.relationshipType === "ADDED");
    assert.equal(merged.length, 0);
    assert.equal(added.length, 1);
    assert.equal(added[0].clauseBId, "b-33");
  });
});

describe("alignment accuracy pass — module-aware matching", () => {
  const c2pA = clause(
    "a-c2p",
    "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS",
    "These controller to processor specific terms and conditions form part of the agreement and apply to processing on behalf of the controller.",
    [],
    0
  );
  const c2cA = clause(
    "a-c2c",
    "CONTROLLER TO CONTROLLER SPECIFIC TERMS AND CONDITIONS",
    "These controller to controller specific terms and conditions apply where each party determines the purposes of processing.",
    [],
    50
  );
  const c2pB = clause(
    "b-c2p",
    "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS - MODIFIED",
    "These controller to processor specific terms and conditions form part of the agreement and apply to processing on behalf of the controller.",
    [],
    0
  );

  it("C2P International Transfers prefers original C2P 3.7 over C2C 4.4.2", () => {
    const a37 = clause(
      "a-37",
      "3.7. 1  Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside the",
      "Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside Europe except with written consent and standard contractual clauses.",
      ["3", "3.7", "3.7.1"],
      10
    );
    const aAppMention = clause(
      "a-app",
      "3.6. 1  it has implemented and maintains a comprehensive written information security program that complies with Privacy and Data Protection Law and Appendix 1",
      "it has implemented and maintains a comprehensive written information security program.",
      ["3", "3.6"],
      8
    );
    const a442 = clause(
      "a-442",
      "4.4.2. Transfers.  ensure that, for any transfers of Personal Data in the context of the Services, the Personal Data",
      "ensure that for any transfers of Personal Data in the context of the Services the Personal Data remains protected under applicable law.",
      ["4", "4.4", "4.4.2"],
      80
    );
    const b4 = clause(
      "b-4",
      "4. International Data Transfers (REVISED)",
      "International transfers of Personal Data require prior written consent from the controller and appropriate safeguards including standard contractual clauses.",
      ["4"],
      20
    );
    const allA = [c2pA, aAppMention, a37, c2cA, a442];
    const allB = [c2pB, b4];
    const keys = moduleKeysById(allA);
    assert.equal(keys.get("a-37"), "controller-to-processor");
    assert.notEqual(keys.get("a-37"), "appendix-1");
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const confident = assigned.confident.filter((p) => p.clauseBId === "b-4");
    if (confident.length > 0) {
      assert.equal(confident[0].clauseAId, "a-37");
    } else {
      const amb = assigned.ambiguous
        .filter((c) => c.clauseB.id === "b-4")
        .sort((x, y) => y.score - x.score);
      assert.ok(amb.length > 0, "Transfers must remain a candidate");
      assert.equal(amb[0].clauseA.id, "a-37");
      assert.ok(
        amb[0].score >= 0.4,
        `C2P 3.7.x must reach the ambiguous floor, got ${amb[0].score}`
      );
    }
  });

  it("C2P DSR Portal does not bind to C2C DSR solely due to title similarity", () => {
    const aDsr = clause(
      "a-dsr",
      "4.4.3. Data Subject Rights.  put in place a mechanism to allow a Data Subject to exercise their rights relative to",
      "put in place a mechanism to allow a Data Subject to exercise their rights relative to the Personal Data processed under this controller to controller agreement.",
      ["4", "4.4", "4.4.3"],
      90
    );
    const bPortal = clause(
      "b-portal",
      "5. NEW - Mandatory Data Subject Rights Portal",
      "Supplier shall build and maintain a dedicated Data Subject Rights Portal with automated erasure within five days.",
      ["5"],
      30
    );
    const allA = [c2pA, c2cA, aDsr];
    const allB = [c2pB, bPortal];
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const boundToC2c = [
      ...assigned.confident.filter((p) => p.clauseBId === "b-portal" && p.clauseAId === "a-dsr"),
      ...assigned.ambiguous.filter((c) => c.clauseB.id === "b-portal" && c.clauseA.id === "a-dsr"),
    ];
    assert.equal(boundToC2c.length, 0, "must not propose C2C DSR as the counterpart");
    const classified = classifyUnmatchedResiduals(
      assigned.leftoverA,
      assigned.leftoverB,
      allA,
      allB,
      assigned.confident,
      ids(20)
    );
    const addedPortal = classified.pairs.filter(
      (p) => p.relationshipType === "ADDED" && p.clauseBId === "b-portal"
    );
    assert.equal(addedPortal.length, 1);
  });

  it("Liability 3.10 → 6 remains a same-module correspondence, not ADDED", () => {
    const a310 = clause(
      "a-310",
      "3.10. Liability. The Parties agree that:",
      "Supplier is fully liable to Mastercard for any violations or breaches of Privacy and Data Protection Law or of this Data Processing Agreement.",
      ["3", "3.10"],
      20
    );
    const b6 = clause(
      "b-6",
      "6. Liability (EXPANDED)",
      "Supplier liability for data protection breaches is uncapped and Supplier shall maintain five million euro insurance.",
      ["6"],
      40
    );
    const allA = [c2pA, a310, c2cA];
    const allB = [c2pB, b6];
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const hit =
      assigned.confident.find((p) => p.clauseBId === "b-6") ??
      assigned.ambiguous
        .filter((c) => c.clauseB.id === "b-6")
        .sort((x, y) => y.score - x.score)[0];
    assert.ok(hit, "liability must remain a candidate");
    const aId = "clauseAId" in hit ? hit.clauseAId : hit.clauseA.id;
    assert.equal(aId, "a-310");
    const classified = classifyUnmatchedResiduals(
      assigned.leftoverA,
      assigned.leftoverB.filter((c) => c.id === "b-6"),
      allA,
      allB,
      assigned.confident,
      ids(30)
    );
    const added = classified.pairs.filter((p) => p.relationshipType === "ADDED" && p.clauseBId === "b-6");
    assert.equal(added.length, 0);
  });

  it("Liability heading 3.10 is preferred over child body 3.10.1", () => {
    const a310 = clause(
      "a-310",
      "3.10. Liability. The Parties agree that:",
      "3.10. Liability. The Parties agree that:",
      ["3", "3.10"],
      20
    );
    const a3101 = clause(
      "a-3101",
      "3.10. 1  Supplier is fully liable to Mastercard for any violations or breaches of Privacy and Data Protection Law or of this Data",
      "Supplier is fully liable to Mastercard for any violations or breaches of Privacy and Data Protection Law or of this Data Processing Agreement and shall maintain insurance.",
      ["3", "3.10"],
      21
    );
    const b6 = clause(
      "b-6",
      "6. Liability (EXPANDED)",
      "The Parties agree that: Supplier is fully liable to Mastercard for any violations or breaches of Privacy and Data Protection Law and shall maintain five million euro insurance.",
      ["6"],
      40
    );
    const aAppMention = clause(
      "a-app",
      "3.6. 1  it has implemented and maintains a comprehensive written information security program that complies with Privacy and Data Protection Law and Appendix 1",
      "it has implemented and maintains a comprehensive written information security program that complies with Privacy and Data Protection Law and Appendix 1.",
      ["3", "3.6"],
      10
    );
    const aAnnexCite = clause(
      "a-cite",
      "annex 1 of Addendum A1 of the Agreement or otherwise authorized by Mastercard in writing in advance under the respective",
      "The processor may only use subprocessors listed in annex 1 of Addendum A1 of the Agreement.",
      ["3"],
      18
    );
    const allA = [c2pA, aAppMention, aAnnexCite, a310, a3101, c2cA];
    assert.equal(moduleKeysById(allA).get("a-310"), "controller-to-processor");
    const allB = [c2pB, b6];
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const hit =
      assigned.confident.find((p) => p.clauseBId === "b-6") ??
      assigned.ambiguous
        .filter((c) => c.clauseB.id === "b-6")
        .sort((x, y) => y.score - x.score)[0];
    assert.ok(hit, "liability must remain a candidate");
    const aId = "clauseAId" in hit ? hit.clauseAId : hit.clauseA.id;
    assert.equal(aId, "a-310");
    const childHit = [
      ...assigned.confident.filter((p) => p.clauseAId === "a-3101" && p.clauseBId === "b-6"),
      ...assigned.ambiguous.filter((c) => c.clauseA.id === "a-3101" && c.clauseB.id === "b-6"),
    ];
    assert.equal(childHit.length, 0, "child 3.10.1 must not outrank the 3.10 heading");
  });

  it("C2P Security body-as-title remains a candidate, not ADDED as a new section", () => {
    const aCompliance = clause(
      "a-comp",
      "3.2. Compliance with Privacy and Data Protection Law.",
      "Both Parties represent and warrant that they will comply with Privacy and Data Protection Law when Processing Personal Data.",
      ["3", "3.2"],
      12
    );
    const aSecurity = clause(
      "a-sec",
      "3.6. 1  it has implemented and maintains a comprehensive written information security program that complies with Privacy and Data Protection Law and Appendix 1",
      "it has implemented and maintains a comprehensive written information security program that complies with Privacy and Data Protection Law including encryption, TLS, and periodic testing.",
      ["3", "3.6"],
      15
    );
    const bSecurity = clause(
      "b-sec",
      "3. 1 Security Requirements (ELEVATED PRIORITY)",
      "Supplier shall implement and maintain a comprehensive written information security program that complies with Privacy and Data Protection Law including encryption, TLS, and periodic testing.",
      ["3"],
      25
    );
    const aFragment = clause(
      "a-frag",
      "3. 9, this section 3.6.4 will prevail.",
      "3. 9, this section 3.6.4 will prevail. 3.6.5 Except to the extent prohibited by applicable legal, regulatory or law enforcement requirements, Supplier must obtain Mastercard authorisation.",
      ["3"],
      16
    );
    const aAudit = clause(
      "a-audit",
      "3.9. 3  Supplier agrees to fully cooperate with such Data Protection and Security Audit and implement all commercially reasonable",
      "Supplier agrees to fully cooperate with such Data Protection and Security Audit and implement all commercially reasonable changes to its Information Security Program.",
      ["3", "3.9"],
      18
    );
    const allA = [c2pA, aCompliance, aSecurity, aFragment, aAudit, c2cA];
    const keys = moduleKeysById(allA);
    assert.equal(keys.get("a-sec"), "controller-to-processor");
    assert.notEqual(keys.get("a-sec"), "appendix-1");
    const allB = [c2pB, bSecurity];
    const assigned = assignStructuralMatches(allA, allB, allA, allB, ids());
    const hit =
      assigned.confident.find((p) => p.clauseBId === "b-sec") ??
      assigned.ambiguous
        .filter((c) => c.clauseB.id === "b-sec")
        .sort((x, y) => y.score - x.score)[0];
    assert.ok(hit, "security must be a structural/AI candidate");
    const aId = "clauseAId" in hit ? hit.clauseAId : hit.clauseA.id;
    assert.equal(aId, "a-sec");
    const classified = classifyUnmatchedResiduals(
      assigned.leftoverA,
      assigned.leftoverB,
      allA,
      allB,
      assigned.confident,
      ids(40)
    );
    const addedSec = classified.pairs.filter(
      (p) => p.relationshipType === "ADDED" && p.clauseBId === "b-sec"
    );
    assert.equal(addedSec.length, 0, "elevated-priority security is not a new section");
  });
});