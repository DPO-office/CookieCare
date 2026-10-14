import { RequirementSchema, type Requirement, type RuleProfile } from "../schemas/requirement.js";
import type { BooleanExpression } from "../schemas/legal-structure.js";

export type Truth = true | false | "unknown";

/** Missing facts stay unknown; they never make a conditional duty disappear. */
export function evaluateApplicability(expression: BooleanExpression,
  facts: Readonly<Record<string, Truth>>): Truth {
  if ("constant" in expression) return expression.constant;
  if ("componentId" in expression) return facts[expression.componentId] ?? "unknown";
  if (expression.operator === "not") {
    const value = evaluateApplicability(expression.child, facts);
    return value === "unknown" ? value : !value;
  }
  const values = expression.children.map(child => evaluateApplicability(child, facts));
  if (expression.operator === "all") return values.includes(false) ? false :
    values.includes("unknown") ? "unknown" : true;
  return values.includes(true) ? true : values.includes("unknown") ? "unknown" : false;
}

export interface ContextProvision {
  id: string;
  revision: number;
  sourceVersionId: string;
  text: string;
}
export interface MeaningIssue { code: string; recordId: string; message: string }

/** A generated interpretation is a reviewable proposal, never approval. */
export function validateDraftMeaning(raw: unknown, context: ContextProvision[]): {
  requirement: Requirement; issues: MeaningIssue[] } {
  const requirement = RequirementSchema.parse(raw);
  const issues: MeaningIssue[] = [];
  const byRevision = new Map(context.map(item => [`${item.id}:${item.revision}`, item]));
  if (requirement.reviewStatus === "approved") issues.push({ code: "model_claimed_approval",
    recordId: requirement.id, message: "Model output cannot approve a legal requirement" });
  if (!requirement.meaning) issues.push({ code: "missing_structured_meaning",
    recordId: requirement.id, message: "Conditions, exceptions and deadlines need structured meaning" });
  if (!requirement.sources.some(source => source.role === "target")) issues.push({ code: "missing_target",
    recordId: requirement.id, message: "A requirement needs a target provision" });
  const supports = [...requirement.sources.map(source => ({ provision: source.provision,
    exactQuote: source.exactQuote, start: source.start, end: source.end })),
    ...(requirement.meaning?.components.flatMap(component => component.supportingPassages) ?? [])];
  for (const support of supports) {
    const provision = byRevision.get(`${support.provision.id}:${support.provision.revision}`);
    if (!provision || provision.text.slice(support.start, support.end) !== support.exactQuote ||
        ("sourceVersionId" in support && support.sourceVersionId !== provision.sourceVersionId)) {
      issues.push({ code: "unsupported_quote", recordId: requirement.id,
        message: `Supporting text does not match provision ${support.provision.id}` });
    }
  }
  return { requirement, issues };
}

/** Generated guidance must name a proposed requirement and cite supplied legal wording. */
export function validateDraftProfiles(profiles: RuleProfile[], requirements: Requirement[],
  context: ContextProvision[]): MeaningIssue[] {
  const issues: MeaningIssue[] = [];
  const requirementsByRevision = new Set(requirements.map(item => `${item.id}:${item.revision}`));
  const provisionsByRevision = new Map(context.map(item => [`${item.id}:${item.revision}`, item]));
  const modulesByRequirement = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const requirementKey = `${profile.rule.id}:${profile.rule.revision}`;
    if (!requirementsByRevision.has(requirementKey)) {
      issues.push({ code: "unknown_profile_requirement", recordId: profile.id,
        message: `Profile refers to requirement ${requirementKey} outside this draft` });
    }
    const modules = modulesByRequirement.get(requirementKey) ?? new Set<string>();
    if (modules.has(profile.module)) {
      issues.push({ code: "duplicate_module_profile", recordId: profile.id,
        message: `Duplicate ${profile.module} guidance for ${requirementKey}` });
    }
    modules.add(profile.module);
    modulesByRequirement.set(requirementKey, modules);
    if (profile.reviewStatus === "approved") {
      issues.push({ code: "model_claimed_approval", recordId: profile.id,
        message: "Model output cannot approve module guidance" });
    }
    if (!profile.supportingPassages?.length) {
      issues.push({ code: "unsupported_guidance", recordId: profile.id,
        message: "Module guidance needs exact supporting legal passages" });
    }
    for (const passage of profile.supportingPassages ?? []) {
      const provision = provisionsByRevision.get(`${passage.provision.id}:${passage.provision.revision}`);
      if (!provision || provision.text.slice(passage.start, passage.end) !== passage.exactQuote ||
          passage.sourceVersionId !== provision.sourceVersionId) {
        issues.push({ code: "unsupported_quote", recordId: profile.id,
          message: `Guidance support does not match provision ${passage.provision.id}` });
      }
    }
  }
  for (const requirement of requirements) {
    const identity = `${requirement.id}:${requirement.revision}`;
    const modules = modulesByRequirement.get(identity) ?? new Set<string>();
    for (const module of ["analysis", "drafting", "legal_qa"]) {
      if (!modules.has(module)) issues.push({ code: "missing_module_profile", recordId: requirement.id,
        message: `Missing ${module} guidance for requirement ${identity}` });
    }
  }
  return issues;
}
