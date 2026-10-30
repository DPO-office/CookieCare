/** Offline regression replay: never changes old runs or calls a model. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { reconstructSource, type ReconstructionDraft } from "../src/mastra/knowledge-base/ingestion/extraction/reconstruct.js";
import { detectReferences } from "../src/mastra/knowledge-base/ingestion/extraction/reference-detection.js";
import { enrichSemanticRelationships } from "../src/mastra/knowledge-base/ingestion/extraction/semantic-relationships.js";
import { buildDocumentModel } from "../src/mastra/knowledge-base/ingestion/extraction/document-model.js";
import { validateReconstruction } from "../src/mastra/knowledge-base/ingestion/extraction/validate-reconstruction.js";
import { deterministicGraphCheck } from "../src/mastra/knowledge-base/ingestion/evaluation/focused-graph-judge.js";
import { reconcileBoundaries } from "../src/mastra/knowledge-base/ingestion/extraction/reconcile-boundaries.js";
import { repairStructuralDirectory } from "../src/mastra/knowledge-base/ingestion/extraction/structural-directory.js";
import { buildSourceMap } from "../src/mastra/knowledge-base/ingestion/extraction/source-map.js";

const runs = process.argv.slice(2);
if (!runs.length) throw new Error("Pass one or more saved run directories containing source-map, candidate and reconstruction JSON.");
const output = path.resolve("evaluation-runs", `ingestion-repair-replay-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile("src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1/dataset.json", "utf8"));
const metrics = (draft: ReconstructionDraft) => {
  const rows = draft.provisions.filter(p => p.kind === "table_row");
  const rowIds = new Set(rows.map(p => p.id));
  return { provisions: draft.provisions.length, references: draft.relationships.length,
    resolvedReferences: draft.relationships.filter(r => r.status === "proposed").length,
    unresolvedReferences: draft.relationships.filter(r => r.status === "unresolved").length,
    ambiguousReferences: draft.relationships.filter(r => r.status === "ambiguous").length,
    orphanSubsections: draft.provisions.filter(p => ["subsection", "point", "paragraph"].includes(p.kind) && !p.parentId).length,
    canonicalRows: rows.length, referencesOwnedByRows: draft.relationships.filter(r => rowIds.has(r.sourceProvisionId!)).length,
    duplicateRowRanges: rows.filter(row => draft.provisions.some(p => p.id !== row.id && p.start === row.start && p.end === row.end)).length,
    definitionLinks: draft.relationships.filter(r => r.relationType === "defined_term").length,
    unresolvedTextCharacters: draft.unresolvedText.reduce((sum, gap) => sum + gap.text.length, 0) };
};
const sections: any[] = [];
function findSections(value: any): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.section_starts)) sections.push(...value.section_starts);
  for (const child of Object.values(value)) if (child && typeof child === "object") findSections(child);
}
findSections(fixture);
function pageChecks(draft: ReconstructionDraft, map?: ReturnType<typeof buildSourceMap>) {
  const input: any = { caseId: "offline-pages", method: "deterministic", grading: {}, evaluationScope: null,
    expected: {}, forbidden: [], source: [], evidence: [{ ref: "graph#", value: {
      provisions: draft.provisions.map(p => ({ ...p, sourceMarker: map?.spans.find(s => s.start === p.start)?.marker })),
      relationships: draft.relationships } }] };
  return { confirmed: sections.filter(expected => deterministicGraphCheck(input, `section-start:${expected.section}`, expected)?.verdict === "pass").length,
    total: sections.length, note: "Unconfirmed checks require review; absence is not automatically scored as failure." };
}
const reports = [];
for (const directory of runs) {
  const read = async (name: string) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
  const savedMap = await read("source-map.json"), candidate = await read("structure-candidate.json");
  const map = buildSourceMap(await read("docling.json"), savedMap.pages.length);
  if (map.textHash !== savedMap.textHash) throw new Error("Replay text changed; old extraction offsets cannot be reused");
  const before = await read("reconstruction.json") as ReconstructionDraft;
  const repaired = reconcileBoundaries(map, repairStructuralDirectory(map, candidate));
  const draft = reconstructSource(map, repaired, detectReferences(map, before.sourceVersionId));
  const semantic = await enrichSemanticRelationships(map, draft);
  const document = buildDocumentModel(map, semantic.draft);
  const validation = validateReconstruction(before.sourceVersionId, map, semantic.draft, document);
  const name = path.basename(path.resolve(directory));
  await writeFile(path.join(output, `${name}.reconstruction.json`), JSON.stringify(semantic.draft, null, 2));
  await writeFile(path.join(output, `${name}.validation.json`), JSON.stringify(validation, null, 2));
  await writeFile(path.join(output, `${name}.document-model.json`), JSON.stringify(document, null, 2));
  reports.push({ run: directory, before: metrics(before), after: metrics(semantic.draft),
    pageChecksBefore: pageChecks(before), pageChecksAfter: pageChecks(semantic.draft, map),
    deterministicSemanticLinks: semantic.report.links.length,
    validationIssues: validation.issues.length,
    section9Children: semantic.draft.provisions.filter(p => /^Section 9\(/u.test(p.canonicalCitation ?? "")).map(p => p.canonicalCitation),
    validationByCode: validation.issues.reduce<Record<string, number>>((counts, issue) => {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1; return counts;
    }, {}),
    limitations: "Frozen extraction replay only. Missing model output is not regenerated. Counts are diagnostics, not legal accuracy." });
}
await writeFile(path.join(output, "report.json"), JSON.stringify(reports, null, 2));
process.stdout.write(JSON.stringify({ output, reports }, null, 2) + "\n");
