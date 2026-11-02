import test from "node:test";
import assert from "node:assert/strict";
import { parseCitationExpression } from "../extraction/citation-expression.js";
import { termInflections } from "../extraction/definitions.js";
import { buildSourceMap } from "../extraction/source-map.js";
import { repairStructuralDirectory } from "../extraction/structural-directory.js";
import { reconcileBoundaries } from "../extraction/reconcile-boundaries.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { detectReferences } from "../extraction/reference-detection.js";
import type { CandidateStructure } from "../extraction/structure-provider.js";

function makeDoclingDoc(lines: string[]) {
  return {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1, size: { width: 595, height: 842 } } },
    body: {
      self_ref: "#/body",
      children: lines.map((_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: lines.map((text, i) => ({
      self_ref: `#/texts/${i}`,
      text,
      label: "text",
      prov: [{
        page_no: 1,
        bbox: { l: 72, t: 100 + i * 20, r: 520, b: 115 + i * 20, coord_origin: "BOTTOMLEFT" },
      }],
    })),
  };
}

test("Layer 5: Universal citation parser resolves chapters, parts, and dotted-decimal sections", () => {
  const chCits = parseCitationExpression("The provisions of Chapter II and Chapter III shall not apply");
  assert.equal(chCits.length, 2);
  assert.deepEqual(chCits[0], { kind: "chapter", number: "ii", subpoints: [] });
  assert.deepEqual(chCits[1], { kind: "chapter", number: "iii", subpoints: [] });

  const decimalCits = parseCitationExpression("pursuant to Section 1798.100 and Section 1798.105(a)");
  assert.equal(decimalCits.length, 2);
  assert.deepEqual(decimalCits[0], { kind: "section", number: "1798.100", subpoints: [] });
  assert.deepEqual(decimalCits[1], { kind: "section", number: "1798.105", subpoints: ["a"] });

  const partCits = parseCitationExpression("under Part I and Part IV");
  assert.equal(partCits.length, 2);
  assert.deepEqual(partCits[0], { kind: "part", number: "i", subpoints: [] });
  assert.deepEqual(partCits[1], { kind: "part", number: "iv", subpoints: [] });
});

test("Layer 5: Defined term inflection generator handles irregulars, -y -> -ies, and regular plurals", () => {
  assert.deepEqual(termInflections("child"), ["child", "children"]);
  assert.deepEqual(termInflections("children"), ["children", "child"]);
  assert.deepEqual(termInflections("Data Fiduciary"), ["Data Fiduciary", "Data Fiduciaries"]);
  assert.deepEqual(termInflections("Data Principal"), ["Data Principal", "Data Principals"]);
  assert.deepEqual(termInflections("penalty"), ["penalty", "penalties"]);
});

test("Layer 5: Inflected defined terms link plural occurrences in substantive text back to singular definition", () => {
  const lines = [
    "CHAPTER I — PRELIMINARY",
    "2. In this Act, unless the context otherwise requires,—",
    "  (f) 'child' means an individual who has not completed the age of eighteen years;",
    "  (i) 'Data Fiduciary' means any person who determines the purpose and means of processing;",
    "CHAPTER II — OBLIGATIONS",
    "9. (3) A Data Fiduciary shall not undertake tracking or behavioural monitoring of children.",
    "  (4) The processing of personal data of a child by such classes of Data Fiduciaries as may be prescribed.",
  ];

  const map = buildSourceMap(makeDoclingDoc(lines), 1);
  const text = map.text;

  const ch1Idx = text.indexOf("CHAPTER I");
  const sec2Idx = text.indexOf("2. In this Act");
  const defFIdx = text.indexOf("(f) 'child'");
  const defIIdx = text.indexOf("(i) 'Data Fiduciary'");
  const ch2Idx = text.indexOf("CHAPTER II");
  const sec9Idx = text.indexOf("9. (3)");
  const sub4Idx = text.indexOf("(4) The processing");

  const candidate: CandidateStructure = {
    schemaVersion: 1,
    provider: "test",
    model: "test-model",
    promptVersion: "test",
    processingStrategy: "single_call",
    textHash: map.textHash,
    warnings: [],
    unresolvedItems: [],
    references: [],
    segments: [
      { id: "ch-1", kind: "container", type: "chapter", span: { start: ch1Idx, end: ch2Idx }, children: ["sec-2"] },
      { id: "sec-2", kind: "container", type: "section", parent: "ch-1", span: { start: sec2Idx, end: ch2Idx }, children: ["def-f", "def-i"] },
      { id: "def-f", kind: "unit", type: "definition", parent: "sec-2", span: { start: defFIdx, end: defIIdx }, children: [] },
      { id: "def-i", kind: "unit", type: "definition", parent: "sec-2", span: { start: defIIdx, end: ch2Idx }, children: [] },
      { id: "ch-2", kind: "container", type: "chapter", span: { start: ch2Idx, end: text.length }, children: ["sec-9"] },
      { id: "sec-9", kind: "container", type: "section", parent: "ch-2", span: { start: sec9Idx, end: text.length }, children: ["sub-3", "sub-4"] },
      { id: "sub-3", kind: "unit", type: "subsection", parent: "sec-9", span: { start: sec9Idx, end: sub4Idx }, children: [] },
      { id: "sub-4", kind: "unit", type: "subsection", parent: "sec-9", span: { start: sub4Idx, end: text.length }, children: [] },
    ],
  };

  const repaired = reconcileBoundaries(map, repairStructuralDirectory(map, candidate));
  const draft = reconstructSource(map, repaired, detectReferences(map, "test-version"));

  const sub3 = draft.provisions.find(p => p.candidateSegmentId === "sub-3");
  const sub4 = draft.provisions.find(p => p.candidateSegmentId === "sub-4");
  const defChild = draft.provisions.find(p => p.candidateSegmentId === "def-f");
  const defFid = draft.provisions.find(p => p.candidateSegmentId === "def-i");

  assert.ok(sub3, "Section 9(3) exists");
  assert.ok(sub4, "Section 9(4) exists");
  assert.ok(defChild, "Definition of child exists");
  assert.ok(defFid, "Definition of Data Fiduciary exists");

  // Verify "children" in 9(3) linked to Section 2(f) definition of child
  const childRel = draft.relationships.find(r => r.sourceProvisionId === sub3.id && r.targetProvisionIds.includes(defChild.id));
  assert.ok(childRel, "children in Section 9(3) must link to definition of child");
  assert.equal(childRel.relationType, "defined_term");

  // Verify "Data Fiduciaries" in 9(4) linked to Section 2(i) definition of Data Fiduciary
  const fidRel = draft.relationships.find(r => r.sourceProvisionId === sub4.id && r.targetProvisionIds.includes(defFid.id));
  assert.ok(fidRel, "Data Fiduciaries in Section 9(4) must link to definition of Data Fiduciary");
  assert.equal(fidRel.relationType, "defined_term");
});
