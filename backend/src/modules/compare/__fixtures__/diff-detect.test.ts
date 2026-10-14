/**
 * Focused deterministic-diff tests for MERGED, REMOVED rollup, and changelog ADDED.
 * No LLM. Alignment producers are not exercised.
 */

process.env.GOOGLE_CLOUD_PROJECT ??= "compare-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedClause } from "../models/compare-state.js";
import { buildAlignedPair, makePairFactory } from "../utils/alignment-contract.js";
import {
  collectRemovedRollupIds,
  tryDeterministic,
  type DeterministicResult,
} from "../steps/diff-detect.js";

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

function isForwardToLlm(
  result: DeterministicResult
): result is { forwardToLLM: true; hasIsolation: boolean } {
  return "forwardToLLM" in result;
}

const LONG_A =
  "Supplier agrees and warrants that it will not transfer Personal Data outside Europe except with written consent and standard contractual clauses covering the transfer of personal data to third countries.";
const LONG_B =
  "International transfers of Personal Data require prior written consent from the controller at least thirty days in advance together with mapping, risk assessments, and safeguard documentation including standard contractual clauses.";

describe("diff-detect — MERGED is structural correspondence", () => {
  const aChild = clause(
    "a-373",
    "3.7. 3  Supplier represents that it is not subject to any law that would require disclosure of Personal Data",
    LONG_A,
    ["3", "3.7"],
    12
  );
  const bTransfers = clause(
    "b-4",
    "4. International Data Transfers (REVISED)",
    LONG_B,
    ["4"],
    20
  );
  const maps = {
    a: new Map([[aChild.id, aChild]]),
    b: new Map([[bTransfers.id, bTransfers]]),
  };

  it("MERGED pair → non-material fallback", () => {
    const pair = buildAlignedPair(ids(), {
      clauseAId: aChild.id,
      clauseBId: bTransfers.id,
      relationshipType: "MERGED",
      matchConfidence: 0.62,
      alignmentMethod: "structural",
      alignmentReasons: ["same numbered cluster"],
    });
    const result = tryDeterministic(pair, maps.a, maps.b);
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
    assert.equal(result.confidence, 0);
    assert.equal(result.semanticSummary, "structural merge into already-diffed counterpart");
  });

  it("MERGED pair is not sent to LLM even when length delta would isolate a MATCH", () => {
    const pair = buildAlignedPair(ids(), {
      clauseAId: aChild.id,
      clauseBId: bTransfers.id,
      relationshipType: "MERGED",
      matchConfidence: 0.62,
      alignmentMethod: "structural",
      alignmentReasons: ["cluster"],
    });
    const merged = tryDeterministic(pair, maps.a, maps.b);
    assert.equal(isForwardToLlm(merged), false);
    assert.equal("hasIsolation" in merged, false);

    const moved = buildAlignedPair(ids(10), {
      clauseAId: aChild.id,
      clauseBId: bTransfers.id,
      relationshipType: "MOVED",
      matchConfidence: 0.95,
      alignmentMethod: "structural",
      alignmentReasons: ["primary"],
    });
    const primary = tryDeterministic(moved, maps.a, maps.b);
    assert.equal(isForwardToLlm(primary), true);
  });
});

describe("diff-detect — REMOVED child/module rollup", () => {
  const c2p = clause(
    "a-c2p",
    "CONTROLLER TO PROCESSOR SPECIFIC TERMS AND CONDITIONS",
    "These controller to processor specific terms and conditions form part of the agreement.",
    [],
    0
  );
  const heading = clause(
    "a-37",
    "3.7. International Data Transfers",
    "Transfers of Personal Data are subject to this section.",
    ["3", "3.7"],
    10
  );
  const child = clause(
    "a-374",
    "3.7. 4  Supplier agrees that Mastercard may have supplementary Personal Data transfer requirements",
    "Supplier agrees that Mastercard may have supplementary Personal Data transfer and localization requirements.",
    ["3", "3.7", "3.7.4"],
    12
  );
  const appendix = clause(
    "a-app2",
    "appendix 2 Region Specific Privacy Terms",
    "The following region specific privacy terms apply where indicated.",
    [],
    100
  );
  const japan = clause(
    "a-jp",
    "2. Japan Data Processing Addendum.  Where Mastercard conducts Processing in Japan",
    "Where Mastercard conducts, in Japan, Processing of Personal Data of data subjects in Japan the following terms apply.",
    ["2"],
    110
  );
  const sandwich = clause(
    "a-38",
    "3.8 Sub-processors",
    "Supplier shall not engage sub-processors without prior written authorisation from the controller.",
    ["3", "3.8"],
    20
  );
  const allA = [c2p, heading, child, sandwich, appendix, japan];
  const emptyB = new Map<string, ExtractedClause>();
  const mapA = new Map(allA.map((c) => [c.id, c]));

  function removedPair(clauseAId: string, seq: number) {
    return buildAlignedPair(ids(seq), {
      clauseAId,
      clauseBId: null,
      relationshipType: "REMOVED",
      matchConfidence: 0.84,
      alignmentMethod: "structural",
      alignmentReasons: ["absent instrument"],
    });
  }

  it("removed child under removed parent → non-material", () => {
    const parentPair = removedPair(heading.id, 0);
    const childPair = removedPair(child.id, 5);
    const rollup = collectRemovedRollupIds([parentPair, childPair], allA);
    assert.equal(rollup.has(child.id), true);
    assert.equal(rollup.has(heading.id), false);
    const result = tryDeterministic(childPair, mapA, emptyB, rollup);
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
    assert.equal(result.confidence, 0);
    assert.equal(result.semanticSummary, "covered by parent/module removal");
  });

  it("removed module heading → material REMOVED", () => {
    const appPair = removedPair(appendix.id, 0);
    const jpPair = removedPair(japan.id, 5);
    const rollup = collectRemovedRollupIds([appPair, jpPair], allA);
    assert.equal(rollup.has(appendix.id), false);
    assert.equal(rollup.has(japan.id), true);
    const result = tryDeterministic(appPair, mapA, emptyB, rollup);
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "REMOVED");
    assert.equal(result.detectionMethod, "identical");
  });

  it("standalone REMOVED clause → material REMOVED", () => {
    const pair = removedPair(sandwich.id, 0);
    const rollup = collectRemovedRollupIds([pair], allA);
    assert.equal(rollup.has(sandwich.id), false);
    const result = tryDeterministic(pair, mapA, emptyB, rollup);
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "REMOVED");
    assert.equal(result.detectionMethod, "identical");
  });
});

