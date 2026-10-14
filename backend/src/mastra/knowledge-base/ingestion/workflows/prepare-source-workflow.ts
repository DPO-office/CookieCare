import { createHash } from "node:crypto";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import pg, { type Pool } from "pg";
import { z } from "zod";
import { DOCLING_CONFIG, DOCLING_VERSION, DoclingPdfExtractor, type PdfExtractor } from "../extraction/docling-pdf.js";
import { buildSourceMap, type SourceMap } from "../extraction/source-map.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";
import { kanonProviderConfiguration } from "../extraction/kanon.js";
import { createAuthorizedProductionStructureProvider } from "../extraction/structure-provider-factory.js";
import { StructureProviderConfigSchema, type CandidateStructure,
  type StructureProvider, type StructureProviderConfig,
  type StructureProviderResult } from "../extraction/structure-provider.js";
import { hashRevision } from "../schemas/common.js";
import { KbArtifactStore, S3ArtifactObjectStore, type ArtifactReference } from "../storage/artifact-store.js";
import { KbJobStore } from "../storage/job-store.js";
import { type ObjectStore, S3ObjectStore } from "../storage/object-store.js";

const JobInput = z.strictObject({ jobId: z.string().min(1), leaseOwner: z.string().min(1) });
const EXTRACT_STAGE_VERSION = "1_41_0";
const Artifact = z.object({ id: z.string(), jobId: z.string(), stage: z.string(), stageVersion: z.string(),
  inputHash: z.string(), kind: z.string(), objectKey: z.string(), contentHash: z.string(),
  byteSize: z.number(), contentType: z.literal("application/json") });
const Extracted = JobInput.extend({ sourceVersionId: z.string(), inputHash: z.string(),
  originalPageCount: z.number().int().positive(), rawArtifact: Artifact,
  existingMapArtifact: Artifact.nullable(), extractionRunId: z.string().nullable(),
  providerConfiguration: StructureProviderConfigSchema, replayedFromJobId: z.string().nullable() });
const Mapped = Extracted.omit({ existingMapArtifact: true }).extend({ mapArtifact: Artifact,
  mappingStatus: z.enum(["mapped", "needs_review"]), warningCount: z.number().int().nonnegative(),
  textHash: z.string() });
const Recorded = Mapped.extend({ extractionRunId: z.string() });
const ProviderCalled = Recorded.extend({ providerResponseArtifact: Artifact });
const Projected = ProviderCalled.extend({ candidateArtifact: Artifact });
const Prepared = Projected.extend({ referencesArtifact: Artifact,
  candidateCount: z.number().int().nonnegative(), referenceCount: z.number().int().nonnegative(),
  preparationStatus: z.enum(["candidate_ready", "needs_review"]) });
const Reconstructed = Prepared.extend({ reconstructionArtifact: Artifact,
  provisionCount: z.number().int().nonnegative(), relationshipCount: z.number().int().nonnegative() });
const Validated = Reconstructed.extend({ validationArtifact: Artifact,
  validationIssueCount: z.number().int().nonnegative() });
const FinalOutput = Validated.omit({ jobId: true, leaseOwner: true, inputHash: true });

type ProviderEnvelope = StructureProviderResult;
type PrepareDescriptor = Record<string, unknown> & {
  sourceVersionId?: string; checksum?: string; parser?: string; parserVersion?: string;
  configurationHash?: string; structureProvider?: unknown; kanonConfigurationHash?: unknown;
  replay?: { sourceJobId: string; originalPageCount: number; extractionRunId: string;
    rawArtifact: ArtifactReference; mapArtifact: ArtifactReference; textHash: string };
};

function providerConfiguration(descriptor: PrepareDescriptor): StructureProviderConfig {
  if (descriptor.structureProvider) return StructureProviderConfigSchema.parse(descriptor.structureProvider);
  if (descriptor.kanonConfigurationHash) return kanonProviderConfiguration();
  throw new Error("Preparation job has no saved structure-provider configuration");
}

export interface PrepareSourceServices {
  pool: Pool; objects: ObjectStore; jobs: KbJobStore; artifacts: KbArtifactStore;
  extractor: PdfExtractor;
  providerFactory?: (configuration: StructureProviderConfig) => StructureProvider;
}

