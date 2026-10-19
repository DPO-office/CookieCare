import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { config as loadDotEnv } from "dotenv";
import {
  ReviewDatasetSchema,
  ReviewRunSchema,
  SourcePackSchema,
} from "../src/mastra/knowledge-base/ingestion/evaluation/dataset-contracts.js";
import { DigitalOceanEvaluationJudge } from "../src/mastra/knowledge-base/ingestion/evaluation/digitalocean-judge.js";
import { evaluateReviewDataset } from "../src/mastra/knowledge-base/ingestion/evaluation/review-dataset.js";

loadDotEnv({ path: "../.env", quiet: true });
loadDotEnv({ path: ".env", quiet: true, override: true });

async function main() {
  const { values } = parseArgs({
    options: {
      "run-dir": { type: "string" },
      dataset: { type: "string" },
      "judge-model": { type: "string" },
      stage: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: false,
  });

  // Resolve run directory:
  let runDir = values["run-dir"] ? path.resolve(String(values["run-dir"])) : "";
  if (!runDir) {
    const baseDir = path.resolve("evaluation-runs", "GDPR.pdf");
    if (existsSync(baseDir)) {
      const runs = readdirSync(baseDir)
        .map(entry => path.join(baseDir, entry))
        .filter(entry => statSync(entry).isDirectory())
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (runs.length > 0) runDir = runs[0]!;
    }
  }

  if (!runDir || !existsSync(runDir)) {
    process.stderr.write("Error: --run-dir <path> is required or no runs found in evaluation-runs/GDPR.pdf\n");
    process.exit(1);
  }

  const fixtureDir = path.resolve("src/mastra/knowledge-base/ingestion/evaluation/fixtures/gdpr-review-v1");
  const datasetPath = values.dataset ? path.resolve(String(values.dataset)) : path.join(fixtureDir, "dataset.json");
  const sourcePackPath = path.join(fixtureDir, "source-passages.json");
  const originalPdfPath = path.join(runDir, "original.pdf");
  const runResultsPath = path.join(runDir, "run-results.json");

  if (!existsSync(datasetPath)) throw new Error(`Dataset fixture not found: ${datasetPath}`);
  if (!existsSync(sourcePackPath)) throw new Error(`Source passages not found: ${sourcePackPath}`);
  if (!existsSync(originalPdfPath)) throw new Error(`Original PDF not found in run directory: ${originalPdfPath}`);

  const dataset = ReviewDatasetSchema.parse(JSON.parse(await readFile(datasetPath, "utf8")));
  const sourcePack = SourcePackSchema.parse(JSON.parse(await readFile(sourcePackPath, "utf8")));
  const pdfBytes = await readFile(originalPdfPath);

  let runData: Record<string, unknown>;
  if (existsSync(runResultsPath)) {
    runData = JSON.parse(await readFile(runResultsPath, "utf8"));
  } else {
    // Read individual stage files from run directory to construct runData
    const manifestPath = path.join(runDir, "manifest.json");
    const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
    const sourceMapPath = path.join(runDir, "source-map.json");
    const sourceMap = existsSync(sourceMapPath) ? JSON.parse(await readFile(sourceMapPath, "utf8")) : null;
    const doclingPath = path.join(runDir, "docling.json");
    const docling = existsSync(doclingPath) ? JSON.parse(await readFile(doclingPath, "utf8")) : null;
    const structureCandidatePath = path.join(runDir, "structure-candidate.json");
    const candidate = existsSync(structureCandidatePath) ? JSON.parse(await readFile(structureCandidatePath, "utf8")) : null;
    const referencesPath = path.join(runDir, "references.json");
    const references = existsSync(referencesPath) ? JSON.parse(await readFile(referencesPath, "utf8")) : null;
    const reconstructionPath = path.join(runDir, "reconstruction.json");
    const reconstruction = existsSync(reconstructionPath) ? JSON.parse(await readFile(reconstructionPath, "utf8")) : null;
    const documentModelPath = path.join(runDir, "document-model.json");
    const documentModel = existsSync(documentModelPath) ? JSON.parse(await readFile(documentModelPath, "utf8")) : null;
    const validationPath = path.join(runDir, "validation.json");
    const validation = existsSync(validationPath) ? JSON.parse(await readFile(validationPath, "utf8")) : null;

    const unicodeSpans = sourceMap?.spans
      ?.filter((s: { page: number | null }) => s.page !== null && [33, 34, 35].includes(s.page))
      ?.map((s: { page: number | null; itemRef: string; start: number; end: number }) => ({
        page: s.page,
        itemRef: s.itemRef,
        text: sourceMap.text.slice(s.start, s.end),
      })) ?? [];

    runData = {
      dataset_id: dataset.dataset_id,
      source_sha256: manifest.pdfSha256 ?? dataset.source.sha256,
      run_id: manifest.runId ?? path.basename(runDir),
      provider: manifest.provider ?? "llm",
      model: manifest.model ?? "glm-5.3",
      prompt_version: "legal-structure-v3",
      pipeline_version: "kb-run-pdf-v1",
      reasoning_setting: "low",
      model_assignments: [
        { stage: "S1", task: "verify_identity", provider: "native", model: "sha256", reasoning_setting: null, prompt_version: null },
        { stage: "S2", task: "text_extraction", provider: "docling", model: "docling.rs-1.41.0", reasoning_setting: null, prompt_version: null },
        { stage: "S3", task: "structure_extraction", provider: manifest.provider ?? "llm", model: manifest.model ?? "glm-5.3", reasoning_setting: "low", prompt_version: "legal-structure-v3" },
      ],
      artifacts: {
        page_inventory: sourceMap ? { pages: sourceMap.pages } : undefined,
        unicode_source_output: { spans: unicodeSpans },
        docling,
        source_map: sourceMap,
        structure_candidate: candidate,
        references,
        reconstruction,
        document_model: documentModel,
        validation,
      },
      results: [
        { case_id: "GDPR-S1-02", status: "completed", observed: null, evidence_refs: ["page_inventory#"], failed_expected_fields: [], forbidden_claims_found: [], reviewer_notes: "" },
        { case_id: "GDPR-S2-10", status: "completed", observed: null, evidence_refs: ["unicode_source_output#"], failed_expected_fields: [], forbidden_claims_found: [], reviewer_notes: "" },
      ],
    };
  }

  const run = ReviewRunSchema.parse(runData);

  // Optional judge
  const judgeModel = values["judge-model"] ? String(values["judge-model"]) : process.env.KB_EVAL_JUDGE_MODEL;
  const judge = judgeModel && process.env.DO_MODEL_ACCESS_KEY ? new DigitalOceanEvaluationJudge(judgeModel) : undefined;

  // Filter cases if stage is specified (e.g. S1, S2, S3)
  const targetStage = values.stage ? String(values.stage).toUpperCase() : null;
  const filteredDataset = targetStage
    ? { ...dataset, cases: dataset.cases.filter(c => c.stage === targetStage) }
    : dataset;

  const report = await evaluateReviewDataset(filteredDataset, run, sourcePack, pdfBytes, judge);

  // Save report into the run directory
  const reportPath = path.join(runDir, "evaluation-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(`\n============================================================\n`);
  process.stdout.write(`GDPR Knowledge Base Ingestion Evaluation (S1 - S7)\n`);
  process.stdout.write(`============================================================\n`);
  process.stdout.write(`Run Directory : ${runDir}\n`);
  process.stdout.write(`Dataset ID    : ${dataset.dataset_id}\n`);
  process.stdout.write(`Source SHA256 : ${dataset.source.sha256.slice(0, 16)}... (verified)\n`);
  process.stdout.write(`Judge Model   : ${judge ? judge.model : "none (rule-based)"}\n`);
  process.stdout.write(`------------------------------------------------------------\n`);
  process.stdout.write(`Stage Breakdown:\n`);

  const stageKeys = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const;
  for (const s of stageKeys) {
    const stageCases = report.cases.filter(c => c.stage === s);
    if (!stageCases.length) continue;
    const passed = stageCases.filter(c => c.status === "pass").length;
    const failed = stageCases.filter(c => c.status === "fail").length;
    const notRun = stageCases.filter(c => c.status === "not_run").length;
    const review = stageCases.filter(c => c.status === "needs_review").length;
    const stageName = dataset.stages[s] ?? s;
    process.stdout.write(
      `  [${s}] ${stageName.padEnd(40)} : ${passed} pass, ${failed} fail, ${review} review, ${notRun} not_run (${stageCases.length} total)\n`
    );
  }

  process.stdout.write(`------------------------------------------------------------\n`);
  process.stdout.write(`Overall Summary:\n`);
  process.stdout.write(`  Passed       : ${report.statuses.pass}\n`);
  process.stdout.write(`  Failed       : ${report.statuses.fail}\n`);
  process.stdout.write(`  Needs Review : ${report.statuses.needs_review}\n`);
  process.stdout.write(`  Not Run      : ${report.statuses.not_run}\n`);
  process.stdout.write(`  Blocked      : ${report.statuses.blocked_by_upstream}\n`);
  process.stdout.write(`  Total Cases  : ${report.cases.length}\n`);
  process.stdout.write(`  Saved Report : ${reportPath}\n`);
  process.stdout.write(`============================================================\n\n`);
}

main().catch(err => {
  process.stderr.write(`Evaluation failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

