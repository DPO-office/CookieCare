import { z } from "zod";
import { BlockDispositionSchema, BlockSchema, IdSchema, KB_SCHEMA_VERSION, ProvisionSchema, RequirementSchema, TimestampSchema } from "../schemas/index.js";

export const EVALUATION_CORPUS_VERSION = "1.0.0" as const;
export const EvaluationProvisionSchema = ProvisionSchema;
export const EvaluationRequirementSchema = RequirementSchema.pick({
  ruleId: true, actor: true, action: true, object: true, modality: true,
  conditions: true, exceptions: true, alternatives: true,
}).extend({
  supportingCitationPaths: z.array(z.array(IdSchema).min(1)).min(1),
  dependencies: z.array(z.strictObject({ path: z.array(IdSchema).min(1), status: z.enum(["resolved", "unresolved"]) })),
});

export const CaseOutputSchema = z.strictObject({
  caseId: IdSchema,
  provisions: z.array(EvaluationProvisionSchema), requirements: z.array(EvaluationRequirementSchema),
  dispositions: z.array(BlockDispositionSchema),
  coverageStatus: z.enum(["partial", "needs_review", "unsupported", "unreadable"]),
  missingPages: z.array(z.number().int().positive()),
});

export const PipelineRunSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), corpusVersion: z.literal(EVALUATION_CORPUS_VERSION),
  pipelineVersion: IdSchema, cases: z.array(CaseOutputSchema),
});

const HumanReviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({ status: z.literal("human_checked"), reviewerId: IdSchema, reviewedAt: TimestampSchema, note: IdSchema }),
]);

export const EvaluationCaseSchema = z.strictObject({
  id: IdSchema, sourceFamily: IdSchema, sourceVersionId: IdSchema,
  split: z.enum(["development", "calibration", "held_out"]),
  category: z.enum(["gdpr_article28", "layout", "damaged", "unsupported"]),
  description: IdSchema,
  provenance: z.strictObject({
    kind: z.enum(["synthetic", "legal_text_with_synthetic_layout", "original_pdf"]),
    referenceUrl: z.url().nullable(), note: IdSchema,
  }),
  humanReview: HumanReviewSchema,
  pageInventory: z.array(z.number().int().positive()).min(1),
  blocks: z.array(BlockSchema), expected: CaseOutputSchema,
}).superRefine((fixture, ctx) => {
  if (fixture.id !== fixture.expected.caseId) ctx.addIssue({ code: "custom", message: "Expected output belongs to another case" });
  if (fixture.blocks.some(block => block.sourceVersionId !== fixture.sourceVersionId)) ctx.addIssue({ code: "custom", message: "Block belongs to another source version" });
  if (new Set(fixture.blocks.map(b => b.id)).size !== fixture.blocks.length) ctx.addIssue({ code: "custom", message: "Duplicate fixture block" });
  if (new Set(fixture.pageInventory).size !== fixture.pageInventory.length) ctx.addIssue({ code: "custom", message: "Duplicate inventory page" });
  const blocks = new Map(fixture.blocks.map(b => [b.id, b]));
  const provisions = new Map(fixture.expected.provisions.map(p => [p.id, p]));
  if (provisions.size !== fixture.expected.provisions.length) ctx.addIssue({ code: "custom", message: "Duplicate expected provision" });
  if (fixture.blocks.some(b => !fixture.pageInventory.includes(b.page))) ctx.addIssue({ code: "custom", message: "Block page missing from original inventory" });
  for (const provision of fixture.expected.provisions) {
    if (provision.sourceVersionId !== fixture.sourceVersionId) ctx.addIssue({ code: "custom", message: "Expected provision uses another version" });
    if (provision.parentId && !provisions.has(provision.parentId)) ctx.addIssue({ code: "custom", message: "Expected parent is missing" });
    for (const fragment of provision.fragments) {
      const block = blocks.get(fragment.blockId);
      if (!block || fragment.end > block.text.length) ctx.addIssue({ code: "custom", message: "Expected fragment does not address a retained block" });
    }
  }
  const dispositions = fixture.expected.dispositions.map(d => d.blockId);
  if (new Set(dispositions).size !== blocks.size || dispositions.length !== blocks.size || dispositions.some(id => !blocks.has(id))) {
    ctx.addIssue({ code: "custom", message: "Expected output must account for every retained block once" });
  }
  const paths = new Set(fixture.expected.provisions.map(p => JSON.stringify(p.citation.path)));
  for (const requirement of fixture.expected.requirements) {
    if (requirement.supportingCitationPaths.some(path => !paths.has(JSON.stringify(path)))) {
      ctx.addIssue({ code: "custom", message: "Expected supporting provision is absent" });
    }
    if (requirement.dependencies.some(d => d.status === "resolved" && !paths.has(JSON.stringify(d.path)))) {
      ctx.addIssue({ code: "custom", message: "Expected resolved dependency is absent" });
    }
  }
  if (fixture.expected.missingPages.some(page => !fixture.pageInventory.includes(page) || fixture.blocks.some(b => b.page === page))) {
    ctx.addIssue({ code: "custom", message: "Expected missing page disagrees with the original inventory" });
  }
});

export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;
export type CaseOutput = z.infer<typeof CaseOutputSchema>;
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

/** Source versions and generated layout variants must stay in one data split. */
export function validateCorpus(input: unknown[]): EvaluationCase[] {
  const cases = input.map(item => EvaluationCaseSchema.parse(item));
  if (!cases.length) throw new Error("Evaluation corpus must not be empty");
  const ids = new Set<string>();
  const families = new Map<string, EvaluationCase["split"]>();
  const versions = new Map<string, string>();
  for (const fixture of cases) {
    if (ids.has(fixture.id)) throw new Error(`Duplicate evaluation case: ${fixture.id}`);
    ids.add(fixture.id);
    const split = families.get(fixture.sourceFamily);
    if (split && split !== fixture.split) throw new Error(`Source family leaks between splits: ${fixture.sourceFamily}`);
    families.set(fixture.sourceFamily, fixture.split);
    const family = versions.get(fixture.sourceVersionId);
    if (family && family !== fixture.sourceFamily) throw new Error(`Source version has conflicting families: ${fixture.sourceVersionId}`);
    versions.set(fixture.sourceVersionId, fixture.sourceFamily);
  }
  return cases;
}