/** Fixed flow: Docling/map -> selected structure provider -> shared reconstruction/validation. */
export function createPrepareSourceWorkflow(resolve: () => PrepareSourceServices) {
  const extract = createStep({ id: "load-or-extract-docling-source-v2", inputSchema: JobInput,
    outputSchema: Extracted, execute: async ({ inputData }) => {
      const { pool, objects, jobs, artifacts, extractor } = resolve();
      const result = await pool.query<{ source_version_id: string; input_hash: string;
        input_descriptor: PrepareDescriptor; object_key: string; checksum: string;
        byte_size: string | number; original_file_name: string; original_page_count: number | null }>(`
        SELECT j.source_version_id, j.input_hash, j.input_descriptor,
          v.object_key, v.checksum, v.byte_size, v.original_file_name, v.original_page_count
        FROM kb_ingestion_jobs j JOIN kb_source_versions v ON v.id = j.source_version_id
        WHERE j.id = $1 AND j.job_type = 'prepare_source' AND j.status = 'running'
          AND j.lease_owner = $2 AND j.lease_until > now() AND j.cancel_requested_at IS NULL`,
      [inputData.jobId, inputData.leaseOwner]);
      const row = result.rows[0];
      if (!row?.source_version_id || !row.original_page_count) throw new Error("Preparation job or page count is invalid");
      const descriptor = row.input_descriptor;
      const configuration = providerConfiguration(descriptor);
      if (descriptor.sourceVersionId !== row.source_version_id || descriptor.checksum !== row.checksum ||
          descriptor.parser !== "docling.rs" || descriptor.parserVersion !== DOCLING_VERSION ||
          descriptor.configurationHash !== hashRevision(DOCLING_CONFIG)) {
        throw new Error("Preparation job configuration no longer matches the source");
      }
      const replay = descriptor.replay;
      if (replay) {
        if (replay.originalPageCount !== row.original_page_count) throw new Error("Replay page count changed");
        const map = await artifacts.readVerified(replay.mapArtifact) as SourceMap;
        await artifacts.readVerified(replay.rawArtifact);
        if (map.textHash !== replay.textHash) throw new Error("Replay source-map hash changed");
        return { ...inputData, sourceVersionId: row.source_version_id, inputHash: row.input_hash,
          originalPageCount: row.original_page_count, rawArtifact: replay.rawArtifact,
          existingMapArtifact: replay.mapArtifact, extractionRunId: replay.extractionRunId,
          providerConfiguration: configuration, replayedFromJobId: replay.sourceJobId };
      }
      const stageHash = KbJobStore.stageHash(row.source_version_id, row.input_hash,
        "extract_docling", EXTRACT_STAGE_VERSION);
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "extract_docling", EXTRACT_STAGE_VERSION, stageHash);
        let rawArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); rawArtifact = cached; }
        else {
          const original = await objects.read(row.object_key);
          if (!original || original.contentType !== "application/pdf" ||
              original.bytes.length !== Number(row.byte_size) ||
              createHash("sha256").update(original.bytes).digest("hex") !== row.checksum) {
            throw new Error("Original PDF is missing or no longer matches its checksum");
          }
          rawArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "extract_docling", EXTRACT_STAGE_VERSION, stageHash, "docling_document",
            await extractor.extract(original.bytes, row.original_file_name));
        }
        return { ...inputData, sourceVersionId: row.source_version_id, inputHash: row.input_hash,
          originalPageCount: row.original_page_count, rawArtifact, existingMapArtifact: null,
          extractionRunId: null, providerConfiguration: configuration, replayedFromJobId: null };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "extract_docling", EXTRACT_STAGE_VERSION, stageHash, error).catch(() => undefined);
        throw error;
      }
    } });

  const map = createStep({ id: "map-or-reuse-docling-source-v2", inputSchema: Extracted,
    outputSchema: Mapped, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      let mapArtifact = inputData.existingMapArtifact;
      let sourceMap: SourceMap;
      if (mapArtifact) sourceMap = await artifacts.readVerified(mapArtifact) as SourceMap;
      else {
        const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash, "source_map", "2");
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId, "source_map", "2", stageHash);
        if (cached) { sourceMap = await artifacts.readVerified(cached) as SourceMap; mapArtifact = cached; }
        else {
          sourceMap = buildSourceMap(await artifacts.readVerified(inputData.rawArtifact), inputData.originalPageCount);
          mapArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "source_map", "2", stageHash, "source_map", sourceMap);
        }
      }
      const { existingMapArtifact: _unused, ...rest } = inputData;
      return { ...rest, mapArtifact, mappingStatus: sourceMap.status,
        warningCount: sourceMap.warnings.length, textHash: sourceMap.textHash };
    } });

  const record = createStep({ id: "record-source-extraction-v2", inputSchema: Mapped,
    outputSchema: Recorded, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const extractionRunId = inputData.extractionRunId ?? hashRevision({ sourceVersionId: inputData.sourceVersionId,
        parser: "docling.rs", version: DOCLING_VERSION, configuration: DOCLING_CONFIG,
        artifactHash: inputData.rawArtifact.contentHash });
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash, "record_extraction", "2");
      await artifacts.readVerified(inputData.rawArtifact);
      await artifacts.readVerified(inputData.mapArtifact);
      return jobs.checkpoint(inputData.jobId, inputData.leaseOwner, "record_extraction", "2", stageHash,
        { ...inputData, extractionRunId }, async client => {
          await client.query(`INSERT INTO kb_extraction_runs
            (id, source_version_id, parser_name, parser_version, configuration,
             configuration_hash, artifact_object_key, artifact_hash)
            VALUES ($1,$2,'docling.rs',$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [
            extractionRunId, inputData.sourceVersionId, DOCLING_VERSION, JSON.stringify(DOCLING_CONFIG),
            hashRevision(DOCLING_CONFIG), inputData.rawArtifact.objectKey, inputData.rawArtifact.contentHash]);
        });
    } });

  const callProvider = createStep({ id: "extract-provider-structure-v1", inputSchema: Recorded,
    outputSchema: ProviderCalled, execute: async ({ inputData }) => {
      const { jobs, artifacts, providerFactory = createAuthorizedProductionStructureProvider } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "structure_provider_response", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "structure_provider_response", "1", stageHash);
        let providerResponseArtifact: ArtifactReference;
        if (cached) {
          await artifacts.readVerified(cached);
          providerResponseArtifact = cached;
        } else {
          const sourceMap = await artifacts.readVerified(inputData.mapArtifact) as SourceMap;
          const provider = providerFactory(inputData.providerConfiguration);
          const response = await provider.extract({ canonicalText: sourceMap.text,
            textHash: sourceMap.textHash, sourceMap,
            configuration: inputData.providerConfiguration });
          providerResponseArtifact = await artifacts.writeCheckpointedJson(inputData.jobId,
            inputData.leaseOwner, "structure_provider_response", "1", stageHash,
            "structure_provider_response", response);
        }
        return { ...inputData, providerResponseArtifact };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "structure_provider_response", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });

  const project = createStep({ id: "persist-provider-candidate-v1", inputSchema: ProviderCalled,
    outputSchema: Projected, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "structure_candidate", "1");
      const envelope = await artifacts.readVerified(inputData.providerResponseArtifact) as ProviderEnvelope;
      if (envelope.candidate.textHash !== inputData.textHash ||
          envelope.candidate.provider !== inputData.providerConfiguration.provider) {
        throw new Error("Structure provider response does not match the saved job input");
      }
      const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
        "structure_candidate", "1", stageHash);
      const candidateArtifact = cached ?? await artifacts.writeCheckpointedJson(inputData.jobId,
        inputData.leaseOwner, "structure_candidate", "1", stageHash,
        "structure_candidate", envelope.candidate);
      await artifacts.readVerified(candidateArtifact);
      return { ...inputData, candidateArtifact };
    } });

  const detect = createStep({ id: "detect-structure-references-v2", inputSchema: Projected,
    outputSchema: Prepared, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "reference_detection", "2");
      const sourceMap = await artifacts.readVerified(inputData.mapArtifact) as SourceMap;
      const candidate = await artifacts.readVerified(inputData.candidateArtifact) as CandidateStructure;
      const detection = detectReferences(sourceMap, inputData.sourceVersionId);
      const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
        "reference_detection", "2", stageHash);
      const referencesArtifact = cached ?? await artifacts.writeCheckpointedJson(inputData.jobId,
        inputData.leaseOwner, "reference_detection", "2", stageHash,
        "detected_references", detection);
      await artifacts.readVerified(referencesArtifact);
      const preparationStatus = inputData.mappingStatus === "needs_review" ||
        inputData.warningCount > 0 || candidate.warnings.length > 0 ||
        candidate.unresolvedItems.length > 0 || detection.warnings.length > 0
        ? "needs_review" as const : "candidate_ready" as const;
      return { ...inputData, referencesArtifact, candidateCount: candidate.segments.length,
        referenceCount: detection.references.length, preparationStatus };
    } });

  const reconstruct = createStep({ id: "reconstruct-provider-structure-v2", inputSchema: Prepared,
    outputSchema: Reconstructed, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "reconstruct_source", "2");
      const [sourceMap, candidate, detection] = await Promise.all([
        artifacts.readVerified(inputData.mapArtifact) as Promise<SourceMap>,
        artifacts.readVerified(inputData.candidateArtifact) as Promise<CandidateStructure>,
        artifacts.readVerified(inputData.referencesArtifact) as Promise<ReturnType<typeof detectReferences>>,
      ]);
      const draft = reconstructSource(sourceMap, candidate, detection);
      const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
        "reconstruct_source", "2", stageHash);
      const reconstructionArtifact = cached ?? await artifacts.writeCheckpointedJson(inputData.jobId,
        inputData.leaseOwner, "reconstruct_source", "2", stageHash,
        "reconstruction_draft", draft);
      await artifacts.readVerified(reconstructionArtifact);
      return { ...inputData, reconstructionArtifact, provisionCount: draft.provisions.length,
        relationshipCount: draft.relationships.length,
        preparationStatus: draft.status === "needs_review" ? "needs_review" : inputData.preparationStatus };
    } });

  const validate = createStep({ id: "validate-provider-reconstruction-v2", inputSchema: Reconstructed,
    outputSchema: Validated, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "validate_reconstruction", "2");
      const [sourceMap, draft] = await Promise.all([
        artifacts.readVerified(inputData.mapArtifact) as Promise<SourceMap>,
        artifacts.readVerified(inputData.reconstructionArtifact) as Promise<ReturnType<typeof reconstructSource>>,
      ]);
      const report = validateReconstruction(inputData.sourceVersionId, sourceMap, draft);
      const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
        "validate_reconstruction", "2", stageHash);
      const validationArtifact = cached ?? await artifacts.writeCheckpointedJson(inputData.jobId,
        inputData.leaseOwner, "validate_reconstruction", "2", stageHash,
        "validation_report", report);
      await artifacts.readVerified(validationArtifact);
      return { ...inputData, validationArtifact, validationIssueCount: report.issues.length,
        preparationStatus: report.status };
    } });

  const recordRun = createStep({ id: "record-structure-provider-run-v1", inputSchema: Validated,
    outputSchema: FinalOutput, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "record_structure_provider_run", "1");
      const envelope = await artifacts.readVerified(inputData.providerResponseArtifact) as ProviderEnvelope;
      const runId = hashRevision({ jobId: inputData.jobId, textHash: inputData.textHash,
        providerConfigurationHash: inputData.providerConfiguration.configurationHash });
      const { jobId, leaseOwner, inputHash: _inputHash, ...output } = inputData;
      return jobs.checkpoint(jobId, leaseOwner, "record_structure_provider_run", "1", stageHash,
        output, async client => {
          await client.query(`INSERT INTO kb_structure_provider_runs
            (id, job_id, source_version_id, source_text_hash, provider, model, prompt_version,
             processing_strategy, provider_configuration, provider_configuration_hash,
             replayed_from_job_id, raw_response_artifact_id, candidate_artifact_id,
             reconstruction_artifact_id, validation_artifact_id, duration_ms, usage)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            ON CONFLICT (id) DO NOTHING`, [runId, jobId, inputData.sourceVersionId,
            inputData.textHash, inputData.providerConfiguration.provider,
            inputData.providerConfiguration.model, inputData.providerConfiguration.promptVersion,
            inputData.providerConfiguration.processingStrategy,
            JSON.stringify(inputData.providerConfiguration),
            inputData.providerConfiguration.configurationHash, inputData.replayedFromJobId,
            inputData.providerResponseArtifact.id, inputData.candidateArtifact.id,
            inputData.reconstructionArtifact.id, inputData.validationArtifact.id,
            envelope.durationMs, envelope.usage ? JSON.stringify(envelope.usage) : null]);
        });
    } });

  return createWorkflow({ id: "kb-prepare-source-v2", inputSchema: JobInput,
    outputSchema: FinalOutput }).then(extract).then(map).then(record).then(callProvider)
    .then(project).then(detect).then(reconstruct).then(validate).then(recordRun).commit();
}

const productionPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const productionObjects = process.env.DO_SPACES_BUCKET ? S3ObjectStore.fromEnvironment() : null;
const productionJobs = productionPool ? new KbJobStore(productionPool) : null;
const productionArtifacts = productionPool && process.env.DO_SPACES_BUCKET
  ? new KbArtifactStore(productionPool, S3ArtifactObjectStore.fromEnvironment(), productionJobs!) : null;

export const prepareSourceWorkflow = createPrepareSourceWorkflow(() => {
  if (!productionPool || !productionObjects || !productionJobs || !productionArtifacts) {
    throw new Error("DATABASE_URL and DO_SPACES_BUCKET are required for source preparation");
  }
  return { pool: productionPool, objects: productionObjects, jobs: productionJobs,
    artifacts: productionArtifacts, extractor: new DoclingPdfExtractor(),
    providerFactory: createAuthorizedProductionStructureProvider };
});
