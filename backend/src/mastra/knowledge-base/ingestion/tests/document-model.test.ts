import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildDocumentModel } from "../extraction/document-model.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import type { SourceMap } from "../extraction/source-map.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";

function range(text: string, quote: string, occurrence = 0) {
  let start = -1, from = 0;
  for (let i = 0; i <= occurrence; i++) { start = text.indexOf(quote, from); from = start + quote.length; }
  if (start < 0) throw new Error(`Missing fixture quote: ${quote}`);
  return { start, end: start + quote.length };
}

test("document model preserves all nine structural risk categories across chunk reconstruction", () => {
  const text = [
    "CHAPTER I", "Rule 8 refers to Third Schedule and Act 2020.",
    "(1) A covered controller must keep records.", "Third Schedule", "controller", "Meaning", "person",
    "Recital covered controller records safeguards", "Custom explanatory material",
  ].join("\n");
  const chapter = range(text, "CHAPTER I"), rule = range(text, "Rule 8 refers to Third Schedule and Act 2020."),
    child = range(text, "(1) A covered controller must keep records."), schedule = range(text, "Third Schedule"),
    controller = range(text, "controller", 1), meaning = range(text, "Meaning"), person = range(text, "person"),
    recital = range(text, "Recital covered controller records safeguards"), unknown = range(text, "Custom explanatory material");
  const baseSpan = (span: { start: number; end: number }, itemRef: string, page: number) => ({ ...span,
    itemRef, page, provenance: [{ page_no: page }], kind: "text" as const, blockType: "paragraph",
    extractionWarnings: [] as string[] });
  const map: SourceMap = { schemaVersion: 1, text,
    textHash: createHash("sha256").update(text).digest("hex"),
    spans: [baseSpan(chapter, "chapter", 1), baseSpan(rule, "rule", 1), baseSpan(child, "child", 2),
      baseSpan(schedule, "schedule", 2),
      { ...baseSpan(controller, "table", 2), kind: "table_cell", blockType: "table_cell",
        row: 0, column: 0, rowSpan: 1, columnSpan: 1, isHeader: true },
      { ...baseSpan(meaning, "table", 2), kind: "table_cell", blockType: "table_cell",
        row: 0, column: 1, rowSpan: 1, columnSpan: 1, isHeader: true },
      { ...baseSpan(person, "table", 3), kind: "table_cell", blockType: "table_cell",
        row: 1, column: 1, rowSpan: 1, columnSpan: 1, isHeader: false,
        extractionWarnings: ["uncertain_merged_cell"] },
      baseSpan(recital, "recital", 3), baseSpan(unknown, "custom", 3)],
    pages: [{ physicalPage: 1, printedPageLabel: null, width: 1, height: 1, itemCount: 2, status: "mapped" },
      { physicalPage: 2, printedPageLabel: null, width: 1, height: 1, itemCount: 3, status: "mapped" },
      { physicalPage: 3, printedPageLabel: null, width: 1, height: 1, itemCount: 3, status: "mapped" },
      { physicalPage: 4, printedPageLabel: null, width: 1, height: 1, itemCount: 0, status: "missing" }],
    warnings: ["No mapped text on physical page 4"], status: "needs_review" };
  const segment = (id: string, type: string, span: { start: number; end: number }, parent: string | null,
    extras: Partial<CandidateStructure["segments"][number]> = {}) => ({ id, kind: "unit", type,
      category: "main", parent, children: [], span, code: null, title: span,
      sourceSpans: sourceLocations(map, span), ...extras });
  const candidate: CandidateStructure = { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: "test",
    promptVersion: "test", processingStrategy: "chunks", segments: [
      segment("chapter", "chapter", { start: chapter.start, end: child.end }, null),
      segment("rule", "rule", rule, "chapter"),
      segment("child", "paragraph", child, "rule", { startsBeforeChunk: true }),
      segment("schedule", "schedule", { start: schedule.start, end: person.end }, null),
      segment("definition", "definition", person, "schedule"),
      segment("recital", "recital", recital, null), segment("unknown", "regulatory_note", unknown, null),
    ], references: [
      { ...range(text, "Third Schedule", 0), exactMention: "Third Schedule", targetSegmentIds: ["schedule"],
        targetHint: "Third Schedule", resolutionStatus: "resolved", sourceSpans: sourceLocations(map, range(text, "Third Schedule", 0)) },
      { ...controller, exactMention: "controller", targetSegmentIds: ["definition"], targetHint: "controller",
        resolutionStatus: "resolved", sourceSpans: sourceLocations(map, controller) },
    ], unresolvedItems: [], warnings: [] };
  const draft = reconstructSource(map, candidate, detectReferences(map, "gdpr-v1"));
  const document = buildDocumentModel(map, draft, 10_000);
  assert.ok(draft.provisions.some(provision => provision.kind === "unknown" && provision.status === "needs_review"));
  assert.equal(draft.provisions.find(provision => provision.candidateSegmentId === "child")?.boundaryStatus, "cross_chunk");
  assert.ok(draft.provisions.find(provision => provision.candidateSegmentId === "child")!.inheritedParentIds.length >= 2);
  assert.ok(document.relationships.some(relation => relation.exactMention === "Third Schedule" &&
    relation.detectedBy.includes("model") && relation.detectedBy.includes("source_detector") && relation.status === "proposed"));
  const ruleId = draft.provisions.find(provision => provision.candidateSegmentId === "rule")!.id;
  const definitionId = draft.provisions.find(provision => provision.candidateSegmentId === "definition")!.id;
  assert.ok(document.contextManifests.find(manifest => manifest.targetProvisionId === ruleId)!
    .includedProvisionIds.includes(definitionId));
  assert.deepEqual(document.tables[0]?.headerCells.map(cell => cell.text), ["controller", "Meaning"]);
  assert.equal(document.tables[0]?.continuationStatus, "continued");
  assert.equal(document.definitionScopes[0]?.scopeStatus, "structural_parent");
  assert.ok(document.inferredLinkCandidates.length > 0);
  assert.ok(document.relationships.some(relation => relation.status === "external_unavailable" &&
    relation.externalTarget?.versionStatus === "unresolved"));
  assert.ok(document.sourceQualityIssues.some(issue => issue.code === "missing_or_empty_page"));
  assert.ok(document.sourceQualityIssues.some(issue => issue.code === "uncertain_merged_cell"));
  const report = validateReconstruction("gdpr-v1", map, draft, document);
  assert.equal(report.status, "needs_review");
  assert.ok(report.issues.some(issue => issue.code === "unknown_structure"));
  assert.ok(report.issues.some(issue => issue.code === "unavailable_external_source"));
  assert.ok(report.issues.some(issue => issue.code === "damaged_table"));
});

