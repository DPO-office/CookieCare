import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { sourceLocations, resolveStructureProviderConfig, type CandidateStructure, type StructureChunkCheckpoint } from "../extraction/structure-provider.js";
import { LlmStructureProvider, uncoveredCoreUnits } from "../extraction/llm-structure.js";
import { materialize, structureSourceUnits } from "../extraction/structure-chunk-plan.js";
import { repairStructuralDirectory } from "../extraction/structural-directory.js";
import { reconcileBoundaries } from "../extraction/reconcile-boundaries.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { collectDefinitions } from "../extraction/definitions.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";
import { enrichSemanticRelationships } from "../extraction/semantic-relationships.js";
import { deterministicGraphCheck, focusGraphJudgeInput, referenceTypeCompatible } from "../evaluation/focused-graph-judge.js";
import type { JudgeInput } from "../evaluation/review-dataset.js";

function source(texts: string[]) {
  return buildSourceMap({ body: { self_ref: "#/body", children: texts.map((_, i) => ({ $ref: `#/texts/${i}` })) },
    pages: Object.fromEntries(texts.map((_, i) => [i + 1, {}])),
    texts: texts.map((text, i) => ({ self_ref: `#/texts/${i}`, text, label: "paragraph", prov: [{ page_no: i + 1 }] })) }, texts.length);
}
function candidate(map: ReturnType<typeof source>): CandidateStructure {
  return { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: "test", promptVersion: "test",
    processingStrategy: "test", references: [], unresolvedItems: [], warnings: [],
    segments: map.spans.map((span, i) => ({ id: `s${i}`, kind: "unit", type: "section", category: "main",
      parent: null, children: [], span: { start: span.start, end: span.end }, code: null, title: null,
      sourceSpans: sourceLocations(map, span) })) };
}
function resultFor(prompt: string) {
  const units = JSON.parse(prompt).sourceUnits as string[][];
  return { segments: units.filter(unit => unit[1] === "c").map((unit, i) => ({ id: `n${i}`,
    kind: "unit", type: "paragraph", category: "main", parent: null,
    sourceAnchors: [{ sourceId: unit[0], exactQuote: unit[2], occurrence: 0 }], codeAnchor: null, titleAnchor: null })),
    references: [], warnings: [], unresolvedItems: [] };
}

test("every sibling receives an attempt even when split tree needs more than seven calls", async () => {
  const map = source(Array.from({ length: 10 }, (_, i) => `Paragraph ${i} has source wording.`));
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  const visited: string[] = [];
  const provider = new LlmStructureProvider(configuration, { async generate(request) {
    const core = JSON.parse(request.prompt).sourceUnits.filter((u: string[]) => u[1] === "c");
    if (core.length > 1) return { output: {}, rawResponse: {}, usage: null, finishReason: "length" };
    visited.push(core[0][0]);
    return { output: resultFor(request.prompt), rawResponse: {}, usage: null };
  } });
  const result = await provider.extract({ configuration, canonicalText: map.text, textHash: map.textHash, sourceMap: map });
  assert.equal(new Set(visited).size, 10);
  assert.equal(result.candidate.segments.length, 10);
  assert.ok((result.rawResponse as any).attempts.length > 7);
});

test("coverage unions smaller spans and independently detects missing numbered list structure", () => {
  const map = source(["First sentence. Second sentence."]);
  const value = candidate(map), end = map.text.indexOf("Second");
  value.segments = [{ ...value.segments[0]!, span: { start: 0, end } },
    { ...value.segments[0]!, id: "second", span: { start: end, end: map.text.length } }];
  const chunk = materialize(map, "test", structureSourceUnits(map), [], [], 0);
  assert.deepEqual(uncoveredCoreUnits(map, chunk, value), []);
  const numbered = source(["17. (1) First condition.\n(a) Alpha.\n(b) Beta."]);
  const broad = candidate(numbered);
  assert.deepEqual(uncoveredCoreUnits(numbered, materialize(numbered, "test", structureSourceUnits(numbered), [], [], 0), broad), ["src:0"]);
});

