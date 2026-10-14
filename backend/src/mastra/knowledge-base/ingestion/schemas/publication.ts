import { z } from "zod";
import { ExactTextSchema, IdSchema, KB_SCHEMA_VERSION, RevisionRefSchema, Sha256Schema, TimestampSchema, hashText } from "./common.js";

export const ReviewDecisionSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, reviewerUserId: IdSchema,
  targetKind: z.enum(["provision", "requirement", "profile"]), target: RevisionRefSchema, revisionHash: Sha256Schema,
  decision: z.enum(["approve", "reject", "request_changes"]), reason: IdSchema, reviewedAt: TimestampSchema,
});

export const SearchEntrySchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, indexVersion: IdSchema, sourceVersionId: IdSchema,
  recordKind: z.enum(["provision", "requirement", "profile"]), record: RevisionRefSchema,
  purpose: z.enum(["legal_passage", "rule_discovery", "evidence_query"]), proofElementId: IdSchema.nullable(),
  text: ExactTextSchema, textHash: Sha256Schema,
  embedding: z.strictObject({
    model: IdSchema, dimensions: z.number().int().positive(), configurationVersion: IdSchema,
    documentTask: IdSchema, queryTask: IdSchema, vector: z.array(z.number().finite()).min(1),
  }),
}).superRefine((entry, ctx) => {
  if (entry.textHash !== hashText(entry.text)) ctx.addIssue({ code: "custom", message: "Search text hash mismatch" });
  if (entry.embedding.vector.length !== entry.embedding.dimensions) ctx.addIssue({ code: "custom", message: "Vector dimension mismatch" });
  if (entry.purpose === "evidence_query" && !entry.proofElementId) ctx.addIssue({ code: "custom", message: "Evidence query needs a proof element" });
});

export const PublicationManifestSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, manifestHash: Sha256Schema,
  sourceVersionIds: z.array(IdSchema).min(1), reviewedScope: z.array(RevisionRefSchema).min(1),
  approvedRecords: z.array(z.strictObject({
    kind: z.enum(["provision", "requirement", "profile", "relation"]), record: RevisionRefSchema, revisionHash: Sha256Schema, reviewDecisionId: IdSchema,
  })).min(1),
  indexVersion: IdSchema, lexicalStatus: z.enum(["pending", "ready", "failed"]), denseStatus: z.enum(["pending", "ready", "failed"]),
  state: z.enum(["building", "active", "withdrawn", "superseded"]), createdAt: TimestampSchema,
}).refine(p => p.state !== "active" || (p.lexicalStatus === "ready" && p.denseStatus === "ready"), "Active publication needs both indexes ready");

/** Separate lifecycle states; extraction success never implies legal approval. */
export const IngestionStateSchema = z.strictObject({
  extraction: z.enum(["pending", "processing", "complete", "needs_review", "unsupported", "unreadable", "failed"]),
  review: z.enum(["unreviewed", "in_review", "partially_approved", "approved_scope", "rejected"]),
  index: z.enum(["not_started", "building", "ready", "failed"]), publication: z.enum(["unpublished", "active", "withdrawn", "superseded"]),
});

export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type SearchEntry = z.infer<typeof SearchEntrySchema>;
export type PublicationManifest = z.infer<typeof PublicationManifestSchema>;
export type IngestionState = z.infer<typeof IngestionStateSchema>;