describe("diff-detect — changelog ADDED", () => {
  it("changelog ADDED → non-material", () => {
    const changelog = clause(
      "b-log",
      "3. 3 NEW - Removed Provisions (For Reference)",
      "The following original clauses are reproduced for reference only and are not operative terms.",
      ["3"],
      30
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: changelog.id,
      relationshipType: "ADDED",
      matchConfidence: 0.9,
      alignmentMethod: "structural",
      alignmentReasons: ["changelog / removed-provisions appendix"],
    });
    const result = tryDeterministic(
      pair,
      new Map(),
      new Map([[changelog.id, changelog]])
    );
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
    assert.equal(result.confidence, 0);
    assert.equal(result.semanticSummary, "administrative changelog content");
    assert.equal(pair.relationshipType, "ADDED");
  });

  it("ordinary NEW ADDED remains material", () => {
    const portal = clause(
      "b-portal",
      "5. NEW - Mandatory Data Subject Rights Portal",
      "Supplier shall build and maintain a dedicated Data Subject Rights Portal.",
      ["5"],
      40
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: portal.id,
      relationshipType: "ADDED",
      matchConfidence: 0.88,
      alignmentMethod: "structural",
      alignmentReasons: ["marked as new section"],
    });
    const result = tryDeterministic(
      pair,
      new Map(),
      new Map([[portal.id, portal]])
    );
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "ADDED");
    assert.equal(result.detectionMethod, "identical");
  });
});