test("partial extraction is kept and only missing source units are retried", async () => {
  const map = source(["Alpha complete.", "Beta missing.", "Gamma complete."]);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  const requests: string[][] = [], checkpoints: StructureChunkCheckpoint[] = [];
  const provider = new LlmStructureProvider(configuration, { async generate(request) {
    const output = resultFor(request.prompt);
    const core = JSON.parse(request.prompt).sourceUnits.filter((u: string[]) => u[1] === "c");
    requests.push(core.map((u: string[]) => u[0]));
    if (requests.length === 1) output.segments.splice(1, 1);
    return { output, rawResponse: output, usage: null };
  } });
  const result = await provider.extract({ configuration, canonicalText: map.text, textHash: map.textHash, sourceMap: map,
    checkpoints: { savePlan: async () => {}, loadChunk: async () => null, saveChunk: async checkpoint => { checkpoints.push(checkpoint); } } });
  assert.deepEqual(requests, [["src:0", "src:1", "src:2"], ["src:1"]]);
  assert.equal(result.candidate.segments.length, 3);
  assert.ok(checkpoints.some(c => c.incomplete && c.missingSourceIds?.includes("src:1")));
});

test("source directory repairs sec_9 parent across requests without absorbing next section", () => {
  const map = source(["9. Children", "(2) A duty.", "10. Next section."]);
  const value = candidate(map);
  value.segments[1]!.type = "subsection"; value.segments[1]!.parentHint = "sec_9";
  const fixed = repairStructuralDirectory(map, value);
  assert.equal(fixed.segments[1]!.parent, "s0");
  assert.equal(fixed.segments[0]!.span.end, map.spans[1]!.end);
  assert.equal(fixed.segments[2]!.parent, null);
});

test("an already parented subsection extends a truncated section before the next section", () => {
  const map = source(["9. (1) First duty.", "(2) Second duty.", "10. Next section."]);
  const value = candidate(map);
  value.segments[1]!.type = "subsection";
  value.segments[1]!.parent = "s0";
  const fixed = repairStructuralDirectory(map, value);
  assert.equal(fixed.segments[0]!.span.end, map.spans[1]!.end);
  assert.equal(fixed.segments[0]!.span.end < map.spans[2]!.start, true);
});

test("8. (1) is subsection 1 and bare section type follows observed document convention", () => {
  const map = source(["8. Duties", "8. (1) First duty.", "9. Other", "10. Other", "11. Other", "12. Other"]);
  const value = candidate(map);
  value.segments[1]!.type = "subsection"; value.segments[1]!.parent = "s0";
  value.segments[0]!.span.end = map.spans[1]!.end;
  value.segments[5]!.type = "article";
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  assert.equal(draft.provisions.find(p => p.candidateSegmentId === "s1")?.canonicalCitation, "Section 8(1)");
  assert.equal(draft.provisions.find(p => p.candidateSegmentId === "s5")?.canonicalCitation, "Section 12");
  assert.ok(draft.warnings.some(w => w.includes("structure_type_corrected")));
});

test("explicit unlabelled cross-page continuation merges but a new numbered subsection stays separate", () => {
  const map = source(["Rule 8 delete records after", "the period expires.", "(2) Keep an audit log."]);
  const value = candidate(map);
  value.segments.forEach(s => { s.type = "rule"; });
  value.segments[0]!.code = { start: 0, end: 6 }; value.segments[0]!.continuesAfterChunk = true;
  value.segments[1]!.startsBeforeChunk = true;
  const fixed = reconcileBoundaries(map, value);
  assert.equal(fixed.segments.length, 2);
  assert.deepEqual(fixed.segments[0]!.sourceSpans.map(s => s.physicalPage), [1, 2]);
  const numbered = candidate(source(["Rule 8 first", "(2) Second"]));
  numbered.segments[0]!.code = { start: 0, end: 6 }; numbered.segments[0]!.continuesAfterChunk = true;
  numbered.segments[1]!.startsBeforeChunk = true;
  assert.equal(reconcileBoundaries(source(["Rule 8 first", "(2) Second"]), numbered).segments.length, 2);
});

