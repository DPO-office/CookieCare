import { createHash, randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { DoclingPdfExtractor, type PdfExtractor } from "../extraction/docling-pdf.js";
import { buildSourceMap, type SourceMap } from "../extraction/source-map.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { buildDocumentModel } from "../extraction/document-model.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";
import {
  LLM_MAX_INPUT_CHARACTERS,
  LLM_PROCESSING_STRATEGY,
  LLM_TARGET_INPUT_CHARACTERS,
  STRUCTURE_PROMPT_VERSION,
  StructureProviderConfigSchema,
  StructureProviderNameSchema,
  structureConfigurationHash,
  type StructureProvider,
  type StructureProviderConfig,
  type StructureProviderName,
} from "../extraction/structure-provider.js";
import {
  LLM_STRUCTURE_RESPONSE_SCHEMA,
  LLM_STRUCTURE_SYSTEM_PROMPT,
} from "../extraction/llm-structure.js";
import { planStructureChunks, type StructureChunkPlan } from "../extraction/structure-chunk-plan.js";
import { createAuthorizedProductionStructureProvider } from "../extraction/structure-provider-factory.js";
import { MAX_PDF_BYTES } from "../storage/object-store.js";
import { inspectOriginalPdf, MAX_PDF_PAGES } from "../storage/pdf-metadata.js";

export const RunPdfInputSchema = z.object({
  pdfPath: z.string().min(1),
  provider: StructureProviderNameSchema.default("llm"),
  model: z.string().trim().min(1).optional(),
  datasetId: z.string().trim().min(1).optional(),
  runId: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
});
export type RunPdfInput = z.infer<typeof RunPdfInputSchema>;

export const RunPdfOutputSchema = z.object({
  runId: z.string().min(1),
  pdfHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputDir: z.string().min(1),
  pageCount: z.number().int().positive(),
  provisionCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  validationStatus: z.enum(["needs_review", "candidate_ready"]),
  validationIssueCount: z.number().int().nonnegative(),
  manifestPath: z.string().min(1),
});
export type RunPdfOutput = z.infer<typeof RunPdfOutputSchema>;

export function buildStructureConfig(provider: StructureProviderName, model?: string): StructureProviderConfig {
  const base = provider === "kanon"
    ? {
        provider: "kanon" as const,
        model: model || "kanon-2-enricher",
        promptVersion: null,
        processingStrategy: "provider_chunk-v1",
        configurationVersion: "kanon-v1",
      }
    : {
        provider: "llm" as const,
        model: model || process.env.KB_STRUCTURE_LLM_MODEL?.trim() ||
          process.env.DO_LLM_REASONING_MODEL?.trim() || "glm-5.3",
        promptVersion: STRUCTURE_PROMPT_VERSION,
        processingStrategy: LLM_PROCESSING_STRATEGY,
        configurationVersion: "llm-digitalocean-v3",
      };
  return StructureProviderConfigSchema.parse({
    ...base,
    configurationHash: structureConfigurationHash(base),
  });
}

export function resolveDefaultOutputDir(pdfFileName: string, runId: string): string {
  const cwd = process.cwd();
  const baseDir = cwd.endsWith("backend")
    ? path.join(cwd, "evaluation-runs")
    : existsSync(path.join(cwd, "backend"))
      ? path.join(cwd, "backend", "evaluation-runs")
      : path.join(cwd, "evaluation-runs");
  return path.join(baseDir, pdfFileName, runId);
}

export interface RunPdfWorkflowServices {
  extractor?: PdfExtractor;
  providerFactory?: (configuration: StructureProviderConfig) => StructureProvider;
}

async function withStageFailure<T>(inputData: { outputDir?: string }, stage: "S1" | "S2" | "S3",
  phase: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (inputData.outputDir) {
      const failedAt = new Date().toISOString();
      const failure = { stage, phase, status: "failed", error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      }, failedAt };
      await mkdir(inputData.outputDir, { recursive: true });
      await writeFile(path.join(inputData.outputDir, `stage-${stage.toLocaleLowerCase("en")}-error.json`),
        `${JSON.stringify(failure, null, 2)}\n`);
      const manifestPath = path.join(inputData.outputDir, "manifest.json");
      let manifest: Record<string, unknown> = {};
      if (existsSync(manifestPath)) {
        try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* retain failure */ }
      }
      const stages = typeof manifest.stages === "object" && manifest.stages ? manifest.stages : {};
      await writeFile(manifestPath, `${JSON.stringify({ ...manifest, status: "failed", currentStage: stage,
        stages: { ...stages, [stage]: "failed" }, error: failure.error, failedAt }, null, 2)}\n`);
    }
    throw error;
  }
}

