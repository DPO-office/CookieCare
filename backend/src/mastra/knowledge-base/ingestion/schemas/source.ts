import { z } from "zod";
import { CitationSchema, IdSchema, KB_SCHEMA_VERSION, LegalDateSchema, RevisionSchema, Sha256Schema, TimestampSchema } from "./common.js";

export const AccessScopeSchema = z.discriminatedUnion("visibility", [
  z.strictObject({ visibility: z.literal("private"), ownerUserId: IdSchema }),
  z.strictObject({ visibility: z.literal("workspace"), ownerUserId: IdSchema, workspaceId: IdSchema }),
  z.strictObject({ visibility: z.literal("curated_shared"), curatorUserId: IdSchema }),
]);

export const SourceSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, instrumentId: IdSchema, title: IdSchema,
  issuer: IdSchema.nullable(), jurisdiction: IdSchema.nullable(), access: AccessScopeSchema,
  authorityStatus: z.enum(["unverified", "verified", "disputed"]),
});

export const SourceVersionSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, sourceId: IdSchema, uploadRevision: RevisionSchema,
  objectKey: IdSchema, checksum: Sha256Schema, originalFileName: IdSchema, mimeType: IdSchema,
  byteSize: z.number().int().positive(), language: IdSchema.nullable(), uploadedAt: TimestampSchema,
  enactedOn: LegalDateSchema, effectiveFrom: LegalDateSchema, effectiveUntil: LegalDateSchema,
  originalPageCount: z.number().int().positive().nullable(), extractionVersion: IdSchema.nullable(),
  supportStatus: z.enum(["pending", "pilot_supported", "review_required", "unsupported", "unreadable"]),
});

export const BoundingBoxSchema = z.strictObject({
  left: z.number().finite(), top: z.number().finite(), right: z.number().finite(), bottom: z.number().finite(),
  coordinateOrigin: z.enum(["top_left", "bottom_left"]),
}).refine(box => box.left <= box.right && box.top <= box.bottom, "Bounding box edges must be ordered");

/** UTF-16 offsets into the retained raw block text, with an exclusive end. */
export const FragmentSchema = z.strictObject({
  blockId: IdSchema, start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).refine(span => span.end > span.start, "Fragment must be nonempty");

export const BlockSchema = z.strictObject({
  id: IdSchema, sourceVersionId: IdSchema, text: z.string(), readingOrder: z.number().int().nonnegative(),
  page: z.number().int().positive(), bbox: BoundingBoxSchema.nullable(),
  extractionMethod: z.enum(["text_layer", "ocr", "docling"]), itemRef: IdSchema,
});

export const ProvisionSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, revision: RevisionSchema, sourceVersionId: IdSchema,
  citation: CitationSchema, parentId: IdSchema.nullable(),
  kind: z.enum(["article", "paragraph", "point", "table", "footnote", "annex", "definition",
    "rule", "schedule", "recital", "chapter", "section", "illustration", "unknown"]),
  originalLabel: IdSchema.nullable().optional(),
  semanticPurposes: z.array(z.enum(["obligation", "definition", "interpretation", "procedure", "context"])).optional(),
  text: z.string().min(1), fragments: z.array(FragmentSchema).min(1),
  reconstructionStatus: z.enum(["complete", "needs_review", "incomplete"]),
  normalization: z.array(z.enum(["whitespace", "line_breaks", "soft_hyphen", "line_end_hyphen"])),
}).refine(p => p.citation.sourceVersionId === p.sourceVersionId, "Citation must identify this source version");

export const BlockDispositionSchema = z.discriminatedUnion("status", [
  z.strictObject({ blockId: IdSchema, status: z.literal("assigned"), provisionIds: z.array(IdSchema).min(1) }),
  z.strictObject({ blockId: IdSchema, status: z.literal("classified"), classification: z.enum(["header", "footer", "page_number", "non_substantive"]), reason: IdSchema }),
  z.strictObject({ blockId: IdSchema, status: z.literal("unresolved"), reason: IdSchema }),
]);

export const CoverageSchema = z.strictObject({
  sourceVersionId: IdSchema, originalPageCount: z.number().int().positive().nullable(),
  pages: z.array(z.strictObject({ page: z.number().int().positive(), status: z.enum(["extracted", "confirmed_empty", "missing", "needs_review"]) })),
  blocks: z.array(BlockDispositionSchema),
  extractionStatus: z.enum(["complete", "partial", "unreadable", "unsupported", "needs_review"]),
  reviewStatus: z.enum(["unreviewed", "partially_reviewed", "reviewed_scope"]), reviewedProvisionIds: z.array(IdSchema),
}).superRefine((coverage, ctx) => {
  const pages = coverage.pages.map(p => p.page);
  if (new Set(pages).size !== pages.length) ctx.addIssue({ code: "custom", message: "Duplicate coverage page" });
  const blocks = coverage.blocks.map(b => b.blockId);
  if (new Set(blocks).size !== blocks.length) ctx.addIssue({ code: "custom", message: "Duplicate block disposition" });
  if (coverage.extractionStatus === "complete" && (
    coverage.originalPageCount === null || pages.length !== coverage.originalPageCount ||
    coverage.pages.some(p => p.page > coverage.originalPageCount! || !["extracted", "confirmed_empty"].includes(p.status)) ||
    coverage.blocks.some(b => b.status === "unresolved")
  )) ctx.addIssue({ code: "custom", message: "Complete extraction needs an independent page inventory and resolved blocks" });
  if (coverage.reviewStatus === "unreviewed" && coverage.reviewedProvisionIds.length) {
    ctx.addIssue({ code: "custom", message: "Unreviewed coverage cannot declare reviewed provisions" });
  }
});

export type Provision = z.infer<typeof ProvisionSchema>;
export type SourceVersion = z.infer<typeof SourceVersionSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type AccessScope = z.infer<typeof AccessScopeSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type SourceFragment = z.infer<typeof FragmentSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