test("table-row aliases produce one canonical row owner with references attached", () => {
  const map = source(["Schedule", "1", "Breach of section 8", "Penalty", "8. Duty."]);
  for (const [i, span] of map.spans.entries()) if (i > 0 && i < 4) Object.assign(span,
    { kind: "table_cell", blockType: "table_cell", itemRef: "#/tables/0", row: 1, column: i - 1 });
  map.spans[0]!.parentRef = "#/tables/0";
  const value = candidate(map);
  value.segments = [value.segments[0]!, value.segments[1]!, value.segments[4]!];
  value.segments[0]!.type = "schedule";
  value.segments[1]!.type = "table-row"; value.segments[1]!.span.end = map.spans[3]!.end;
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  const rows = draft.provisions.filter(p => p.kind === "table_row");
  assert.equal(draft.provisions.find(p => p.kind === "schedule")?.canonicalCitation, "The Schedule");
  assert.equal(rows.length, 1);
  assert.equal(draft.provisions.filter(p => p.start === rows[0]!.start && p.end === rows[0]!.end).length, 1);
  assert.equal(draft.relationships.find(r => r.exactMention.toLowerCase() === "section 8")?.sourceProvisionId, rows[0]!.id);
});

test("definitions classified as points link sibling uses within their scope", () => {
  const map = source(["4. For the purposes of this section,", '(a) "record" means an audit entry.', "(b) Keep a record.", "5. Keep a record."]);
  const value = candidate(map);
  value.segments[0]!.span.end = map.spans[2]!.end;
  for (const i of [1, 2]) { value.segments[i]!.type = "point"; value.segments[i]!.parent = "s0"; }
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  assert.equal(collectDefinitions(draft.provisions).length, 1);
  const links = draft.relationships.filter(r => r.relationType === "defined_term");
  assert.equal(links.length, 1);
  assert.equal(draft.provisions.find(p => p.id === links[0]!.sourceProvisionId)?.candidateSegmentId, "s2");
});

test("bare paragraph lists resolve to siblings in their own article", () => {
  const map = source(["Article 9. Requirements.", "(1) First duty.", "(3) Third duty.",
    "(4) Paragraphs (1) and (3) apply subject to conditions.", "Article 10. Next."]);
  const value = candidate(map);
  value.segments[0]!.type = "article";
  value.segments[0]!.span.end = map.spans[3]!.end;
  for (const index of [1, 2, 3]) {
    value.segments[index]!.type = "paragraph";
    value.segments[index]!.parent = "s0";
  }
  value.segments[4]!.type = "article";
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  const byId = new Map(draft.provisions.map(p => [p.id, p]));
  const owner = draft.provisions.find(p => p.canonicalCitation === "Article 9(4)");
  const links = draft.relationships.filter(r => r.sourceProvisionId === owner?.id &&
    r.exactMention.toLowerCase() === "paragraphs (1) and (3)");
  assert.deepEqual(links.map(r => byId.get(r.targetProvisionId!)?.canonicalCitation).sort(),
    ["Article 9(1)", "Article 9(3)"]);
  assert.ok(links.every(r => r.status === "proposed" && r.relationType === "explicit_relative_reference"));
});

test("numbered definitions keep document scope across a truncated section span", () => {
  const map = source(["2. In this Act, unless the context otherwise requires,-",
    "(f) 'child' means an individual under eighteen years;",
    "(u) 'personal data breach' means unauthorised disclosure;",
    "3. Application of Act.", "9. A child and a personal data breach are addressed here."]);
  const value = candidate(map);
  value.segments[1]!.type = "definition";
  value.segments[2]!.type = "definition";
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  const byId = new Map(draft.provisions.map(p => [p.id, p]));
  const definitions = collectDefinitions(draft.provisions);
  assert.deepEqual(definitions.map(d => ({ term: d.term, scope: d.scopeStatus,
    citation: byId.get(d.provisionId)?.canonicalCitation })), [
    { term: "child", scope: "document", citation: "Section 2(f)" },
    { term: "personal data breach", scope: "document", citation: "Section 2(u)" },
  ]);
  const use = draft.provisions.find(p => p.canonicalCitation === "Section 9");
  assert.deepEqual(draft.relationships.filter(r => r.sourceProvisionId === use?.id &&
    r.relationType === "defined_term").map(r => byId.get(r.targetProvisionId!)?.canonicalCitation).sort(),
    ["Section 2(f)", "Section 2(u)"]);
});

