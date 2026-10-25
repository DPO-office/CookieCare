import { parseArgs } from "node:util";
import { config as loadDotEnv } from "dotenv";
import { runPdfWorkflow } from "../src/mastra/knowledge-base/ingestion/workflows/run-pdf-workflow.js";

loadDotEnv({ path: "../.env", quiet: true });
loadDotEnv({ path: ".env", quiet: true, override: true });

// If the configured Docling URL is an example/placeholder domain, clear it to use local models
if (process.env.DOCLING_SERVICE_URL?.includes("example")) {
  delete process.env.DOCLING_SERVICE_URL;
  delete process.env.DOCLING_SERVICE_TOKEN;
}

async function main() {
  const { values } = parseArgs({
    options: {
      pdf: { type: "string" },
      provider: { type: "string", default: "llm" },
      model: { type: "string" },
      "dataset-id": { type: "string" },
      "run-id": { type: "string" },
      "output-dir": { type: "string" },
      "timeout-ms": { type: "string" },
      reasoning: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: false,
  });

  const pdfPath = typeof values.pdf === "string" ? values.pdf.trim() : "";
  if (!pdfPath) {
    process.stderr.write("Error: --pdf <path> is required\n");
    process.exit(1);
  }

  const provider = values.provider === "kanon" ? "kanon" : "llm";
  const model = typeof values.model === "string" ? values.model.trim() : undefined;
  const datasetId = typeof values["dataset-id"] === "string" ? values["dataset-id"].trim() : undefined;
  const displayedModel = model || (provider === "kanon" ? "kanon-2-enricher" :
    process.env.KB_STRUCTURE_LLM_MODEL || process.env.DO_LLM_REASONING_MODEL || "glm-5.3");
  const runId = typeof values["run-id"] === "string" ? values["run-id"].trim() : undefined;
  const outputDir = typeof values["output-dir"] === "string" ? values["output-dir"].trim() : undefined;

  if (values["timeout-ms"]) {
    process.env.DO_INFERENCE_TIMEOUT_MS = String(values["timeout-ms"]);
  }
  if (values.reasoning) {
    process.env.KB_STRUCTURE_REASONING_EFFORT = String(values.reasoning);
  }

  if (!values.json) {
    process.stdout.write(`\n============================================================\n`);
    process.stdout.write(`Knowledge Base Generic PDF Ingestion Pipeline (kb-run-pdf-v1)\n`);
    process.stdout.write(`============================================================\n`);
    process.stdout.write(`PDF File : ${pdfPath}\n`);
    process.stdout.write(`Provider : ${provider}\n`);
    process.stdout.write(`Model    : ${displayedModel}\n`);
    if (process.env.DO_INFERENCE_TIMEOUT_MS) {
      process.stdout.write(`Timeout  : ${process.env.DO_INFERENCE_TIMEOUT_MS} ms\n`);
    }
    if (process.env.KB_STRUCTURE_REASONING_EFFORT) {
      process.stdout.write(`Reasoning: ${process.env.KB_STRUCTURE_REASONING_EFFORT}\n`);
    }
    process.stdout.write(`------------------------------------------------------------\n`);
  }

  const workflowRun = await runPdfWorkflow.createRun();
  const response = await workflowRun.start({
    inputData: {
      pdfPath,
      provider,
      ...(model ? { model } : {}),
      ...(datasetId ? { datasetId } : {}),
      ...(runId ? { runId } : {}),
      ...(outputDir ? { outputDir } : {}),
    },
  });

  if (response.status !== "success") {
    let message = `Workflow finished with status: ${response.status}`;
    if ("error" in response && response.error) {
      const err = response.error as { message?: string } | string;
      message = (typeof err === "object" && err?.message) ? err.message : String(err);
    } else if ("tripwire" in response && response.tripwire) {
      message = `Workflow tripwire triggered: ${JSON.stringify(response.tripwire)}`;
    }
    process.stderr.write(`PDF ingestion failed: ${message}\n`);
    process.exit(1);
  }

  const result = response.result;
  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`------------------------------------------------------------\n`);
    process.stdout.write(`Ingestion Pipeline Completed Successfully!\n`);
    process.stdout.write(`Run ID: ${result.runId}\n`);
    process.stdout.write(`PDF hash: ${result.pdfHash}\n`);
    process.stdout.write(`Output directory: ${result.outputDir}\n`);
    process.stdout.write(`Number of pages: ${result.pageCount}\n`);
    process.stdout.write(
      `Number of provisions and relationships: ${result.provisionCount} provisions, ${result.relationshipCount} relationships\n`,
    );
    process.stdout.write(`Number of provisions: ${result.provisionCount}\n`);
    process.stdout.write(`Number of relationships: ${result.relationshipCount}\n`);
    process.stdout.write(`Validation status: ${result.validationStatus}\n`);
    process.stdout.write(`Validation issue count: ${result.validationIssueCount}\n`);
    process.stdout.write(`============================================================\n\n`);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PDF ingestion failed: ${message}\n`);
  process.exit(1);
});