describe("diff-detect — remaining administrative and fragment artifacts", () => {
  it("VERSION metadata → non-material", () => {
    const version = clause(
      "b-ver",
      "VERSION",
      "VERSION\nLast Updated: 13th August 2025 (Revised September 2026)\nVersion:",
      [],
      1
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: version.id,
      relationshipType: "ADDED",
      matchConfidence: 0.8,
      alignmentMethod: "structural",
      alignmentReasons: ["no counterpart"],
    });
    const result = tryDeterministic(pair, new Map(), new Map([[version.id, version]]));
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
    assert.equal(result.semanticSummary, "administrative changelog content");
  });

  it("REORGANIZATION changelog → non-material", () => {
    const reorg = clause(
      "b-reorg",
      "4. REORGANIZATION:",
      "Security obligations moved from Section 3.6 to Section 3.1 for priority emphasis. Indemnification separated from Liability section.",
      ["4"],
      40
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: reorg.id,
      relationshipType: "ADDED",
      matchConfidence: 0.8,
      alignmentMethod: "structural",
      alignmentReasons: ["no counterpart"],
    });
    const result = tryDeterministic(pair, new Map(), new Map([[reorg.id, reorg]]));
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
  });

  it("change-summary transition-period entry → non-material", () => {
    const tally = clause(
      "b-trans",
      "7. NEW TRANSITION PERIOD: 180 days for implementation of major new requirements",
      "7. NEW TRANSITION PERIOD: 180 days for implementation of major new requirements\nTOTAL CHANGES: 40+ substantive modifications perfect for testing comparison engines",
      ["7"],
      50
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: tally.id,
      relationshipType: "ADDED",
      matchConfidence: 0.88,
      alignmentMethod: "structural",
      alignmentReasons: ["marked as new section"],
    });
    const result = tryDeterministic(pair, new Map(), new Map([[tally.id, tally]]));
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
  });

  it("genuine NEW operative Transition clause remains material", () => {
    const operative = clause(
      "b-op",
      "7. NEW - Transition Period",
      "Supplier shall complete implementation of the security requirements within 180 days of the Effective Date.",
      ["7"],
      50
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: null,
      clauseBId: operative.id,
      relationshipType: "ADDED",
      matchConfidence: 0.88,
      alignmentMethod: "structural",
      alignmentReasons: ["marked as new section"],
    });
    const result = tryDeterministic(pair, new Map(), new Map([[operative.id, operative]]));
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "ADDED");
    assert.equal(result.detectionMethod, "identical");
  });

  it("extraction fragment under an already represented clause → non-material", () => {
    const parent = clause(
      "a-371",
      "3.7. 1  Supplier agrees and warrants that it will not transfer Personal Data or allow access to Personal Data from outside the",
      "Supplier agrees and warrants that it will not transfer Personal Data from outside the jurisdictions as listed under Annex 1 of Addendum A1 of the Agreement or otherwise authorized by Mastercard in writing in advance under the respective SOWs and if it obtains the explicit written consent of Mastercard and provided that the Personal Data are transferred to a jurisdiction which has been considered to provide an adequate level of protection under Privacy and Data Protection Law.",
      ["3", "3.7", "3.7.1"],
      10
    );
    const fragment = clause(
      "a-frag",
      "section 3 7.1 and if it obtains the explicit written consent of Mastercard and provided that the Personal Data are transferred",
      "section 3 7.1 and if it obtains the explicit written consent of Mastercard and provided that the Personal Data are transferred to a jurisdiction which has been considered to provide an adequate level of protection under Privacy and Data Protection Law.",
      ["3"],
      11
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: fragment.id,
      clauseBId: null,
      relationshipType: "REMOVED",
      matchConfidence: 0.84,
      alignmentMethod: "structural",
      alignmentReasons: ["no counterpart"],
    });
    const result = tryDeterministic(
      pair,
      new Map([
        [parent.id, parent],
        [fragment.id, fragment],
      ]),
      new Map(),
      new Set(),
      [parent]
    );
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
    assert.match(result.semanticSummary, /extraction fragment/i);
  });

  it("SCC/Annex extraction fragment already represented elsewhere → non-material", () => {
    const parent = clause(
      "a-3752",
      "3.7.5. 2  Where Supplier transfers Personal Data subject to the EU GDPR",
      "Where Supplier transfers Personal Data subject to the EU GDPR or the UK GDPR to a country that is not subject to a European Commission adequacy decision, the Parties agree that annex III of the EU SCCs is set out in Annex 1 of Addendum A1 of the Agreement or otherwise authorized by Mastercard in writing in advance under the respective SOWs.",
      ["3", "3.7", "3.7.5"],
      14
    );
    const fragment = clause(
      "a-scc",
      "annex III of the EU SCCs is set out in Annex 1 of Addendum A1 of the Agreement  or otherwise authorized by",
      "annex III of the EU SCCs is set out in Annex 1 of Addendum A1 of the Agreement  or otherwise authorized by Mastercard in writing in advance under the respective SOWs.",
      ["3"],
      15
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: fragment.id,
      clauseBId: null,
      relationshipType: "REMOVED",
      matchConfidence: 0.84,
      alignmentMethod: "structural",
      alignmentReasons: ["no counterpart"],
    });
    const result = tryDeterministic(
      pair,
      new Map([
        [parent.id, parent],
        [fragment.id, fragment],
      ]),
      new Map(),
      new Set(),
      [parent]
    );
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "UNCHANGED");
    assert.equal(result.detectionMethod, "fallback");
  });

  it("genuine Appendix 2 module REMOVED → still material", () => {
    const appendix = clause(
      "a-app2",
      "appendix 2 Region Specific Privacy Terms",
      "The following region specific privacy terms apply where indicated.",
      [],
      100
    );
    const pair = buildAlignedPair(ids(), {
      clauseAId: appendix.id,
      clauseBId: null,
      relationshipType: "REMOVED",
      matchConfidence: 0.84,
      alignmentMethod: "structural",
      alignmentReasons: ["absent instrument"],
    });
    const parent = clause(
      "a-371",
      "3.7. 1  Transfers",
      "Supplier shall not transfer Personal Data outside Europe except with consent.",
      ["3", "3.7"],
      10
    );
    const result = tryDeterministic(
      pair,
      new Map([
        [appendix.id, appendix],
        [parent.id, parent],
      ]),
      new Map(),
      new Set(),
      [parent]
    );
    assert.equal(isForwardToLlm(result), false);
    if (isForwardToLlm(result)) return;
    assert.equal(result.classification, "REMOVED");
    assert.equal(result.detectionMethod, "identical");
  });
});