test("semantic checks send full targets, retry individual failures and reuse input-bound decisions", async () => {
  const map = source(["1. Subject to section 2, comply.", "2. " + "Target wording. ".repeat(180)]);
  const draft = reconstructSource(map, candidate(map), detectReferences(map, "test"));
  const saved = new Map<string, unknown>(); let calls = 0;
  const client = { model: "test", async decide(request: any) {
    calls++;
    assert.ok(request.references[0].targetText.length > 2000);
    if (calls === 1) throw new Error("truncated JSON");
    return { links: [{ relationId: request.references[0].relationId, kind: "depends_on",
      role: "condition_".repeat(12),
      evidenceQuote: request.sourceText }], issues: [] };
  } };
  const progress = { load: async (key: string) => saved.get(key) ?? null,
    save: async (key: string, value: unknown) => { saved.set(key, value); } };
  const first = await enrichSemanticRelationships(map, draft, client, 10, progress);
  assert.equal(first.report.links.length, 1); assert.equal(calls, 2);
  assert.equal(first.report.links[0]!.role.length, 120);
  const second = await enrichSemanticRelationships(map, draft, client, 10, progress);
  assert.equal(second.report.modelCalls, 0); assert.equal(calls, 2);
  assert.ok(second.draft.relationships[0]!.referenceType);
});

test("page checks retain first-line and physical-page evidence; explicit subtype compatibility is directional", () => {
  const expected = { section: 13, physical_page: 10, first_line_exact_text: "13. Right to correction." };
  const input: JudgeInput = { caseId: "page", method: "test", grading: {}, evaluationScope: null,
    expected: { "section-start:13": expected }, forbidden: [], source: [], evidence: [{ ref: "graph#", value: {
      provisions: [{ id: "13", kind: "section", text: "13. Right to correction.", sourceRanges: [{ page: 10 }] }], relationships: [] } }] };
  const focused = focusGraphJudgeInput(input, "section-start:13", expected);
  assert.equal((focused.evidence[0]!.value as any).detailedProvisions[0].id, "13");
  assert.equal(deterministicGraphCheck(input, "section-start:13", expected)?.verdict, "pass");
  assert.equal(referenceTypeCompatible("explicit_reference", "explicit_relative_reference"), true);
  assert.equal(referenceTypeCompatible("explicit_relative_reference", "explicit_reference"), false);
  assert.equal(referenceTypeCompatible("penalty_for", "explicit_reference"), false);
  const relative: JudgeInput = { ...input, evidence: [{ ref: "graph#", value: {
    relationships: [{ sourceLabel: "Section 8(8)", targetLabels: ["Section 8(7)(a)"],
      referenceType: "explicit_relative_reference", relationType: "depends_on", status: "proposed",
      exactMention: "clause ( a ) of sub-section ( 7" }] } }] };
  assert.equal(deterministicGraphCheck(relative, "edge:Section 8(8) -> Section 8(7)(a)", {
    from: "Section 8(8)", to: "Section 8(7)(a)", relation: "explicit_reference",
    source_words: "clause (a) of sub-section (7)",
    explanation: "A valid relative citation to the same provision.",
  })?.verdict, "pass");
  const contextual: JudgeInput = { ...input, evidence: [{ ref: "graph#", value: {
    relationships: [{ sourceLabel: "Section 8(11)", targetLabels: ["Section 8"],
      referenceType: "explicit_relative_reference", relationType: "defines", status: "proposed",
      exactMention: "For the purposes of this section" }] } }] };
  assert.equal(deterministicGraphCheck(contextual, "edge:Section 8(11) -> Section 8", {
    from: "Section 8(11)", to: "Section 8", relation: "explicit_relative_reference",
    source_words: "this section",
  })?.verdict, "pass");
});

test("resume reuses partial grounded extraction and retries only its pending unit", async () => {
  const map = source(["Alpha complete.", "Beta initially fails.", "Gamma complete."]);
  const configuration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm" });
  const cache = new Map<string, StructureChunkCheckpoint>(); let phase = 1;
  const requests: string[][] = [];
  const provider = new LlmStructureProvider(configuration, { async generate(request) {
    const core = JSON.parse(request.prompt).sourceUnits.filter((u: string[]) => u[1] === "c");
    requests.push(core.map((u: string[]) => u[0]));
    const output = resultFor(request.prompt);
    if (phase === 1 && core.length > 1) output.segments.splice(1, 1);
    else if (phase === 1) return { output: {}, rawResponse: {}, usage: null, finishReason: "length" };
    return { output, rawResponse: output, usage: null };
  } });
  const input = { configuration, canonicalText: map.text, textHash: map.textHash, sourceMap: map,
    checkpoints: { savePlan: async () => {}, loadChunk: async (chunk: any) => cache.get(chunk.inputHash) ?? null,
      saveChunk: async (checkpoint: StructureChunkCheckpoint) => { cache.set(checkpoint.chunk.inputHash, checkpoint); } } };
  const first = await provider.extract(input);
  assert.ok(first.candidate.unresolvedItems.length);
  phase = 2; requests.length = 0;
  const resumed = await provider.extract(input);
  assert.deepEqual(requests, [["src:1"]]);
  assert.equal(resumed.candidate.segments.length, 3);
  assert.equal(resumed.candidate.unresolvedItems.length, 0);
});