export function createRunPdfWorkflow(resolveServices: () => RunPdfWorkflowServices = () => ({})) {
  const verifyPdf = createStep({
    id: "verify-pdf-input-v1",
    inputSchema: RunPdfInputSchema,
    outputSchema: z.object({
      pdfPath: z.string(),
      pdfFileName: z.string(),
      pdfHash: z.string(),
      byteSize: z.number(),
      pageCount: z.number(),
      provider: StructureProviderNameSchema,
      model: z.string(),
      datasetId: z.string().nullable(),
      runId: z.string(),
      outputDir: z.string(),
      startedAt: z.number(),
    }),
    execute: async ({ inputData }) => withStageFailure(inputData, "S1", "pdf_verification", async () => {
      const resolvedPath = path.resolve(inputData.pdfPath);
      if (!existsSync(resolvedPath)) {
        throw new Error(`PDF file not found: ${inputData.pdfPath}`);
      }
      const stats = statSync(resolvedPath);
      if (stats.size > MAX_PDF_BYTES) {
        throw new Error(`PDF file exceeds maximum allowed size of 25 MiB: ${stats.size} bytes`);
      }
      const bytes = await readFile(resolvedPath);
      if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
        throw new Error("Uploaded file is not a valid PDF: missing %PDF- header");
      }
      const inspection = await inspectOriginalPdf(bytes);
      if (inspection.readability !== "readable" || inspection.pageCount === null) {
        throw new Error("PDF file is unreadable");
      }
      if (inspection.pageCount < 1) {
        throw new Error("PDF file has no pages");
      }
      if (inspection.pageCount > MAX_PDF_PAGES) {
        throw new Error(`PDF exceeds the page limit of ${MAX_PDF_PAGES}`);
      }
      const pdfHash = createHash("sha256").update(bytes).digest("hex");
      const pdfFileName = path.basename(resolvedPath);
      const runId = inputData.runId || randomUUID();
      const outputDir = inputData.outputDir
        ? path.resolve(inputData.outputDir)
        : resolveDefaultOutputDir(pdfFileName, runId);
      const provider = inputData.provider ?? "llm";
      const configuration = buildStructureConfig(provider, inputData.model);
      const model = configuration.model;

      process.stdout.write(`[1/8] Verifying PDF: ${pdfFileName} (${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${inspection.pageCount} pages)...\n`);
      process.stdout.write(`      ✓ Valid PDF verified (SHA-256: ${pdfHash.slice(0, 16)}...)\n`);

      // Immediately create output directory and save Step 1 / S1 artifacts
      await mkdir(outputDir, { recursive: true });
      const stageS1 = {
        stage: "S1",
        stageName: "Source identity and classification",
        pdfFileName,
        pdfHash,
        byteSize: bytes.length,
        pageCount: inspection.pageCount,
        readability: inspection.readability,
        provider,
        model,
        datasetId: inputData.datasetId ?? null,
        runId,
        outputDir,
        startedAt: new Date().toISOString(),
      };
      const initialManifest = {
        runId,
        pipelineVersion: "kb-run-pdf-v1",
        pdfPath: resolvedPath,
        pdfFileName,
        pdfSha256: pdfHash,
        sourceSha256: pdfHash,
        byteSize: bytes.length,
        pageCount: inspection.pageCount,
        provider,
        model,
        datasetId: inputData.datasetId ?? null,
        outputDir,
        status: "in_progress",
        currentStage: "S1",
        stages: {
          S1: "completed",
        },
        createdAt: new Date().toISOString(),
      };
      await Promise.all([
        writeFile(path.join(outputDir, "original.pdf"), bytes),
        writeFile(path.join(outputDir, "stage-s1.json"), `${JSON.stringify(stageS1, null, 2)}\n`),
        writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(initialManifest, null, 2)}\n`),
      ]);
      process.stdout.write(`      ✓ Saved S1 artifacts (original.pdf, stage-s1.json) to ${outputDir}\n`);

      return {
        pdfPath: resolvedPath,
        pdfFileName,
        pdfHash,
        byteSize: bytes.length,
        pageCount: inspection.pageCount,
        provider,
        model,
        datasetId: inputData.datasetId ?? null,
        runId,
        outputDir,
        startedAt: Date.now(),
      };
    }),
  });

  const extractDocling = createStep({
    id: "extract-docling-source-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S2", "docling_extraction", async () => {
      const started = Date.now();
      process.stdout.write(`[2/8] Extracting text and layout with Docling (${inputData.pageCount} pages)...\n`);
      const { extractor = new DoclingPdfExtractor() } = resolveServices();
      const bytes = await readFile(inputData.pdfPath);
      const doclingDocument = await extractor.extract(bytes, inputData.pdfFileName);
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Docling extraction finished in ${durationSec}s\n`);

      // Immediately save docling.json
      await writeFile(path.join(inputData.outputDir, "docling.json"), `${JSON.stringify(doclingDocument, null, 2)}\n`);
      process.stdout.write(`      ✓ Saved docling.json to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        doclingDocument,
      };
    }),
  });

  const mapSource = createStep({
    id: "build-source-map-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S2", "source_mapping", async () => {
      const started = Date.now();
      process.stdout.write(`[3/8] Building canonical source map and text offsets...\n`);
      const sourceMap = buildSourceMap(inputData.doclingDocument, inputData.pageCount);
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Source map generated in ${durationSec}s (${sourceMap.text.length.toLocaleString()} characters, ${sourceMap.spans.length.toLocaleString()} source spans)\n`);

      // Immediately save source-map.json and stage-s2.json
      const stageS2 = {
        stage: "S2",
        stageName: "Text extraction and complete boundaries",
        textHash: sourceMap.textHash,
        canonicalCharacters: sourceMap.text.length,
        spanCount: sourceMap.spans.length,
        pageCount: sourceMap.pages.length,
        status: sourceMap.status,
        pages: sourceMap.pages,
      };
      await Promise.all([
        writeFile(path.join(inputData.outputDir, "source-map.json"), `${JSON.stringify(sourceMap, null, 2)}\n`),
        writeFile(path.join(inputData.outputDir, "stage-s2.json"), `${JSON.stringify(stageS2, null, 2)}\n`),
      ]);
      const manifestPath = path.join(inputData.outputDir, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await writeFile(manifestPath, `${JSON.stringify({ ...manifest, status: "in_progress",
        currentStage: "S2", stages: { ...manifest.stages, S2: "completed" } }, null, 2)}\n`);
      process.stdout.write(`      ✓ Saved S2 artifacts (source-map.json, stage-s2.json) to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        sourceMap,
      };
    }),
  });

  const extractStructure = createStep({
    id: "extract-structure-chunks-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "structure_extraction", async () => {
      process.stdout.write(`[4/8] Extracting legal structure (${inputData.provider} / ${inputData.model})...\n`);
      const { providerFactory = createAuthorizedProductionStructureProvider } = resolveServices();
      const sourceMap: SourceMap = inputData.sourceMap;
      const configuration = buildStructureConfig(inputData.provider, inputData.model);
      const providerInstance = providerFactory(configuration);

      let chunkPlan: StructureChunkPlan | { schemaVersion: 1; strategy: "provider_managed";
        provider: "kanon"; processingStrategy: string } | null = null;
      const extractionAttempts: unknown[] = [];
      const fixedInputCharacters =
        LLM_STRUCTURE_SYSTEM_PROMPT.length + JSON.stringify(LLM_STRUCTURE_RESPONSE_SCHEMA).length;

      let providerResult;
      try {
        providerResult = await providerInstance.extract({
          doclingDocument: inputData.doclingDocument,
          canonicalText: sourceMap.text,
          textHash: sourceMap.textHash,
          sourceMap,
          configuration,
          checkpoints: {
            savePlan: async plan => {
              chunkPlan = plan;
              await writeFile(path.join(inputData.outputDir, "chunk-plan.json"),
                `${JSON.stringify(plan, null, 2)}\n`);
            },
            loadChunk: async chunk => {
              const checkpointPath = path.join(inputData.outputDir, "checkpoints", `${chunk.chunkId}.json`);
              if (existsSync(checkpointPath)) {
                try {
                  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
                  if (checkpoint?.checkpointSchemaVersion !== 1 ||
                      checkpoint.sourceTextHash !== sourceMap.textHash ||
                      checkpoint.chunk?.inputHash !== chunk.inputHash ||
                      checkpoint.configurationHash !== configuration.configurationHash ||
                      checkpoint.promptVersion !== configuration.promptVersion ||
                      checkpoint.processingStrategy !== configuration.processingStrategy) return null;
                  return checkpoint;
                } catch {
                  return null;
                }
              }
              return null;
            },
            saveChunk: async checkpoint => {
              const checkpointDir = path.join(inputData.outputDir, "checkpoints");
              await mkdir(checkpointDir, { recursive: true });
              const checkpointPath = path.join(checkpointDir, `${checkpoint.chunk.chunkId}.json`);
              await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
            },
            saveAttempt: async attempt => {
              extractionAttempts.push(attempt);
              await writeFile(path.join(inputData.outputDir, "structure-attempts.json"),
                `${JSON.stringify(extractionAttempts, null, 2)}\n`);
            },
          },
        });
      } catch (error) {
        const failure = {
          stage: "S3",
          stageName: "Document tree and relationships",
          phase: "structure_extraction",
          status: "failed",
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
          },
          failedAt: new Date().toISOString(),
        };
        await writeFile(path.join(inputData.outputDir, "stage-s3-error.json"),
          `${JSON.stringify(failure, null, 2)}\n`);
        const manifestPath = path.join(inputData.outputDir, "manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        await writeFile(manifestPath, `${JSON.stringify({ ...manifest, status: "failed",
          currentStage: "S3", stages: { ...manifest.stages, S3: "failed" }, error: failure.error,
          failedAt: failure.failedAt }, null, 2)}\n`);
        throw error;
      }

      if (!chunkPlan) {
        chunkPlan = inputData.provider === "kanon" ? {
          schemaVersion: 1, strategy: "provider_managed", provider: "kanon",
          processingStrategy: configuration.processingStrategy,
        } : (providerResult.rawResponse as { chunkPlan?: StructureChunkPlan } | null | undefined)?.chunkPlan ??
          planStructureChunks(sourceMap, {
            targetInputCharacters: LLM_TARGET_INPUT_CHARACTERS,
            hardInputCharacters: LLM_MAX_INPUT_CHARACTERS,
            fixedInputCharacters,
          });
      }

      process.stdout.write(`      ✓ Structure extraction complete (${providerResult.candidate.segments.length} segments identified)\n`);

      // Immediately save chunk-plan.json, structure-response.json, structure-candidate.json
      await Promise.all([
        writeFile(path.join(inputData.outputDir, "chunk-plan.json"), `${JSON.stringify(chunkPlan, null, 2)}\n`),
        writeFile(path.join(inputData.outputDir, "structure-response.json"), `${JSON.stringify(providerResult.rawResponse, null, 2)}\n`),
        writeFile(path.join(inputData.outputDir, "structure-candidate.json"), `${JSON.stringify(providerResult.candidate, null, 2)}\n`),
      ]);
      process.stdout.write(`      ✓ Saved structure artifacts (chunk-plan.json, structure-candidate.json) to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        chunkPlan,
        candidate: providerResult.candidate,
        structureResponse: providerResult.rawResponse,
        structureUsage: providerResult.usage,
        structureUsageAccounting: providerResult.usageAccounting ?? { status: "unavailable",
          attemptedCalls: 0, callsWithUsage: 0, includesDiscardedAttempts: false },
        structureConfiguration: configuration,
      };
    }),
  });

  const detectStructureReferences = createStep({
    id: "detect-structure-references-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "reference_detection", async () => {
      const started = Date.now();
      process.stdout.write(`[5/8] Detecting legal references and cross-references...\n`);
      const sourceVersionId = `pdf-${inputData.pdfHash.slice(0, 16)}`;
      const references = detectReferences(inputData.sourceMap, sourceVersionId);
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Reference detection finished in ${durationSec}s (${references.references.length} references found)\n`);

      // Immediately save references.json
      await writeFile(path.join(inputData.outputDir, "references.json"), `${JSON.stringify(references, null, 2)}\n`);
      process.stdout.write(`      ✓ Saved references.json to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        sourceVersionId,
        references,
      };
    }),
  });

  const reconstructStructure = createStep({
    id: "reconstruct-source-structure-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "reconstruction", async () => {
      const started = Date.now();
      process.stdout.write(`[6/8] Reconstructing legal provisions and relationships...\n`);
      const reconstruction = reconstructSource(inputData.sourceMap, inputData.candidate, inputData.references);
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Reconstructed ${reconstruction.provisions.length} provisions and ${reconstruction.relationships.length} relationships in ${durationSec}s\n`);

      // Immediately save reconstruction.json
      await writeFile(path.join(inputData.outputDir, "reconstruction.json"), `${JSON.stringify(reconstruction, null, 2)}\n`);
      process.stdout.write(`      ✓ Saved reconstruction.json to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        reconstruction,
      };
    }),
  });

  const modelDocumentStructure = createStep({
    id: "build-document-model-structure-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "document_model", async () => {
      const started = Date.now();
      process.stdout.write(`[7/8] Building document hierarchy model and tables...\n`);
      const documentModel = buildDocumentModel(inputData.sourceMap, inputData.reconstruction);
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Document model built in ${durationSec}s (${documentModel.directory.length} directory entries, ${documentModel.tables.length} tables)\n`);

      // Immediately save document-model.json and stage-s3.json
      const stageS3 = {
        stage: "S3",
        stageName: "Document tree and relationships",
        directoryCount: documentModel.directory.length,
        tableCount: documentModel.tables.length,
        relationshipCount: inputData.reconstruction.relationships.length,
        provisionCount: inputData.reconstruction.provisions.length,
        definitionScopeCount: documentModel.definitionScopes.length,
        footnoteCount: documentModel.footnotes.length,
        reviewStatus: documentModel.reviewStatus,
        directory: documentModel.directory,
      };
      await Promise.all([
        writeFile(path.join(inputData.outputDir, "document-model.json"), `${JSON.stringify(documentModel, null, 2)}\n`),
        writeFile(path.join(inputData.outputDir, "stage-s3.json"), `${JSON.stringify(stageS3, null, 2)}\n`),
      ]);
      process.stdout.write(`      ✓ Saved S3 artifacts (document-model.json, stage-s3.json) to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        documentModel,
      };
    }),
  });

  const validateReconstructionStructure = createStep({
    id: "validate-reconstruction-structure-v1",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "validation", async () => {
      const started = Date.now();
      process.stdout.write(`[8/8] Validating reconstructed provisions and coverage...\n`);
      const validation = validateReconstruction(
        inputData.sourceVersionId,
        inputData.sourceMap,
        inputData.reconstruction,
        inputData.documentModel,
      );
      const durationSec = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`      ✓ Validation status: ${validation.status} (${validation.issues.length} issues detected) in ${durationSec}s\n`);

      // Immediately save validation.json
      await writeFile(path.join(inputData.outputDir, "validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
      process.stdout.write(`      ✓ Saved validation.json to ${inputData.outputDir}\n`);

      return {
        ...inputData,
        validation,
      };
    }),
  });

  const saveRunOutput = createStep({
    id: "save-run-output-v1",
    inputSchema: z.any(),
    outputSchema: RunPdfOutputSchema,
    execute: async ({ inputData }) => withStageFailure(inputData, "S3", "finalization", async () => {
      const outputDir = inputData.outputDir;
      process.stdout.write(`[✓] Finalizing run bundle and evaluation manifest in: ${outputDir}...\n`);
      await mkdir(outputDir, { recursive: true });

      const pdfBytes = await readFile(inputData.pdfPath);
      const originalPdfPath = path.join(outputDir, "original.pdf");
      const doclingPath = path.join(outputDir, "docling.json");
      const sourceMapPath = path.join(outputDir, "source-map.json");
      const chunkPlanPath = path.join(outputDir, "chunk-plan.json");
      const structureResponsePath = path.join(outputDir, "structure-response.json");
      const structureAttemptsPath = path.join(outputDir, "structure-attempts.json");
      const structureCandidatePath = path.join(outputDir, "structure-candidate.json");
      const referencesPath = path.join(outputDir, "references.json");
      const reconstructionPath = path.join(outputDir, "reconstruction.json");
      const documentModelPath = path.join(outputDir, "document-model.json");
      const validationPath = path.join(outputDir, "validation.json");
      const manifestPath = path.join(outputDir, "manifest.json");
      const runResultsPath = path.join(outputDir, "run-results.json");

      const durationMs = Date.now() - inputData.startedAt;
      const manifest = {
        runId: inputData.runId,
        pipelineVersion: "kb-run-pdf-v1",
        pdfPath: inputData.pdfPath,
        pdfFileName: inputData.pdfFileName,
        pdfSha256: inputData.pdfHash,
        sourceSha256: inputData.pdfHash,
        sourceTextHash: inputData.sourceMap.textHash,
        byteSize: inputData.byteSize,
        pageCount: inputData.pageCount,
        provider: inputData.provider,
        model: inputData.model,
        datasetId: inputData.datasetId,
        structureConfiguration: inputData.structureConfiguration,
        outputDir,
        status: "completed",
        currentStage: "S3",
        stages: {
          S1: "completed",
          S2: "completed",
          S3: "completed",
        },
        stageArtifacts: {
          S1: ["original.pdf", "stage-s1.json"],
          S2: ["docling.json", "source-map.json", "stage-s2.json"],
          S3: ["chunk-plan.json", "structure-attempts.json", "structure-response.json", "structure-candidate.json", "references.json", "reconstruction.json", "document-model.json", "stage-s3.json", "validation.json"],
        },
        provisionCount: inputData.reconstruction.provisions.length,
        relationshipCount: inputData.reconstruction.relationships.length,
        tableCount: inputData.documentModel.tables.length,
        validationStatus: inputData.validation.status,
        validationIssueCount: inputData.validation.issues.length,
        durationMs,
        createdAt: new Date().toISOString(),
      };

      // Produce standardized evaluation run-results.json format compatible with review dataset
      const unicodeSpans = inputData.sourceMap.spans
        .filter((span: { page: number | null }) => span.page !== null)
        .map((span: { page: number | null; itemRef: string; start: number; end: number }) => ({
          page: span.page,
          itemRef: span.itemRef,
          text: inputData.sourceMap.text.slice(span.start, span.end),
        }));

      const runResults = {
        dataset_id: inputData.datasetId ?? null,
        source_sha256: inputData.pdfHash,
        run_id: inputData.runId,
        provider: inputData.provider,
        model: inputData.model,
        prompt_version: inputData.structureConfiguration.promptVersion,
        pipeline_version: "kb-run-pdf-v1",
        reasoning_setting: process.env.KB_STRUCTURE_REASONING_EFFORT ?? "low",
        model_assignments: [
          { stage: "S1", task: "verify_identity", provider: "native", model: "sha256", reasoning_setting: null, prompt_version: null },
          { stage: "S2", task: "text_extraction", provider: "docling", model: "docling.rs-1.41.0", reasoning_setting: null, prompt_version: null },
          { stage: "S3", task: "structure_extraction", provider: inputData.structureConfiguration.provider,
            model: inputData.structureConfiguration.model,
            reasoning_setting: inputData.provider === "llm" ? process.env.KB_STRUCTURE_REASONING_EFFORT ?? "low" : null,
            prompt_version: inputData.structureConfiguration.promptVersion,
            processing_strategy: inputData.structureConfiguration.processingStrategy,
            configuration_hash: inputData.structureConfiguration.configurationHash },
        ],
        artifacts: {
          page_inventory: { pages: inputData.sourceMap.pages },
          unicode_source_output: { spans: unicodeSpans },
          docling: inputData.doclingDocument,
          source_map: inputData.sourceMap,
          chunk_plan: inputData.chunkPlan,
          structure_candidate: inputData.candidate,
          references: inputData.references,
          reconstruction: inputData.reconstruction,
          document_model: inputData.documentModel,
          validation: inputData.validation,
        },
        metrics: {
          duration_ms: durationMs,
          input_tokens: inputData.structureUsage?.inputTokens ?? null,
          output_tokens: inputData.structureUsage?.outputTokens ?? null,
          total_tokens: inputData.structureUsage?.totalTokens ?? null,
          usage_accounting: inputData.structureUsageAccounting,
          estimated_cost_usd: null,
        },
        results: [],
      };

      await Promise.all([
        writeFile(originalPdfPath, pdfBytes),
        writeFile(doclingPath, `${JSON.stringify(inputData.doclingDocument, null, 2)}\n`),
        writeFile(sourceMapPath, `${JSON.stringify(inputData.sourceMap, null, 2)}\n`),
        writeFile(chunkPlanPath, `${JSON.stringify(inputData.chunkPlan, null, 2)}\n`),
        writeFile(structureResponsePath, `${JSON.stringify(inputData.structureResponse, null, 2)}\n`),
        writeFile(structureAttemptsPath, `${JSON.stringify(
          (inputData.structureResponse as { attempts?: unknown[] } | null)?.attempts ?? [], null, 2)}\n`),
        writeFile(structureCandidatePath, `${JSON.stringify(inputData.candidate, null, 2)}\n`),
        writeFile(referencesPath, `${JSON.stringify(inputData.references, null, 2)}\n`),
        writeFile(reconstructionPath, `${JSON.stringify(inputData.reconstruction, null, 2)}\n`),
        writeFile(documentModelPath, `${JSON.stringify(inputData.documentModel, null, 2)}\n`),
        writeFile(validationPath, `${JSON.stringify(inputData.validation, null, 2)}\n`),
        writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
        writeFile(runResultsPath, `${JSON.stringify(runResults, null, 2)}\n`),
      ]);

      process.stdout.write(`      ✓ Finalized all artifacts and evaluation run manifest in ${outputDir}\n`);

      return {
        runId: inputData.runId,
        pdfHash: inputData.pdfHash,
        outputDir,
        pageCount: inputData.pageCount,
        provisionCount: inputData.reconstruction.provisions.length,
        relationshipCount: inputData.reconstruction.relationships.length,
        validationStatus: inputData.validation.status,
        validationIssueCount: inputData.validation.issues.length,
        manifestPath,
      };
    }),
  });

  return createWorkflow({
    id: "kb-run-pdf-v1",
    inputSchema: RunPdfInputSchema,
    outputSchema: RunPdfOutputSchema,
  })
    .then(verifyPdf)
    .then(extractDocling)
    .then(mapSource)
    .then(extractStructure)
    .then(detectStructureReferences)
    .then(reconstructStructure)
    .then(modelDocumentStructure)
    .then(validateReconstructionStructure)
    .then(saveRunOutput)
    .commit();
}

export const runPdfWorkflow = createRunPdfWorkflow();

