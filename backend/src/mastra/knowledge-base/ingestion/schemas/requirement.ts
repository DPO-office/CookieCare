import { z } from "zod";
import { ExactTextSchema, IdSchema, KB_SCHEMA_VERSION, RevisionMetadataSchema, RevisionRefSchema } from "./common.js";
import { LegalSupportSchema, RequirementMeaningSchema } from "./legal-structure.js";

export const SupportingSourceSchema = z.strictObject({
  provision: RevisionRefSchema, role: z.enum(["target", "parent", "definition", "dependency", "exception"]),
  exactQuote: ExactTextSchema, start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).refine(s => s.end > s.start, "Source range must be nonempty");

export const RequirementSchema = RevisionMetadataSchema.extend({
  ruleId: IdSchema, title: IdSchema, actor: IdSchema, action: IdSchema, object: IdSchema,
  modality: z.enum(["must", "must_not", "may", "should"]),
  applicability: z.strictObject({ jurisdictions: z.array(IdSchema), relationshipScopes: z.array(IdSchema), guidance: IdSchema }),
  conditions: z.array(IdSchema), exceptions: z.array(IdSchema), alternatives: z.array(IdSchema),
  sources: z.array(SupportingSourceSchema).min(1), unresolvedIssues: z.array(IdSchema),
  meaning: RequirementMeaningSchema.optional(),
  reviewStatus: z.enum(["draft", "review_required", "rejected", "approved"]),
});

export type Aggregation = { elementId: string } | { operator: "all" | "any"; children: Aggregation[] };
export const AggregationSchema: z.ZodType<Aggregation> = z.lazy(() => z.union([
  z.strictObject({ elementId: IdSchema }),
  z.strictObject({ operator: z.enum(["all", "any"]), children: z.array(AggregationSchema).min(1) }),
]));

export const ProofElementSchema = z.strictObject({
  id: IdSchema, description: IdSchema, kind: z.enum(["mandatory", "conditional", "alternative", "optional"]),
  weight: z.number().finite().nonnegative().optional(), applicabilityGuidance: IdSchema.optional(), proofGuidance: IdSchema.optional(),
  nonProofTraps: z.array(IdSchema), remediationGuidance: IdSchema.optional(), evidenceQueries: z.array(IdSchema),
}).refine(e => e.kind !== "conditional" || !!e.applicabilityGuidance, "Conditional proof needs applicability guidance");

export const InvestigationProfileSchema = z.strictObject({
  hypothesis: IdSchema, evidenceHints: z.array(IdSchema), proofStandard: IdSchema,
  proofElements: z.array(ProofElementSchema).min(1), applicabilityGuidance: IdSchema,
  proofGuidance: z.array(IdSchema), nonProofTraps: z.array(IdSchema), remediationGuidance: z.array(IdSchema),
  relationshipScopes: z.array(IdSchema), relatedRuleIds: z.array(IdSchema), verificationVersion: IdSchema, aggregation: AggregationSchema,
}).superRefine((profile, ctx) => {
  const ids = new Set(profile.proofElements.map(e => e.id));
  if (ids.size !== profile.proofElements.length) ctx.addIssue({ code: "custom", message: "Duplicate proof element" });
  const used = new Set<string>();
  function visit(node: Aggregation): void {
    if ("elementId" in node) {
      used.add(node.elementId);
      if (!ids.has(node.elementId)) ctx.addIssue({ code: "custom", message: `Unknown aggregation element: ${node.elementId}` });
    } else node.children.forEach(visit);
  }
  visit(profile.aggregation);
  for (const element of profile.proofElements) {
    if (["mandatory", "conditional"].includes(element.kind) && !used.has(element.id)) {
      ctx.addIssue({ code: "custom", message: `Aggregation omits required element: ${element.id}` });
    }
  }
});

export const DraftingProfileSchema = z.strictObject({
  considerations: z.array(IdSchema), clauseGuidance: z.array(IdSchema), unresolvedIssues: z.array(IdSchema),
});

const ProfileBaseSchema = RevisionMetadataSchema.extend({
  rule: RevisionRefSchema, reviewStatus: z.enum(["draft", "review_required", "rejected", "approved"]),
  supportingPassages: z.array(LegalSupportSchema).optional(),
});
export const RuleProfileSchema = z.discriminatedUnion("module", [
  ProfileBaseSchema.extend({ module: z.literal("analysis"), content: InvestigationProfileSchema }),
  ProfileBaseSchema.extend({ module: z.literal("drafting"), content: DraftingProfileSchema }),
  ProfileBaseSchema.extend({ module: z.literal("legal_qa"), content: z.strictObject({ contextProvisionIds: z.array(IdSchema), limitations: z.array(IdSchema) }) }),
]);

const RelationBaseSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, source: RevisionRefSchema,
  kind: z.enum(["reference", "definition", "exception", "dependency", "alternative"]), evidenceQuote: ExactTextSchema,
});
export const RelationSchema = z.discriminatedUnion("resolution", [
  RelationBaseSchema.extend({ resolution: z.literal("resolved"), target: RevisionRefSchema }),
  RelationBaseSchema.extend({ resolution: z.literal("unresolved"), targetMention: IdSchema, reason: IdSchema }),
]);

export type Requirement = z.infer<typeof RequirementSchema>;
export type InvestigationProfile = z.infer<typeof InvestigationProfileSchema>;
export type RuleProfile = z.infer<typeof RuleProfileSchema>;
export type Relation = z.infer<typeof RelationSchema>;
