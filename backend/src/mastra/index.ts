import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { sourceIntakeWorkflow } from "./knowledge-base/ingestion/workflows/source-intake-workflow.js";
import { processIngestionWorkflow } from "./knowledge-base/ingestion/workflows/process-ingestion-workflow.js";
import { prepareSourceWorkflow } from "./knowledge-base/ingestion/workflows/prepare-source-workflow.js";
import { runPdfWorkflow } from "./knowledge-base/ingestion/workflows/run-pdf-workflow.js";
import { reviewCaseWorkflow, reviewDpdpaCaseWorkflow } from "./knowledge-base/ingestion/evaluation/review-case-workflow.js";
import { gdprProvisionalAccuracyScorer, dpdpaProvisionalAccuracyScorer } from "./knowledge-base/ingestion/evaluation/review-case-scorer.js";

loadDotEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export const mastra = new Mastra({
  bundler: {
    externals: ["pdfjs-dist"],
  },
  storage: process.env.DATABASE_URL
    ? new PostgresStore({ id: "cookiecare-kb-workflows", connectionString: process.env.DATABASE_URL })
    : undefined,
  workflows: { sourceIntakeWorkflow, processIngestionWorkflow, prepareSourceWorkflow, reviewCaseWorkflow,
    reviewDpdpaCaseWorkflow, runPdfWorkflow },
  scorers: { gdprProvisionalAccuracyScorer, dpdpaProvisionalAccuracyScorer },
});
