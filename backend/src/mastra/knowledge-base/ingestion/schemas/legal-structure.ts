import { z } from "zod";
import {
  ExactTextSchema, IdSchema, KB_SCHEMA_VERSION, LegalDateSchema, RevisionMetadataSchema,
  RevisionRefSchema, RevisionSchema, Sha256Schema, TimestampSchema,
} from "./common.js";

export const LegalInstrumentSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, title: IdSchema,
  jurisdiction: IdSchema.nullable(), issuer: IdSchema.nullable(),
});

export const LegalVersionSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, instrumentId: IdSchema,
  versionLabel: IdSchema, language: IdSchema.nullable(), publicationIdentifier: IdSchema.nullable(),
  publishedOn: LegalDateSchema, effectiveFrom: LegalDateSchema, effectiveUntil: LegalDateSchema,
}).refine(v => !v.effectiveFrom || !v.effectiveUntil || v.effectiveUntil >= v.effectiveFrom,
  "Legal version effective dates are reversed");

export const SourceLegalVersionLinkSchema = z.strictObject({
  sourceVersionId: IdSchema, revision: RevisionSchema, legalVersionId: IdSchema.nullable(),
  status: z.enum(["proposed", "confirmed", "unresolved"]), evidence: z.array(IdSchema),
}).refine(link => link.status !== "confirmed" || link.legalVersionId !== null,
  "Confirmed identification requires a legal version");

export const ExtractionRunSchema = z.strictObject({
  id: IdSchema, sourceVersionId: IdSchema, parserName: IdSchema, parserVersion: IdSchema,
  configuration: z.record(z.string(), z.unknown()),
  configurationHash: Sha256Schema, artifactObjectKey: IdSchema, artifactHash: Sha256Schema,
  createdAt: TimestampSchema,
});

export const StructuralKindSchema = z.enum([
  "article", "paragraph", "point", "table", "footnote", "annex", "definition",
  "rule", "schedule", "recital", "chapter", "section", "illustration", "unknown",
]);
export const SemanticPurposeSchema = z.enum(["obligation", "definition", "interpretation", "procedure", "context"]);

export const TableCellFragmentSchema = z.strictObject({
  blockId: IdSchema, start: z.number().int().nonnegative(), end: z.number().int().positive(),
  physicalPage: z.number().int().positive(), printedPageLabel: z.string().nullable(),
}).refine(fragment => fragment.end > fragment.start, "Table fragment must be nonempty");

export const TableCellSchema = z.strictObject({
  row: z.number().int().nonnegative(), column: z.number().int().nonnegative(),
  text: z.string(), isHeader: z.boolean(), fragments: z.array(TableCellFragmentSchema).min(1),
});

export const LegalTableSchema = z.strictObject({
  id: IdSchema, provision: RevisionRefSchema, sourceVersionId: IdSchema, caption: z.string().nullable(),
  columns: z.array(z.strictObject({ ordinal: z.number().int().nonnegative(), headerText: z.string().nullable() })).min(1),
  rows: z.array(z.strictObject({ ordinal: z.number().int().nonnegative(), role: z.enum(["data", "header", "repeated_header"]) })).min(1),
  cells: z.array(TableCellSchema).min(1),
}).superRefine((table, ctx) => {
  const rows = new Set(table.rows.map(row => row.ordinal));
  const columns = new Set(table.columns.map(column => column.ordinal));
  if (rows.size !== table.rows.length || columns.size !== table.columns.length) {
    ctx.addIssue({ code: "custom", message: "Table row and column ordinals must be unique" });
  }
  const cells = new Set<string>();
  for (const cell of table.cells) {
    const key = `${cell.row}:${cell.column}`;
    if (cells.has(key) || !rows.has(cell.row) || !columns.has(cell.column)) {
      ctx.addIssue({ code: "custom", message: `Invalid or duplicate table cell: ${key}` });
    }
    cells.add(key);
  }
});

export const ReferenceTargetProposalSchema = z.strictObject({
  citedLabel: ExactTextSchema, target: RevisionRefSchema.nullable(), reason: IdSchema,
});

export const ReferenceOccurrenceSchema = z.strictObject({
  id: IdSchema, revision: RevisionSchema, source: RevisionRefSchema,
  exactMention: ExactTextSchema, start: z.number().int().nonnegative(), end: z.number().int().positive(),
  proposedTargets: z.array(ReferenceTargetProposalSchema), resolutionStatus: z.enum(["unresolved", "ambiguous", "resolved"]),
}).refine(value => value.end > value.start, "Reference range must be nonempty");

export const LegalSupportSchema = z.strictObject({
  sourceVersionId: IdSchema, provision: RevisionRefSchema, exactQuote: ExactTextSchema,
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).refine(value => value.end > value.start, "Supporting passage range must be nonempty");

export const LegalRelationRevisionSchema = RevisionMetadataSchema.extend({
  source: RevisionRefSchema, target: RevisionRefSchema.nullable(),
  referenceOccurrence: RevisionRefSchema.nullable(),
  kind: z.enum(["refers_to", "defines", "exception_to", "depends_on", "alternative_to", "interprets"]),
  basis: z.enum(["explicit", "inferred"]), supportingPassages: z.array(LegalSupportSchema).min(1),
});

export type BooleanExpression =
  | { constant: boolean }
  | { componentId: string }
  | { operator: "all" | "any"; children: BooleanExpression[] }
  | { operator: "not"; child: BooleanExpression };

export const BooleanExpressionSchema: z.ZodType<BooleanExpression> = z.lazy(() => z.union([
  z.strictObject({ constant: z.boolean() }),
  z.strictObject({ componentId: IdSchema }),
  z.strictObject({ operator: z.enum(["all", "any"]), children: z.array(BooleanExpressionSchema).min(1) }),
  z.strictObject({ operator: z.literal("not"), child: BooleanExpressionSchema }),
]));

export const RequirementComponentSchema = z.strictObject({
  id: IdSchema, kind: z.enum(["condition", "exception", "alternative", "deadline"]),
  statement: ExactTextSchema, supportingPassages: z.array(LegalSupportSchema).min(1),
});

/** This is the authoritative meaning for new drafts; legacy flat lists remain readable. */
export const RequirementMeaningSchema = z.strictObject({
  applicabilityExpression: BooleanExpressionSchema,
  components: z.array(RequirementComponentSchema),
}).superRefine((meaning, ctx) => {
  const ids = new Set(meaning.components.map(component => component.id));
  if (ids.size !== meaning.components.length) ctx.addIssue({ code: "custom", message: "Duplicate requirement component" });
  function visit(node: BooleanExpression): void {
    if ("constant" in node) return;
    if ("componentId" in node) {
      if (!ids.has(node.componentId)) ctx.addIssue({ code: "custom", message: `Unknown requirement component: ${node.componentId}` });
    } else if (node.operator === "not") visit(node.child);
    else node.children.forEach(visit);
  }
  visit(meaning.applicabilityExpression);
});

export type LegalInstrument = z.infer<typeof LegalInstrumentSchema>;
export type LegalVersion = z.infer<typeof LegalVersionSchema>;
export type ExtractionRun = z.infer<typeof ExtractionRunSchema>;
export type LegalTable = z.infer<typeof LegalTableSchema>;
export type ReferenceOccurrence = z.infer<typeof ReferenceOccurrenceSchema>;
export type LegalRelationRevision = z.infer<typeof LegalRelationRevisionSchema>;
export type RequirementMeaning = z.infer<typeof RequirementMeaningSchema>;
