import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { pool } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { KbAccessDeniedError } from "../mastra/knowledge-base/ingestion/storage/source-store.js";
import { KbJobStore } from "../mastra/knowledge-base/ingestion/storage/job-store.js";
import { KbArtifactStore, S3ArtifactObjectStore, type ArtifactReference } from "../mastra/knowledge-base/ingestion/storage/artifact-store.js";
import { S3ObjectStore } from "../mastra/knowledge-base/ingestion/storage/object-store.js";
import { KbUploadService } from "../mastra/knowledge-base/ingestion/storage/upload-service.js";
import { KbReviewService } from "../mastra/knowledge-base/ingestion/storage/review-service.js";
import { KbProvisionCorrectionService } from "../mastra/knowledge-base/ingestion/storage/provision-corrections.js";
import { KbSourceStore } from "../mastra/knowledge-base/ingestion/storage/source-store.js";
import { DOCLING_CONFIG, DOCLING_VERSION } from "../mastra/knowledge-base/ingestion/extraction/docling-pdf.js";
import { resolveStructureProviderConfig } from "../mastra/knowledge-base/ingestion/extraction/structure-provider.js";
import { hashRevision } from "../mastra/knowledge-base/ingestion/schemas/common.js";

const router = Router();
router.use((_req, res, next) => {
  if (process.env.KB_INGESTION_ENABLED?.trim().toLowerCase() !== "true") {
    res.status(503).json({ error: "Knowledge Base ingestion is not enabled" });
    return;
  }
  next();
});
let uploads: KbUploadService | undefined;
const jobs = new KbJobStore(pool);
const reviews = new KbReviewService(pool);
const corrections = new KbProvisionCorrectionService(pool);
const sources = new KbSourceStore(pool);
let artifacts: KbArtifactStore | undefined;

function uploadService(): KbUploadService {
  uploads ??= new KbUploadService(pool, S3ObjectStore.fromEnvironment());
  return uploads;
}

function artifactService(): KbArtifactStore {
  artifacts ??= new KbArtifactStore(pool, S3ArtifactObjectStore.fromEnvironment(), jobs);
  return artifacts;
}

function userId(req: Request): string {
  if (!req.user?.id) throw new KbAccessDeniedError();
  return req.user.id;
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof ZodError) { res.status(400).json({ error: "Invalid request details", issues: error.issues }); return; }
  if (error instanceof KbAccessDeniedError) { res.status(403).json({ error: error.message }); return; }
  if ((error as { code?: string })?.code === "23505") { res.status(409).json({ error: "Knowledge-base record already exists" }); return; }
  if ((error as { code?: string })?.code === "23503") { res.status(400).json({ error: "Related knowledge-base record does not exist" }); return; }
  if (error instanceof Error && /missing|expired|checksum|mismatch|not a PDF|page limit|size limit/i.test(error.message)) {
    res.status(409).json({ error: error.message }); return;
  }
  console.error("KB request failed:", error);
  res.status(500).json({ error: "Knowledge-base request failed" });
}

router.post("/uploads", authenticateToken, async (req, res) => {
  try { res.status(201).json(await uploadService().prepare(userId(req), req.body)); }
  catch (error) { respondError(res, error); }
});

router.post("/uploads/:intentId/complete", authenticateToken, async (req, res) => {
  try { res.status(201).json(await uploadService().complete(userId(req), req.params.intentId)); }
  catch (error) { respondError(res, error); }
});

router.get("/sources/:sourceId/versions/:versionId/read-url", authenticateToken, async (req, res) => {
  try { res.json({ url: await uploadService().signedReadUrl(userId(req), req.params.sourceId, req.params.versionId) }); }
  catch (error) { respondError(res, error); }
});

