import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { evaluateReviewDataset, expectedForJudge } from "../src/mastra/knowledge-base/ingestion/evaluation/review-dataset.js";
import { DigitalOceanEvaluationJudge } from "../src/mastra/knowledge-base/ingestion/evaluation/digitalocean-judge.js";
import { FocusedGraphJudge, focusGraphJudgeInput } from "../src/mastra/knowledge-base/ingestion/evaluation/focused-graph-judge.js";

config({ path: "../.env", quiet: true });
const { values } = parseArgs({ options: { run: { type: "string" }, source: { type: "string" },
  fixture: { type: "string" }, "judge-model": { type: "string" },
  "prepare-only": { type: "boolean" }, "case": { type: "string" },
  stage: { type: "string" } }, strict: true });
if (!values.run || !values.source || !values.fixture) throw new Error("--run --source --fixture are required");
const read = async (base: string, file: string) => JSON.parse(await readFile(path.join(base, file), "utf8"));
const dataset = await read(values.fixture, "dataset.json"), pack = await read(values.fixture, "source-passages.json");
const template = await read(values.fixture, "run-results.template.json");
const draft = await read(values.run, "reconstruction.json"), model = await read(values.run, "document-model.json");
const experiment = existsSync(path.join(values.run, "experiment.json"))
  ? await read(values.run, "experiment.json") as Record<string, any>
  : null;
const manifest = experiment ? null : await read(values.run, "manifest.json") as Record<string, any>;
const candidate = experiment ? null : await read(values.run, "structure-candidate.json") as Record<string, any>;
const configuration = experiment?.configuration ?? {
  provider: candidate?.provider ?? manifest?.provider ?? "unknown",
  model: candidate?.model ?? manifest?.model ?? "unknown",
  promptVersion: candidate?.promptVersion ?? null,
  processingStrategy: candidate?.processingStrategy ?? "kb-run-pdf-v1",
};
const targetStage = values.stage ? values.stage.toUpperCase() : null;
const selectedCases = dataset.cases.filter((row: any) =>
  (!targetStage || targetStage === "ALL" || row.stage.toUpperCase() === targetStage) &&
  (!values.case || row.id === values.case));
if (!selectedCases.length) throw new Error(`No test case matches ${values.case ?? values.stage ?? "the fixture"}`);
const artifacts: Record<string, unknown> = {};
const results = [];
for (const row of selectedCases) {
  const pages = new Set(row.physical_pages ?? []);
  const pageSpans = draft.provisions.flatMap((p: any) => p.sourceSpans.filter((s: any) =>
    pages.has(s.physicalPage)));
  const nearPage = (p: any) => p.sourceSpans.length > 0 && p.sourceSpans.every((s: any) =>
    s.physicalPage == null) && p.sourceSpans.some((s: any) =>
    pageSpans.some((page: any) => s.start <= page.end + 2_000 && s.end >= page.start - 2_000));
  // The rubric selects an evaluation scope only; it never goes to the extractor.
  // Keep source text, IDs and explicit pending states. No expected fact is inserted.
  const seeds = draft.provisions.filter((p: any) =>
    (p.sourceSpans.some((s: any) => pages.has(s.physicalPage)) || nearPage(p)) && p.text.length < 12_000);
  const ids = new Set<string>(seeds.map((p: any) => p.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of draft.relationships) if (ids.has(relation.sourceProvisionId)) {
      for (const id of relation.targetProvisionIds) if (!ids.has(id)) { ids.add(id); grew = true; }
    }
  }
  const byId = new Map<string, any>(draft.provisions.map((p: any) => [p.id, p]));
  const selected = draft.provisions.filter((p: any) => ids.has(p.id));
  const label = (id: string) => byId.get(id)?.label ?? id;
  const tables = model.tables.filter((t: any) => ids.has(t.provisionId) ||
    t.cells.some((cell: any) => cell.pages?.some((page: number) => pages.has(page))));
  artifacts[row.id] = {
    selection: { physicalPages: [...pages], policy: "page-scoped nodes, adjacent unpaged nodes, outgoing reference targets",
      includedUnpagedAdjacentNodeIds: seeds.filter((p: any) => nearPage(p)).map((p: any) => p.id),
      excludedOversizedSeedNodes: draft.provisions.filter((p: any) => p.text.length >= 12_000 &&
        p.sourceSpans.some((s: any) => pages.has(s.physicalPage))).map((p: any) => p.id) },
    provisions: selected.map((p: any) => ({ id: p.id, kind: p.kind, label: p.label, text: p.text,
      parentId: p.parentId, parentLabel: p.parentId ? label(p.parentId) : null,
      structuralPath: p.structuralPath, boundaryStatus: p.boundaryStatus, status: p.status,
      sourceRanges: p.sourceSpans.map((s: any) => ({ page: s.physicalPage, start: s.start, end: s.end })) })),
    relationships: draft.relationships.filter((r: any) => ids.has(r.sourceProvisionId)).map((r: any) => ({
      sourceId: r.sourceProvisionId, sourceLabel: label(r.sourceProvisionId),
      targetIds: r.targetProvisionIds?.length ? r.targetProvisionIds : (r.targetProvisionId ? [r.targetProvisionId] : []),
      targetLabels: (r.targetProvisionIds?.length ? r.targetProvisionIds : (r.targetProvisionId ? [r.targetProvisionId] : [])).map(label),
      relationType: r.relationType ?? "explicit_reference",
      exactMention: r.exactMention, status: r.status, range: r.rangeTarget, external: r.externalTarget,
    })),
    contextPaths: model.contextManifests.filter((m: any) => ids.has(m.targetProvisionId)).map((m: any) => ({
      targetId: m.targetProvisionId, target: label(m.targetProvisionId), complete: m.complete,
      paths: m.selectedPaths.map((p: any) => p.path.map(label)),
      unresolved: m.unresolvedRelationshipIds, missing: m.missingTargetIds,
    })),
    tables,
  };
  results.push({ case_id: row.id, status: "completed", observed: null, evidence_refs: [`${row.id}#`],
    failed_expected_fields: [], forbidden_claims_found: [], reviewer_notes: "Frozen candidate structure; not a published KB." });
}
const run = { ...template, run_id: path.basename(values.run), provider: configuration.provider,
  model: configuration.model, prompt_version: configuration.promptVersion,
  pipeline_version: configuration.processingStrategy, artifacts, results,
  metrics: { duration_ms: experiment?.durationMs ?? manifest?.durationMs ?? null,
    input_tokens: experiment?.usage?.inputTokens ?? null,
    output_tokens: experiment?.usage?.outputTokens ?? null, estimated_cost_usd: null } };