test("same term in two sections resolves to the local definition", () => {
  const map = source(["4. In this section,", '(a) "record" means a log.', "(b) Keep a record.",
    "5. In this section,", '(a) "record" means a file.', "(b) Keep a record."]);
  const value = candidate(map);
  for (const root of [0, 3]) {
    value.segments[root]!.span.end = map.spans[root + 2]!.end;
    for (const i of [root + 1, root + 2]) { value.segments[i]!.type = "point"; value.segments[i]!.parent = `s${root}`; }
  }
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  const links = draft.relationships.filter(r => r.relationType === "defined_term");
  assert.equal(links.length, 2);
  for (const link of links) {
    const owner = draft.provisions.find(p => p.id === link.sourceProvisionId)!;
    const definition = draft.provisions.find(p => p.id === link.targetProvisionId)!;
    assert.equal(owner.parentId, definition.parentId);
  }
});

test("same-scope duplicate definitions remain ambiguous rather than keeping the first", () => {
  const map = source(["4. In this section,", '(a) "record" means a log.', '(b) "record" means a file.', "(c) Keep a record."]);
  const value = candidate(map); value.segments[0]!.span.end = map.text.length;
  for (const i of [1, 2, 3]) { value.segments[i]!.type = "point"; value.segments[i]!.parent = "s0"; }
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  const link = draft.relationships.find(r => r.relationType === "defined_term");
  assert.equal(link?.status, "ambiguous"); assert.equal(link?.targetProvisionIds.length, 2);
});

test("roman-numbered article identities resolve without converting them into section numbers", () => {
  const map = source(["Article IV Scope.", "Article V Subject to Article IV."]);
  const value = candidate(map); value.segments.forEach(s => { s.type = "article"; });
  const detection = detectReferences(map, "test");
  const start = map.text.lastIndexOf("Article IV");
  value.references.push({ start, end: start + 10, exactMention: "Article IV", sourceSpans: sourceLocations(map, { start, end: start + 10 }),
    targetSegmentIds: [], targetHint: "Article IV", resolutionStatus: "pending" });
  const draft = reconstructSource(map, value, detection);
  const target = draft.provisions.find(p => p.canonicalCitation === "Article iv");
  assert.ok(target);
  assert.ok(draft.relationships.some(r => r.exactMention === "Article IV" && r.targetProvisionId === target.id));
});

test("unnumbered explanation never becomes a fabricated subsection number", () => {
  const map = source(["9. Duties", "Explanation. The term has its usual meaning."]);
  const value = candidate(map);
  value.segments[0]!.span.end = map.text.length;
  value.segments[1]!.type = "subsection"; value.segments[1]!.parent = "s0";
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  assert.ok(!draft.provisions.some(p => /\(explanation\)/iu.test(p.canonicalCitation ?? "")));
});

test("validator flags unmarked potential cross-page continuations without silently merging them", () => {
  const map = source(["A provider must delete records after", "the period expires."]);
  const value = candidate(map); value.segments.forEach(s => { s.type = "paragraph"; });
  const draft = reconstructSource(map, value, detectReferences(map, "test"));
  assert.equal(draft.provisions.length, 2);
  const report = validateReconstruction("test", map, draft);
  assert.ok(report.issues.some(issue => issue.code === "unreconciled_boundary"));
});

test("evaluator does not confuse a continuation page with the page where a section starts", () => {
  const expected = { section: 13, physical_page: 10, first_line_exact_text: "13. Right." };
  const input: JudgeInput = { caseId: "page", method: "test", grading: {}, evaluationScope: null,
    expected: {}, forbidden: [], source: [], evidence: [{ ref: "graph#", value: { provisions: [
      { id: "13", kind: "section", start: 0, text: "13. Right. More wording", sourceRanges: [
        { page: 9, start: 0, end: 10 }, { page: 10, start: 10, end: 22 }] }], relationships: [] } }] };
  assert.equal(deterministicGraphCheck(input, "section-start:13", expected), null);
});