router.get("/sources/:sourceId/versions/:versionId/review-bundle", authenticateToken, async (req, res) => {
  try {
    const pdfUrl = await uploadService().signedReadUrl(userId(req), req.params.sourceId, req.params.versionId);
    const provisions = await pool.query(`
      SELECT p.id, p.revision, p.kind, p.original_label, p.text, p.citation,
        p.reconstruction_status, p.content_hash,
        (SELECT json_build_object('id', r.id, 'decision', r.decision, 'reason', r.reason,
          'reviewedAt', r.reviewed_at) FROM kb_reviews r
          WHERE r.provision_id = p.id AND r.provision_revision = p.revision
          ORDER BY r.reviewed_at DESC, r.id DESC LIMIT 1) AS latest_review
      FROM kb_provisions p WHERE p.source_version_id = $1
        AND p.revision = (SELECT max(revision) FROM kb_provisions WHERE id = p.id)
      ORDER BY p.id`, [req.params.versionId]);
    const preparation = await pool.query<{ id: string; status: string; result: unknown }>(`
      SELECT id, status, result FROM kb_ingestion_jobs
      WHERE source_version_id = $1 AND job_type = 'prepare_source'
      ORDER BY created_at DESC LIMIT 1`, [req.params.versionId]);
    const structureRuns = await pool.query(`
      SELECT id, job_id AS "jobId", provider, model, prompt_version AS "promptVersion",
        processing_strategy AS "processingStrategy", source_text_hash AS "sourceTextHash",
        provider_configuration_hash AS "providerConfigurationHash",
        replayed_from_job_id AS "replayedFromJobId", duration_ms AS "durationMs", usage, created_at AS "createdAt"
      FROM kb_structure_provider_runs WHERE source_version_id = $1
      ORDER BY created_at DESC`, [req.params.versionId]);
    res.json({ sourceVersionId: req.params.versionId, pdfUrl,
      preparation: preparation.rows[0] ?? null, structureRuns: structureRuns.rows,
      provisions: provisions.rows });
  } catch (error) { respondError(res, error); }
});

router.post("/sources/:sourceId/versions/:versionId/reprepare", authenticateToken, async (req, res) => {
  try {
    await sources.assertSourcePermission(userId(req), req.params.sourceId, "upload");
    const version = await pool.query<{ checksum: string }>(`
      SELECT checksum FROM kb_source_versions WHERE id = $1 AND source_id = $2`,
    [req.params.versionId, req.params.sourceId]);
    if (!version.rows[0]) { res.status(404).json({ error: "Source version not found" }); return; }
    const structureProvider = resolveStructureProviderConfig();
    const current = await pool.query<{ id: string; status: string; preparation_status: string | null }>(`
      SELECT id, status, result->>'preparationStatus' AS preparation_status FROM kb_ingestion_jobs
      WHERE source_version_id = $1 AND job_type = 'prepare_source'
        AND input_descriptor->'structureProvider'->>'configurationHash' = $2
      ORDER BY created_at DESC LIMIT 1`, [req.params.versionId, structureProvider.configurationHash]);
    if (current.rows[0] && !["failed", "cancelled"].includes(current.rows[0].status) &&
        current.rows[0].preparation_status !== "awaiting_kanon") {
      res.json({ jobId: current.rows[0].id, status: current.rows[0].status }); return;
    }
    const older = await pool.query<{ id: string }>(`
      SELECT id FROM kb_ingestion_jobs
      WHERE source_version_id = $1 AND job_type = 'prepare_source' AND status = 'completed'
        AND result->>'preparationStatus' = 'awaiting_kanon'
      ORDER BY created_at DESC LIMIT 1`, [req.params.versionId]);
    if (!older.rows[0]) {
      res.status(409).json({ error: "No completed preparation is awaiting Kanon" }); return;
    }
    const job = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: [req.params.versionId],
      inputDescriptor: { sourceVersionId: req.params.versionId, checksum: version.rows[0].checksum,
        parser: "docling.rs", parserVersion: DOCLING_VERSION,
        configurationHash: hashRevision(DOCLING_CONFIG), structureProvider,
        reason: "reprepare_structure_provider",
        retryOf: current.rows[0]?.id ?? null } });
    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) { respondError(res, error); }
});

const ReplayInput = z.strictObject({
  fromJobId: z.string().min(1).optional(),
  provider: z.enum(["kanon", "llm"]).default("kanon"),
  model: z.string().trim().min(1).optional(),
});

