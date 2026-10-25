import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { ReviewDatasetSchema, ReviewRunSchema, SourcePackSchema } from "./dataset-contracts.js";
import { DigitalOceanEvaluationJudge } from "./digitalocean-judge.js";
import { evaluateReviewDataset } from "./review-dataset.js";

export const reviewCaseInputSchema = z.object({ caseId: z.string().min(1), stage: z.string().optional(),
  task: z.unknown().optional(), sourcePdfSha256: z.string().optional() }).passthrough();
export const reviewCaseOutputSchema = z.object({ caseId: z.string(), stage: z.string(), status: z.string(),
  provisional: z.boolean(), humanReviewStatus: z.string(), judgeModel: z.string().nullable(),
  reasons: z.array(z.string()), failedExpectedFields: z.array(z.string()),
  forbiddenClaimsFound: z.array(z.string()),
  expectedChecks: z.object({ passed: z.number(), failed: z.number(),
    needsReview: z.number(), total: z.number() }).optional() });

const evaluateCaseStep = createStep({
  id: "evaluate-kb-review-case",
  inputSchema: reviewCaseInputSchema,
  outputSchema: reviewCaseOutputSchema,
  execute: async ({ inputData }) => {
    const dpdpa = inputData.caseId.startsWith("DPDPA-");
    const fixture = dpdpa ? "dpdpa-2023-review-v1" : "gdpr-review-v1";
    const backendRoot = [process.env.COOKIECARE_BACKEND_ROOT, process.cwd(), join(process.cwd(), "backend"),
      fileURLToPath(new URL("../../", import.meta.url)),
      fileURLToPath(new URL("../../../../../", import.meta.url))].filter((value): value is string => !!value).find(candidate =>
      existsSync(join(candidate, "src", "mastra", "knowledge-base", "ingestion", "evaluation", "fixtures", fixture, "dataset.json")));
    if (!backendRoot) throw new Error(`${fixture} evaluation fixtures are missing from this Mastra deployment`);
    const base = join(backendRoot, "src", "mastra", "knowledge-base", "ingestion", "evaluation", "fixtures", fixture);
    const dataset = ReviewDatasetSchema.parse(JSON.parse(await readFile(join(base, "dataset.json"), "utf8")));
    const sourcePack = SourcePackSchema.parse(JSON.parse(await readFile(join(base, "source-passages.json"), "utf8")));
    const row = dataset.cases.find(item => item.id === inputData.caseId);
    if (!row) throw new Error(`Unknown ${fixture} evaluation case: ${inputData.caseId}`);
    if (inputData.sourcePdfSha256 && inputData.sourcePdfSha256 !== dataset.source.sha256)
      throw new Error("Case source PDF identity differs from the frozen dataset");
    const runPath = process.env.KB_EVAL_RUN_PATH ?? (dpdpa ? join(base, "run-results.template.json") :
      join(backendRoot, "evaluation-runs", "gdpr-oj-2016-en-review-v1",
        "docling-1.41.0", "run-results.source-stage.json"));
    const pdfPath = process.env.KB_EVAL_PDF_PATH ?? dataset.source.local_path;
    if (typeof pdfPath !== "string") throw new Error("Set KB_EVAL_PDF_PATH for Studio experiments");
    const run = ReviewRunSchema.parse(JSON.parse(await readFile(runPath, "utf8")));
    const observation = run.results.find(item => item.case_id === row.id);
    const judgeModel = process.env.KB_EVAL_JUDGE_MODEL ?? "glm-5.3";
    const judge = observation?.evidence_refs.length ? new DigitalOceanEvaluationJudge(judgeModel) : undefined;
    const report = await evaluateReviewDataset({ ...dataset, cases: [row] },
      { ...run, results: observation ? [observation] : [] }, sourcePack, await readFile(pdfPath), judge);
    const result = report.cases[0]!;
    return { caseId: row.id, stage: row.stage, status: result.status,
      provisional: row.human_review.status !== "approved", humanReviewStatus: row.human_review.status,
      judgeModel: judge?.model ?? null, reasons: result.reasons,
      failedExpectedFields: result.failedExpectedFields,
      forbiddenClaimsFound: result.forbiddenClaimsFound,
      ...(result.expectedChecks ? { expectedChecks: result.expectedChecks } : {}) };
  },
});

export const reviewCaseWorkflow = createWorkflow({
  id: "kb-gdpr-review-case-v1", inputSchema: reviewCaseInputSchema, outputSchema: reviewCaseOutputSchema,
}).then(evaluateCaseStep).commit();

export const reviewDpdpaCaseWorkflow = createWorkflow({
  id: "kb-dpdpa-review-case-v1", inputSchema: reviewCaseInputSchema, outputSchema: reviewCaseOutputSchema,
}).then(evaluateCaseStep).commit();
