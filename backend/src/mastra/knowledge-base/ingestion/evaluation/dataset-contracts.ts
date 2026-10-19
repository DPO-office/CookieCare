import { z } from "zod";
import { Sha256Schema } from "../schemas/common.js";

const Id = z.string().trim().min(1);
export const ReviewDatasetCaseSchema = z.object({
  id: Id, stage: z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]),
  title: Id, scope: Id, challenge_type: Id.optional(),
  split: z.enum(["development", "calibration", "held_out"]),
  severity: z.enum(["critical", "major", "minor", "advisory"]),
  source_refs: z.array(Id), physical_pages: z.array(z.number().int().positive()),
  input: z.record(z.string(), z.unknown()), expected: z.record(z.string(), z.unknown()),
  must_not: z.array(Id),
  grading: z.object({ method: Id, match_policy: Id }).passthrough(),
  human_review: z.object({ status: z.enum(["pending", "approved", "changes_requested"]),
    reviewer: z.string().nullable(), reviewed_at: z.string().nullable(), notes: z.string() }).passthrough(),
}).passthrough();

export const ReviewDatasetSchema = z.object({
  schema_version: z.enum(["gdpr-review-dataset/1.0", "gdpr-review-dataset/1.1"]),
  dataset_id: Id, source_family: Id,
  split: z.enum(["development", "calibration", "held_out"]),
  source: z.object({ sha256: Sha256Schema, page_count: z.number().int().positive(),
    byte_size: z.number().int().positive() }).passthrough(),
  stages: z.record(z.string(), Id), cases: z.array(ReviewDatasetCaseSchema).min(1),
}).passthrough().superRefine((dataset, ctx) => {
  const ids = new Set<string>();
  for (const row of dataset.cases) {
    if (ids.has(row.id)) ctx.addIssue({ code: "custom", message: `Duplicate case ${row.id}` });
    ids.add(row.id);
    if (row.split !== dataset.split) ctx.addIssue({ code: "custom", message: `Split mismatch ${row.id}` });
    if (row.physical_pages.some(page => page > dataset.source.page_count))
      ctx.addIssue({ code: "custom", message: `Page outside source PDF ${row.id}` });
    if (row.human_review.status === "approved" && (!row.human_review.reviewer || !row.human_review.reviewed_at))
      ctx.addIssue({ code: "custom", message: `Approval lacks reviewer and date ${row.id}` });
  }
});

export const ReviewRunSchema = z.object({
  dataset_id: Id, source_sha256: Sha256Schema, run_id: Id.nullable(),
  provider: Id.nullable(), model: Id.nullable(), prompt_version: z.string().nullable(),
  pipeline_version: Id.nullable(), reasoning_setting: z.string().nullable(),
  // Record the actual generation configuration for each stage being compared.
  model_assignments: z.array(z.object({ stage: z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]),
    task: Id, provider: Id, model: Id, reasoning_setting: z.string().nullable(),
    prompt_version: z.string().nullable() }).strict()).optional(),
  processing_strategy: Id.nullable().optional(), configuration_hash: Sha256Schema.nullable().optional(),
  // Saved stage outputs are separate from expected answers. Repeated calls may use case-specific keys.
  artifacts: z.record(z.string(), z.unknown()).optional(),
  metrics: z.object({ duration_ms: z.number().nonnegative().nullable(),
    input_tokens: z.number().int().nonnegative().nullable(),
    output_tokens: z.number().int().nonnegative().nullable(),
    estimated_cost_usd: z.number().nonnegative().nullable() }).optional(),
  results: z.array(z.object({ case_id: Id, status: Id, observed: z.unknown().nullable(),
    evidence_refs: z.array(Id), failed_expected_fields: z.array(Id),
    forbidden_claims_found: z.array(Id), reviewer_notes: z.string(),
    blocked_by_case_ids: z.array(Id).optional() }).passthrough()),
}).passthrough();

export const SourcePackSchema = z.object({ source_sha256: Sha256Schema,
  units: z.record(z.string(), z.object({ comparison_text: z.string().optional(),
    fragments: z.array(z.object({ text: z.string() }).passthrough()).optional() }).passthrough()) }).passthrough();

export type ReviewDataset = z.infer<typeof ReviewDatasetSchema>;
export type ReviewDatasetCase = ReviewDataset["cases"][number];
export type ReviewRun = z.infer<typeof ReviewRunSchema>;