router.post("/sources/:sourceId/versions/:versionId/structure-runs/replay",
  authenticateToken, async (req, res) => {
    try {
      await sources.assertSourcePermission(userId(req), req.params.sourceId, "upload");
      const input = ReplayInput.parse(req.body ?? {});
      if (input.provider === "llm") {
        res.status(409).json({ error:
          "LLM structure transfer is disabled in the production worker until that destination is authorized" });
        return;
      }
      const version = await pool.query<{ checksum: string; original_page_count: number | null }>(`
        SELECT checksum, original_page_count FROM kb_source_versions
        WHERE id = $1 AND source_id = $2`, [req.params.versionId, req.params.sourceId]);
      const sourceVersion = version.rows[0];
      if (!sourceVersion?.original_page_count) {
        res.status(409).json({ error: "Source version or original page count is missing" }); return;
      }
      const replay = await pool.query<{ id: string; result: Record<string, unknown> }>(`
        SELECT id, result FROM kb_ingestion_jobs
        WHERE source_version_id = $1 AND job_type = 'prepare_source' AND status = 'completed'
          AND result IS NOT NULL AND result ? 'rawArtifact' AND result ? 'mapArtifact'
          AND ($2::text IS NULL OR id = $2)
        ORDER BY created_at DESC LIMIT 1`, [req.params.versionId, input.fromJobId ?? null]);
      const prior = replay.rows[0];
      if (!prior) { res.status(409).json({ error: "No completed source map is available to replay" }); return; }
      const result = prior.result as { rawArtifact?: ArtifactReference; mapArtifact?: ArtifactReference;
        extractionRunId?: string; textHash?: string; originalPageCount?: number };
      if (!result.rawArtifact || !result.mapArtifact || !result.extractionRunId || !result.textHash) {
        res.status(409).json({ error: "The selected job does not contain replayable source artifacts" }); return;
      }
      const structureProvider = resolveStructureProviderConfig({ ...process.env,
        KB_STRUCTURE_PROVIDER: "kanon" });
      const job = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: [req.params.versionId],
        inputDescriptor: { sourceVersionId: req.params.versionId, checksum: sourceVersion.checksum,
          parser: "docling.rs", parserVersion: DOCLING_VERSION,
          configurationHash: hashRevision(DOCLING_CONFIG), structureProvider,
          replay: { sourceJobId: prior.id, originalPageCount: sourceVersion.original_page_count,
            extractionRunId: result.extractionRunId, rawArtifact: result.rawArtifact,
            mapArtifact: result.mapArtifact, textHash: result.textHash } } });
      res.status(202).json({ jobId: job.id, status: job.status,
        provider: structureProvider.provider, replayedFromJobId: prior.id });
    } catch (error) { respondError(res, error); }
  });

router.get("/jobs/:jobId", authenticateToken, async (req, res) => {
  try {
    const job = await jobs.getAuthorized(userId(req), req.params.jobId);
    const followup = job.job_type === "intake" ? await pool.query<{ id: string }>(`
      SELECT child.id FROM kb_job_dependencies dependency
      JOIN kb_ingestion_jobs child ON child.id = dependency.job_id
      WHERE dependency.required_job_id = $1 AND child.job_type = 'prepare_source'
        AND child.source_version_id = $2`, [job.id, job.source_version_id]) : null;
    res.json({ id: job.id, type: job.job_type, sourceVersionId: job.source_version_id,
      publicationId: job.publication_id, status: job.status, waitingReason: job.waiting_reason,
      attempts: job.attempts, maxAttempts: job.max_attempts,
      nextAttemptAt: job.next_attempt_at, errorCode: job.error_code, errorMessage: job.error_message,
      result: job.result, prepareJobId: followup?.rows[0]?.id ?? null });
  } catch (error) { respondError(res, error); }
});

router.get("/jobs/:jobId/artifacts/:artifactId", authenticateToken, async (req, res) => {
  try {
    await jobs.getAuthorized(userId(req), req.params.jobId);
    const found = await pool.query<{
      id: string; job_id: string; stage: string; stage_version: string; input_hash: string;
      kind: string; object_key: string; content_hash: string; byte_size: string | number;
      content_type: string;
    }>("SELECT * FROM kb_job_artifacts WHERE id = $1 AND job_id = $2",
    [req.params.artifactId, req.params.jobId]);
    const row = found.rows[0];
    if (!row) { res.status(404).json({ error: "Artifact not found" }); return; }
    const reference: ArtifactReference = { id: row.id, jobId: row.job_id, stage: row.stage,
      stageVersion: row.stage_version, inputHash: row.input_hash, kind: row.kind,
      objectKey: row.object_key, contentHash: row.content_hash, byteSize: Number(row.byte_size),
      contentType: "application/json" };
    const content = await artifactService().readVerified(reference);
    res.json(content);
  } catch (error) { respondError(res, error); }
});

router.post("/jobs/:jobId/cancel", authenticateToken, async (req, res) => {
  try { await jobs.cancel(userId(req), req.params.jobId); res.status(204).end(); }
  catch (error) { respondError(res, error); }
});

router.post("/reviews", authenticateToken, async (req, res) => {
  try { res.status(201).json(await reviews.submit(userId(req), req.body)); }
  catch (error) { respondError(res, error); }
});

router.post("/provisions/:provisionId/correct-kind", authenticateToken, async (req, res) => {
  try { res.status(201).json(await corrections.correctKind(userId(req),
    { ...req.body, provisionId: req.params.provisionId })); }
  catch (error) { respondError(res, error); }
});

export default router;
