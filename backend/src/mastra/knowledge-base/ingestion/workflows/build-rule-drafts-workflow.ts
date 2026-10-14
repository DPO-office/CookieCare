import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { Pool } from "pg";
import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import { RuleProfileSchema } from "../schemas/requirement.js";
import { validateDraftMeaning, validateDraftProfiles } from "../interpretation/legal-meaning.js";
import type { LegalContextPackage } from "../interpretation/context-assembly.js";
import { KbArtifactStore, type ArtifactReference } from "../storage/artifact-store.js";
import { KbJobStore } from "../storage/job-store.js";

const JobInput = z.strictObject({ jobId: z.string().min(1), leaseOwner: z.string().min(1) });
const Artifact = z.object({ id: z.string(), jobId: z.string(), stage: z.string(), stageVersion: z.string(),
  inputHash: z.string(), kind: z.string(), objectKey: z.string(), contentHash: z.string(),
  byteSize: z.number(), contentType: z.literal("application/json") });
const ContextReady = JobInput.extend({ sourceVersionId: z.string(), inputHash: z.string(), contextArtifact: Artifact });
const Proposed = ContextReady.extend({ proposalArtifact: Artifact });
const Output = z.strictObject({ sourceVersionId: z.string(), contextArtifact: Artifact,
  proposalArtifact: Artifact, reviewBundleArtifact: Artifact,
  requirementCount: z.number().int().nonnegative(), profileCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(), status: z.literal("needs_review") });

export interface DraftProposalClient {
  propose(context: LegalContextPackage): Promise<{ requirements: unknown[]; profiles: unknown[] }>;
}
export interface RuleDraftServices {
  pool: Pool; jobs: KbJobStore; artifacts: KbArtifactStore;
  loadAcceptedContext(jobId: string): Promise<LegalContextPackage>;
  proposer: DraftProposalClient;
}

/** Fixed Mastra draft process; the proposer is deliberately supplied by the host. */
export function createBuildRuleDraftsWorkflow(resolve: () => RuleDraftServices) {
  const context = createStep({ id: "assemble-accepted-legal-context-v1", inputSchema: JobInput,
    outputSchema: ContextReady, execute: async ({ inputData }) => {
      const { pool, jobs, artifacts, loadAcceptedContext } = resolve();
      const found = await pool.query<{ source_version_id: string; input_hash: string }>(`
        SELECT source_version_id, input_hash FROM kb_ingestion_jobs
        WHERE id = $1 AND job_type = 'build_rule_drafts' AND status = 'running'
          AND lease_owner = $2 AND lease_until > now() AND cancel_requested_at IS NULL`,
      [inputData.jobId, inputData.leaseOwner]);
      const job = found.rows[0];
      if (!job?.source_version_id) throw new Error("Rule draft job lease is invalid");
      const stageHash = KbJobStore.stageHash(job.source_version_id, job.input_hash, "legal_context", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId, "legal_context", "1", stageHash);
        let contextArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); contextArtifact = cached; }
        else {
          const packageValue = await loadAcceptedContext(inputData.jobId);
          if (!packageValue.complete || packageValue.missing.length) {
            throw new Error("Accepted legal context has unresolved dependencies");
          }
          contextArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "legal_context", "1", stageHash, "legal_context", packageValue);
        }
        return { ...inputData, sourceVersionId: job.source_version_id, inputHash: job.input_hash,
          contextArtifact };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "legal_context", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  const propose = createStep({ id: "propose-legal-meaning-v1", inputSchema: ContextReady,
    outputSchema: Proposed, execute: async ({ inputData }) => {
      const { jobs, artifacts, proposer } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "meaning_proposal", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "meaning_proposal", "1", stageHash);
        let proposalArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); proposalArtifact = cached; }
        else {
          const legalContext = await artifacts.readVerified(inputData.contextArtifact) as LegalContextPackage;
          const raw = await proposer.propose(legalContext);
          if (!Array.isArray(raw.requirements) || !Array.isArray(raw.profiles)) {
            throw new Error("Legal meaning proposal is malformed");
          }
          proposalArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "meaning_proposal", "1", stageHash, "meaning_proposal", raw);
        }
        return { ...inputData, proposalArtifact };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "meaning_proposal", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  const validate = createStep({ id: "validate-rule-draft-bundle-v1", inputSchema: Proposed,
    outputSchema: Output, execute: async ({ inputData }) => {
      const { jobs, artifacts } = resolve();
      const stageHash = KbJobStore.stageHash(inputData.sourceVersionId, inputData.inputHash,
        "draft_review_bundle", "1");
      try {
        const cached = await jobs.completedStep<ArtifactReference>(inputData.jobId,
          "draft_review_bundle", "1", stageHash);
        let reviewBundleArtifact: ArtifactReference;
        if (cached) { await artifacts.readVerified(cached); reviewBundleArtifact = cached; }
        else {
          const legalContext = await artifacts.readVerified(inputData.contextArtifact) as LegalContextPackage;
          const raw = await artifacts.readVerified(inputData.proposalArtifact) as {
            requirements: unknown[]; profiles: unknown[] };
          const validated = raw.requirements.map(item => validateDraftMeaning(item, legalContext.provisions));
          const profiles = raw.profiles.map(item => RuleProfileSchema.parse(item));
          const requirements = validated.map(item => item.requirement);
          const issues = [...validated.flatMap(item => item.issues),
            ...validateDraftProfiles(profiles, requirements, legalContext.provisions)];
          const bundle = { schemaVersion: 1, context: inputData.contextArtifact,
            requirements, profiles, issues,
            status: "needs_review" as const };
          reviewBundleArtifact = await artifacts.writeCheckpointedJson(inputData.jobId, inputData.leaseOwner,
            "draft_review_bundle", "1", stageHash, "draft_review_bundle", bundle);
        }
        const bundle = await artifacts.readVerified(reviewBundleArtifact) as {
          requirements: unknown[]; profiles: unknown[]; issues: unknown[] };
        return { sourceVersionId: inputData.sourceVersionId, contextArtifact: inputData.contextArtifact,
          proposalArtifact: inputData.proposalArtifact, reviewBundleArtifact,
          requirementCount: bundle.requirements.length, profileCount: bundle.profiles.length,
          issueCount: bundle.issues.length, status: "needs_review" as const };
      } catch (error) {
        await jobs.recordStageFailure(inputData.jobId, inputData.leaseOwner,
          "draft_review_bundle", "1", stageHash, error).catch(() => undefined);
        throw error;
      }
    } });
  return createWorkflow({ id: "kb-build-rule-drafts-v1", inputSchema: JobInput, outputSchema: Output })
    .then(context).then(propose).then(validate).commit();
}
