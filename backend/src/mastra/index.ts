import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { sourceIntakeWorkflow } from "./knowledge-base/ingestion/workflows/source-intake-workflow.js";
import { processIngestionWorkflow } from "./knowledge-base/ingestion/workflows/process-ingestion-workflow.js";
import { prepareSourceWorkflow } from "./knowledge-base/ingestion/workflows/prepare-source-workflow.js";

export const mastra = new Mastra({
  storage: process.env.DATABASE_URL
    ? new PostgresStore({ id: "cookiecare-kb-workflows", connectionString: process.env.DATABASE_URL })
    : undefined,
  workflows: { sourceIntakeWorkflow, processIngestionWorkflow, prepareSourceWorkflow },
});
