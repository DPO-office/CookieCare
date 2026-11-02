import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";

test("Layer 1: 1-column mirrored odd/even margin notes, line numbers, and centered headings are zoned accurately", () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: {
      "1": { page_no: 1, size: { width: 595, height: 842 } },
      "2": { page_no: 2, size: { width: 595, height: 842 } },
    },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 12 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      // Page 1 top repeating header
      { self_ref: "#/texts/0", text: "OFFICIAL GAZETTE PART II — PAGE 1", label: "text",
        prov: [{ page_no: 1, bbox: { l: 150, t: 820, r: 445, b: 808, coord_origin: "BOTTOMLEFT" } }] },
      // Centered chapter heading (inside body x-band [117..479], must stay "main")
      { self_ref: "#/texts/1", text: "CHAPTER III", label: "section_header",
        prov: [{ page_no: 1, bbox: { l: 260, t: 750, r: 335, b: 735, coord_origin: "BOTTOMLEFT" } }] },
      // Wide body paragraphs on page 1
      { self_ref: "#/texts/2", text: "17. (1) The provisions of Chapter II shall not apply where processing of personal data is necessary for enforcing any legal right or claim.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 117, t: 700, r: 479, b: 640, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/3", text: "(2) The Central Government may notify exempted instrumentalities of the State in the interests of sovereignty and integrity.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 117, t: 620, r: 479, b: 560, coord_origin: "BOTTOMLEFT" } }] },
      // Right-margin side note on odd page 1 (l=486..532 > 479)
      { self_ref: "#/texts/4", text: "Exemptions.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 486, t: 695, r: 532, b: 682, coord_origin: "BOTTOMLEFT" } }] },
      // Left-margin line number on page 1 (r=52 < 117)
      { self_ref: "#/texts/5", text: "15", label: "text",
        prov: [{ page_no: 1, bbox: { l: 38, t: 620, r: 52, b: 610, coord_origin: "BOTTOMLEFT" } }] },

      // Page 2 top repeating header
      { self_ref: "#/texts/6", text: "OFFICIAL GAZETTE PART II — PAGE 2", label: "text",
        prov: [{ page_no: 2, bbox: { l: 150, t: 820, r: 445, b: 808, coord_origin: "BOTTOMLEFT" } }] },
      // Wide body paragraphs on even page 2
      { self_ref: "#/texts/7", text: "18. (1) With effect from such date as the Central Government may by notification appoint, there shall be established a Board.", label: "text",
        prov: [{ page_no: 2, bbox: { l: 117, t: 700, r: 479, b: 640, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/8", text: "(2) The Board shall be a body corporate having perpetual succession and a common seal with power to acquire property.", label: "text",
        prov: [{ page_no: 2, bbox: { l: 117, t: 620, r: 479, b: 560, coord_origin: "BOTTOMLEFT" } }] },
      // Left-margin side note on even page 2 (l=57..106 < 117)
      { self_ref: "#/texts/9", text: "Establishment of Board.", label: "text",
        prov: [{ page_no: 2, bbox: { l: 57, t: 695, r: 106, b: 675, coord_origin: "BOTTOMLEFT" } }] },
      // Left-margin statutory citation side note on page 2
      { self_ref: "#/texts/10", text: "31 of 2016.", label: "text",
        prov: [{ page_no: 2, bbox: { l: 57, t: 615, r: 101, b: 603, coord_origin: "BOTTOMLEFT" } }] },
      // Standalone bottom page number on page 2
      { self_ref: "#/texts/11", text: "2", label: "text",
        prov: [{ page_no: 2, bbox: { l: 292, t: 45, r: 303, b: 32, coord_origin: "BOTTOMLEFT" } }] },
    ],
  };

  const map = buildSourceMap(raw, 2);
  assert.equal(map.spans[0]?.layoutZone, "running_header");
  assert.equal(map.spans[1]?.layoutZone, "main", "centered chapter heading inside body x-band stays main");
  assert.equal(map.spans[2]?.layoutZone, "main");
  assert.equal(map.spans[3]?.layoutZone, "main");
  assert.equal(map.spans[4]?.layoutZone, "margin_note", "odd-page right margin side note detected");
  assert.equal(map.spans[5]?.layoutZone, "line_number", "outer gutter integer detected as line_number");
  assert.equal(map.spans[6]?.layoutZone, "running_header");
  assert.equal(map.spans[7]?.layoutZone, "main");
  assert.equal(map.spans[8]?.layoutZone, "main");
  assert.equal(map.spans[9]?.layoutZone, "margin_note", "even-page mirrored left margin side note detected");
  assert.equal(map.spans[10]?.layoutZone, "margin_note", "marginal act year note detected");
  assert.equal(map.spans[11]?.layoutZone, "running_footer", "bottom page number detected");

  // Simulate an upstream model that mistakenly created bogus segments from margin notes and included trailing margin notes
  const sec17Span = { start: map.spans[2]!.start, end: map.spans[5]!.end };
  const bogusMarginSeg = { start: map.spans[4]!.start, end: map.spans[4]!.end };
  const sec18Span = { start: map.spans[7]!.start, end: map.spans[10]!.end };
  const chapSpan = { start: map.spans[1]!.start, end: map.spans[10]!.end };

  const candidate: CandidateStructure = {
    schemaVersion: 1,
    textHash: map.textHash,
    provider: "llm",
    model: "glm-5.3",
    promptVersion: "test",
    processingStrategy: "chunked",
    segments: [
      { id: "chap3", kind: "container", type: "chapter", category: null, parent: null, children: [],
        span: chapSpan, code: { start: chapSpan.start, end: map.spans[1]!.end }, title: null,
        sourceSpans: sourceLocations(map, chapSpan) },
      { id: "sec17", kind: "container", type: "section", category: null, parent: "chap3", children: [],
        span: sec17Span, code: null, title: null, sourceSpans: sourceLocations(map, sec17Span) },
      { id: "bogus_exemptions", kind: "container", type: "section", category: null, parent: "chap3", children: [],
        span: bogusMarginSeg, code: null, title: bogusMarginSeg, sourceSpans: sourceLocations(map, bogusMarginSeg) },
      { id: "sec18", kind: "container", type: "section", category: null, parent: "chap3", children: [],
        span: sec18Span, code: null, title: null, sourceSpans: sourceLocations(map, sec18Span) },
    ],
    references: [],
    unresolvedItems: [],
    warnings: [],
  };

  const draft = reconstructSource(map, candidate, detectReferences(map, "v1"));
  assert.equal(draft.provisions.some(p => p.text === "Exemptions."), false, "bogus margin-note provision is dropped");
  assert.equal(draft.unresolvedText.length, 0, "margin notes and headers do not trigger unresolvedText");

  const sec17 = draft.provisions.find(p => p.canonicalCitation === "Section 17");
  const sec18 = draft.provisions.find(p => p.canonicalCitation === "Section 18");
  assert.ok(sec17);
  assert.ok(sec18);
  assert.equal(sec17.text.includes("Exemptions."), false, "trailing margin note trimmed off Section 17");
  assert.deepEqual(sec17.marginalNotes, ["Exemptions."]);
  assert.deepEqual(sec18.marginalNotes, ["Establishment of Board.", "31 of 2016."]);

  const validation = validateReconstruction("v1", map, draft);
  assert.equal(validation.issues.filter(i => i.code === "unclassified_text").length, 0);
});

test("Layer 1: 2-column EU Official Journal layout keeps both columns as main with columnIndex 0 and 1", () => {
  const raw = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: {
      "1": { page_no: 1, size: { width: 595, height: 842 } },
    },
    body: {
      self_ref: "#/body",
      children: Array.from({ length: 8 }, (_, i) => ({ $ref: `#/texts/${i}` })),
    },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      // Full-width spanning title
      { self_ref: "#/texts/0", text: "REGULATION (EU) 2016/679 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL", label: "section_header",
        prov: [{ page_no: 1, bbox: { l: 80, t: 780, r: 515, b: 755, coord_origin: "BOTTOMLEFT" } }] },
      // Left column recitals (x = 48..285)
      { self_ref: "#/texts/1", text: "(1) The protection of natural persons in relation to the processing of personal data is a fundamental right.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 48, t: 720, r: 285, b: 670, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/2", text: "(2) The principles of, and rules on the protection of natural persons with regard to the processing of their personal data should respect fundamental rights.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 48, t: 660, r: 285, b: 600, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/3", text: "(3) Directive 95/46/EC of the European Parliament seeks to harmonise the protection of fundamental rights.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 48, t: 590, r: 285, b: 530, coord_origin: "BOTTOMLEFT" } }] },
      // Right column recitals (x = 310..547)
      { self_ref: "#/texts/4", text: "(4) The processing of personal data should be designed to serve mankind and must be considered in relation to its function in society.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 310, t: 720, r: 547, b: 670, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/5", text: "(5) The economic and social integration resulting from the functioning of the internal market has led to a substantial increase in cross-border flows.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 310, t: 660, r: 547, b: 600, coord_origin: "BOTTOMLEFT" } }] },
      { self_ref: "#/texts/6", text: "(6) Rapid technological developments and globalisation have brought new challenges for the protection of personal data.", label: "text",
        prov: [{ page_no: 1, bbox: { l: 310, t: 590, r: 547, b: 530, coord_origin: "BOTTOMLEFT" } }] },
      // Outer far-left margin note outside col 0 (x = 12..36 < 48)
      { self_ref: "#/texts/7", text: "L 119/1", label: "text",
        prov: [{ page_no: 1, bbox: { l: 12, t: 720, r: 36, b: 710, coord_origin: "BOTTOMLEFT" } }] },
    ],
  };

  const map = buildSourceMap(raw, 1);
  assert.equal(map.spans[0]?.layoutZone, "main");
  assert.equal(map.spans[1]?.layoutZone, "main");
  assert.equal(map.spans[1]?.columnIndex, 0);
  assert.equal(map.spans[2]?.columnIndex, 0);
  assert.equal(map.spans[3]?.columnIndex, 0);
  assert.equal(map.spans[4]?.layoutZone, "main");
  assert.equal(map.spans[4]?.columnIndex, 1);
  assert.equal(map.spans[5]?.columnIndex, 1);
  assert.equal(map.spans[6]?.columnIndex, 1);
  assert.equal(map.spans[7]?.layoutZone, "margin_note");
});

