import { createHash } from "node:crypto";
import type { AnalysisSkillConfig, ComplianceAggregation, SkillRegimeRuleProofElement } from "./types.js";
export interface CompiledComplianceRule {
  skillId: string;
  ruleId: string;
  title: string;
  citation: string;
  version: string;
  hash: string;
  reviewStatus: "authored" | "legal_reviewed";
  proposition: string;
  proofStandard: string;
  guidance: string[];
  applicabilityGuidance: string;
  relationshipScopes: string[];
  elements: Array<SkillRegimeRuleProofElement & {
    kind: NonNullable<SkillRegimeRuleProofElement["kind"]>;
  }>;
  aggregation: ComplianceAggregation;
  relatedRuleIds: string[];
}
/** Exact identity resolution. Never substitutes a package or nearby legal rule. */
export function compileComplianceRule(skills: AnalysisSkillConfig[], skillId: string, ruleId: string): CompiledComplianceRule {
  const owners = skills.filter(s => s.skillId === skillId);
  const rules = owners.flatMap(s => s.regimeRules.filter(r => r.ruleId === ruleId));
  if (owners.length !== 1 || rules.length !== 1)
    throw new Error("baseline_unavailable: ambiguous or missing owner");
  const rule = rules[0];
  if (!rule.investigation?.proofElements.length || !rule.authority?.citation || !rule.investigation.proofStandard.trim()) {
    throw new Error("baseline_unavailable: incomplete legal contract");
  }
  const ids = new Set<string>();
  const elements = rule.investigation.proofElements.map(e => {
    if (!e.id || !e.description.trim() || ids.has(e.id))
      throw new Error("baseline_unavailable: invalid element identity");
    ids.add(e.id);
    // Older required=true is unambiguous. required=false must be authored explicitly.
    const kind = e.kind ?? (e.required ? "mandatory" : undefined);
    if (!kind || !["mandatory", "conditional", "alternative", "optional"].includes(kind) || (kind === "conditional" && !e.applicabilityGuidance?.trim())) {
      throw new Error(`baseline_unavailable: element ${e.id} needs explicit applicability/kind`);
    }
    return { ...e, kind, required: kind === "mandatory" || kind === "conditional" };
  });
  const aggregation: ComplianceAggregation = rule.verification?.aggregation ?? {
    operator: "all", children: elements.filter(e => e.required).map(e => ({ elementId: e.id })),
  };
  function validate(node: ComplianceAggregation): void {
    if ("elementId" in node) {
      if (!ids.has(node.elementId))
        throw new Error("baseline_unavailable: unknown aggregation element");
    }
    else {
      if (!["all", "any"].includes(node.operator) || !node.children.length)
        throw new Error("baseline_unavailable: empty aggregation");
      node.children.forEach(validate);
    }
  }
  validate(aggregation);
  const aggregated = new Set<string>();
  const collect = (node: ComplianceAggregation): void => {
    if ("elementId" in node)
      aggregated.add(node.elementId);
    else
      node.children.forEach(collect);
  };
  collect(aggregation);
  if (elements.some(e => e.required && !aggregated.has(e.id)))
    throw new Error("baseline_unavailable: aggregation omits required element");
  if (elements.some(e => e.kind === "alternative") && !rule.verification?.aggregation)
    throw new Error("baseline_unavailable: alternatives need explicit aggregation");
  const content = {
    skillId, ruleId, title: rule.label ?? ruleId, citation: rule.authority.citation,
    version: rule.verification?.version ?? owners[0].version,
    reviewStatus: rule.verification?.reviewStatus ?? "authored" as const,
    proposition: rule.ruleText, proofStandard: rule.investigation.proofStandard,
    guidance: rule.verification?.guidance ?? [],
    applicabilityGuidance: rule.verification?.applicabilityGuidance ?? "Determine applicability from the actor relationship and trusted scope facts. Silence is unknown, not an exclusion.",
    relationshipScopes: rule.applicability?.relationshipScopes ?? rule.investigation.evidenceScope?.relationshipScopes ?? [], elements, aggregation,
    relatedRuleIds: [...new Set([...(rule.relationships?.requires ?? []), ...(rule.relationships?.supports ?? []), ...(rule.relationships?.relatedTo ?? [])])],
  };
  return { ...content, hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}