await writeFile(path.join(values.run, "evaluation-input.json"), JSON.stringify(run, null, 2));
const preview = selectedCases.map((row: any) => {
  const expected = expectedForJudge(row.expected);
  const input = { caseId: row.id, method: row.grading.method, grading: row.grading,
    evaluationScope: row.evaluation_scope ?? null, expected, forbidden: row.must_not,
    source: row.source_refs.map((ref: string) => ({ ref,
      text: pack.units[ref]?.comparison_text ?? pack.units[ref]?.fragments?.map((f: any) => f.text).join("\n") ?? "" })),
    evidence: [{ ref: `${row.id}#`, value: artifacts[row.id] }] };
  return { caseId: row.id, fieldCount: Object.keys(expected).length, forbiddenCount: row.must_not.length,
    fields: Object.entries(expected).map(([field, value]) => {
      try {
        const focused = focusGraphJudgeInput(input, field, value);
        const evidence = focused.evidence[0]!.value as any;
        return { field, inputCharacters: JSON.stringify(focused).length,
          candidateLabels: evidence.detailedProvisions.map((p: any) => String(p.label ?? p.text?.slice(0, 80))),
          tableCount: evidence.tables.length };
      }
      catch (error) { return { field, error: error instanceof Error ? error.message : String(error) }; }
    }) };
});
await writeFile(path.join(values.run, "evaluation-focus-preview.json"), JSON.stringify(preview, null, 2));
if (values["prepare-only"]) {
  console.log(JSON.stringify({ status: "prepared", cases: preview.length,
    fields: preview.reduce((n, row) => n + row.fieldCount, 0),
    errors: preview.flatMap(row => row.fields.filter(field => "error" in field)).length,
    previewFile: path.join(values.run, "evaluation-focus-preview.json") }));
  process.exit(0);
}
const focusedCallCount = preview.reduce((sum, row) => sum + row.fieldCount + row.forbiddenCount, 0);
process.stdout.write(`Prepared ${selectedCases.length} case(s), ${focusedCallCount} focused judge calls. Starting judge requests...\n`);
const judgeModel = values["judge-model"] ?? "glm-5.3";
const stageLabel = targetStage === "ALL" || !targetStage ? (values.case ?? "all-cases") : (values.case ?? targetStage);
const suffix = `${stageLabel}.${judgeModel}`.replace(/[^a-zA-Z0-9._-]/g, "_");
const checkpointPath = path.join(values.run, `evaluation-judge-checkpoint.${suffix}.json`);
const rawAttemptsPath = path.join(values.run, `evaluation-judge-raw.${suffix}.jsonl`);
let previousCalls: any[] = [];
if (existsSync(checkpointPath)) {
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (checkpoint.schemaVersion === "focused-graph-checkpoint/2.0" &&
        checkpoint.runId === run.run_id && checkpoint.judgeModel === judgeModel &&
        Array.isArray(checkpoint.calls)) previousCalls = checkpoint.calls;
  } catch { /* An unreadable checkpoint is ignored; the new run starts cleanly. */ }
}
if (!previousCalls.length) await writeFile(rawAttemptsPath, "");
const baseJudge = new DigitalOceanEvaluationJudge(judgeModel, undefined, async attempt => {
  await appendFile(rawAttemptsPath, `${JSON.stringify(attempt)}\n`);
});
const judge = new FocusedGraphJudge(baseJudge, { previousCalls, maxAttempts: 2,
  onProgress: async calls => {
    await writeFile(checkpointPath, JSON.stringify({ schemaVersion: "focused-graph-checkpoint/2.0",
      runId: run.run_id, caseId: values.case ?? null, judgeModel, updatedAt: new Date().toISOString(),
      calls }, null, 2));
  } });
const report = await evaluateReviewDataset({ ...dataset, cases: selectedCases }, run, pack,
  await readFile(path.join(values.source, "original.pdf")), judge);
const output = { ...report, judgeUsage: baseJudge.usage, datasetReview: "human_review_pending",
  fixtureReplacementCharacterCount: (JSON.stringify(dataset).match(/\uFFFD/gu) ?? []).length,
  judgeArtifacts: { checkpoint: checkpointPath, calls: `evaluation-judge-calls.${suffix}.json`,
    rawAttempts: rawAttemptsPath } };
await writeFile(path.join(values.run, "evaluation-report.json"), JSON.stringify(output, null, 2));
await writeFile(path.join(values.run, "evaluation-judge-calls.json"), JSON.stringify(judge.calls, null, 2));
await writeFile(path.join(values.run, `evaluation-report.${suffix}.json`), JSON.stringify(output, null, 2));
await writeFile(path.join(values.run, `evaluation-judge-calls.${suffix}.json`), JSON.stringify(judge.calls, null, 2));
console.log(JSON.stringify(output));
