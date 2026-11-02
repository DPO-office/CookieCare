import test from "node:test";
import assert from "node:assert/strict";
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

test("Layer 4: clause-scoped explanation and following illustration attach to sibling clause, not subsection", () => {
  const lines = [
    "17. (1) The provisions of this Act shall not apply in respect of the processing of personal data when-",
    "  (a) necessary for enforcing any legal right or claim;",
    "  (f) by a court or tribunal or any other body in India;",
    "Explanation.- For the purposes of this clause, the expression 'court' includes a tribunal.",
    "Illustration.",
    "X, an individual, files a suit in a court.",
    "  (2) The provisions of sub-section (1) shall not apply.",
  ];

  const map = buildSourceMap(makeDoclingDoc(lines), 1);
  const text = map.text;

  const secIdx = text.indexOf("17. (1)");
  const ptAIdx = text.indexOf("(a) necessary");
  const ptFIdx = text.indexOf("(f) by a court");
  const explIdx = text.indexOf("Explanation.- For the purposes");
  const illIdx = text.indexOf("Illustration.");
  const sub2Idx = text.indexOf("(2) The provisions");

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
      {
        id: "sec-17",
        kind: "container",
        type: "section",
        span: { start: secIdx, end: text.length },
        children: ["sub-1", "sub-2"],
      },
      {
        id: "sub-1",
        kind: "unit",
        type: "subsection",
        parent: "sec-17",
        span: { start: secIdx, end: sub2Idx },
        children: ["item-a", "item-f", "expl-1", "ill-1"],
      },
      {
        id: "item-a",
        kind: "unit",
        type: "point",
        parent: "sub-1",
        span: { start: ptAIdx, end: ptFIdx },
        children: [],
      },
      {
        id: "item-f",
        kind: "unit",
        type: "point",
        parent: "sub-1",
        span: { start: ptFIdx, end: explIdx },
        children: [],
      },
      {
        id: "expl-1",
        kind: "unit",
        type: "explanation",
        parent: "sub-1",
        span: { start: explIdx, end: illIdx },
        children: [],
      },
      {
        id: "ill-1",
        kind: "unit",
        type: "illustration",
        parent: "sub-1",
        span: { start: illIdx, end: sub2Idx },
        children: [],
      },
      {
        id: "sub-2",
        kind: "unit",
        type: "subsection",
        parent: "sec-17",
        span: { start: sub2Idx, end: text.length },
        children: [],
      },
    ],
  };

  const repaired = reconcileBoundaries(map, repairStructuralDirectory(map, candidate));
  const draft = reconstructSource(map, repaired, detectReferences(map, "test-version"));

  const explProvision = draft.provisions.find(p => p.kind === "explanation");
  const illProvision = draft.provisions.find(p => p.kind === "illustration");
  const itemF = draft.provisions.find(p => p.canonicalCitation?.includes("(f)") || p.label?.includes("(f)"));

  assert.ok(explProvision, "Explanation provision should exist");
  assert.ok(illProvision, "Illustration provision should exist");
  assert.ok(itemF, "Clause (f) provision should exist");

  // Both the clause-scoped explanation and the following illustration must have item-f as parent
  assert.equal(explProvision.parentId, itemF.id, "Explanation must attach to clause (f)");
  assert.equal(illProvision.parentId, itemF.id, "Illustration must attach to clause (f)");
});

test("Layer 4: sandwich clause / shared consequence after list items is recovered as shared_text on parent subsection", () => {
  const lines = [
    "8. (3) A Data Fiduciary shall not retain personal data unless-",
    "  (a) the purpose for which such data was collected has been served; or",
    "  (b) retention is no longer necessary for legal or business purposes,",
    "and the Data Fiduciary shall erase personal data upon satisfaction of either condition.",
    "  (4) A Data Fiduciary shall protect personal data in its custody.",
  ];

  const map = buildSourceMap(makeDoclingDoc(lines), 1);
  const text = map.text;

  const secIdx = text.indexOf("8. (3)");
  const ptAIdx = text.indexOf("(a) the purpose");
  const ptBIdx = text.indexOf("(b) retention");
  const sandwichIdx = text.indexOf("and the Data Fiduciary shall erase");
  const sub4Idx = text.indexOf("(4) A Data Fiduciary");

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
      {
        id: "sec-8",
        kind: "container",
        type: "section",
        span: { start: secIdx, end: text.length },
        children: ["sub-3", "sub-4"],
      },
      {
        id: "sub-3",
        kind: "unit",
        type: "subsection",
        parent: "sec-8",
        span: { start: secIdx, end: sub4Idx },
        children: ["item-a", "item-b"], // Note: model omitted the sandwich clause or merged it into sub-3
      },
      {
        id: "item-a",
        kind: "unit",
        type: "point",
        parent: "sub-3",
        span: { start: ptAIdx, end: ptBIdx },
        children: [],
      },
      {
        id: "item-b",
        kind: "unit",
        type: "point",
        parent: "sub-3",
        span: { start: ptBIdx, end: sandwichIdx },
        children: [],
      },
      {
        id: "sub-4",
        kind: "unit",
        type: "subsection",
        parent: "sec-8",
        span: { start: sub4Idx, end: text.length },
        children: [],
      },
    ],
  };

  const repaired = reconcileBoundaries(map, repairStructuralDirectory(map, candidate));
  const draft = reconstructSource(map, repaired, detectReferences(map, "test-version"));

  const sharedProvision = draft.provisions.find(p => p.kind === "shared_text" || (p.label && /shared/i.test(p.label)));
  const sub3 = draft.provisions.find(p => p.canonicalCitation === "Section 8(3)" || p.label === "Section 8(3)");

  assert.ok(sharedProvision, "Sandwich clause should be recovered as shared_text");
  assert.ok(sub3, "Section 8(3) should exist");
  assert.equal(sharedProvision.parentId, sub3.id, "Sandwich clause parent should be subsection 8(3)");
  assert.match(sharedProvision.text, /and the Data Fiduciary shall erase/);
});