test("document directory resolves relative and ranged references without collapsing their targets", () => {
  const text = "Article 12\n(1) See paragraph 2 of this Article and Articles 12–13.\n(2) Target.\nArticle 13\nBody.";
  const article12Label = range(text, "Article 12"), paragraph1 = range(text, "(1) See paragraph 2 of this Article and Articles 12–13."),
    paragraph2 = range(text, "(2) Target."), article13Label = range(text, "Article 13");
  const map: SourceMap = { schemaVersion: 1, text, textHash: createHash("sha256").update(text).digest("hex"),
    spans: [{ start: 0, end: text.length, itemRef: "doc", page: 1, provenance: [{ page_no: 1 }],
      kind: "text", blockType: "paragraph", extractionWarnings: [] }],
    pages: [{ physicalPage: 1, printedPageLabel: null, width: 1, height: 1, itemCount: 1, status: "mapped" }],
    warnings: [], status: "mapped" };
  const segment = (id: string, type: string, span: { start: number; end: number }, title: { start: number; end: number },
    parent: string | null) => ({ id, kind: "unit", type, category: "main", parent, children: [], span,
      code: title, title, sourceSpans: sourceLocations(map, span) });
  const candidate: CandidateStructure = { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: "test",
    promptVersion: "test", processingStrategy: "chunks", segments: [
      segment("a12", "article", { start: article12Label.start, end: paragraph2.end }, article12Label, null),
      segment("p1", "paragraph", paragraph1, { start: paragraph1.start, end: paragraph1.start + 3 }, "a12"),
      segment("p2", "paragraph", paragraph2, { start: paragraph2.start, end: paragraph2.start + 3 }, "a12"),
      segment("a13", "article", { start: article13Label.start, end: text.length }, article13Label, null),
    ], references: [], unresolvedItems: [], warnings: [] };
  const draft = reconstructSource(map, candidate, detectReferences(map, "version"));
  const p2 = draft.provisions.find(provision => provision.candidateSegmentId === "p2")!;
  const relative = draft.relationships.find(relation => relation.exactMention.startsWith("paragraph 2"))!;
  assert.equal(relative.status, "proposed");
  assert.deepEqual(relative.targetProvisionIds, [p2.id]);
  const ranged = draft.relationships.find(relation => relation.rangeTarget)!;
  assert.equal(ranged.rangeTarget?.complete, true);
  assert.equal(ranged.targetProvisionIds.length, 2);
  assert.equal(ranged.targetProvisionId, null);
});
