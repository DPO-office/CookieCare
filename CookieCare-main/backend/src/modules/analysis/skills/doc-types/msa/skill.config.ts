import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[],
  legalHook?: string
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType: "judgment",
    findingCategory,
    ruleScope: "per_document",
    appliesToClauseTypes,
    ...(legalHook ? { legalHook } : {}),
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "msa.sow_hierarchy",
    "MSA controls SOW conflicts unless expressly overridden",
    "The MSA should govern all statements of work and prevail over conflicting SOW terms unless the SOW expressly identifies the MSA section it overrides.",
    "msa_sow_hierarchy_gap",
    ["sow_hierarchy"],
    "MSA AI Prompt Repository Playbook, Section A1 (SOW hierarchy)."
  ),
  rule(
    "msa.acceptance_window",
    "Explicit deliverable acceptance window",
    "Customer should have an explicit inspection/testing window (playbook baseline 14–30 days) before payment is due. Flag deemed or automatic acceptance on delivery.",
    "msa_deemed_acceptance",
    ["acceptance"],
    "MSA AI Prompt Repository Playbook, Section A2 / guardrail: deemed acceptance on delivery is medium risk."
  ),
  rule(
    "msa.work_product_ownership",
    "Customer owns custom work product upon payment",
    "Custom deliverables / work product should vest in the customer upon payment; vendor retains background IP and grants a licence to use embedded pre-existing IP in the deliverables.",
    "msa_vendor_owns_work_product",
    ["intellectual_property"],
    "MSA AI Prompt Repository Playbook, Sections B1–B2 / IP ownership guardrail."
  ),
  rule(
    "msa.liability_cap_baseline",
    "Mutual cap at least about 12 months' fees, with named exceptions",
    "Playbook baseline is a mutual cap of at least 12 months' fees (1x ACV), with uncapped or super-capped exceptions for IP infringement, confidentiality, and gross negligence. Flag a unilateral vendor cap below that baseline.",
    "msa_weak_liability_cap",
    ["limitation_of_liability"],
    "MSA AI Prompt Repository Playbook, Sections E1–E2."
  ),
];

export const msaDocTypeSkill: AnalysisSkillConfig = {
  skillId: "doc-types/msa",
  axis: "doc-type",
  label: "Master Services Agreement",
  version: "0.1.0",
  docTypeClassifiers: [
    {
      docTypeId: "msa",
      priority: 80,
      patterns: ["\\bmaster service(s)? agreement\\b", "\\bmsa\\b"],
    },
  ],
  extendsDocType: "doc-types/commercial-agreement",
  appliesToDocTypes: ["msa"],
  triggerPhrases: [
    "msa",
    "master services agreement",
    "master service agreement",
    "statement of work hierarchy",
  ],
  promptLibraryIds: ["msa"],
  clauseTypes: ["sow_hierarchy", "acceptance", "intellectual_property", "limitation_of_liability"],
  clauseTypeDefinitions: {
    sow_hierarchy: "Relationship between the MSA and statements of work, including conflict control.",
    acceptance: "Inspection, testing, and acceptance or rejection of deliverables.",
    intellectual_property: "Ownership and license of deliverables / work product.",
    limitation_of_liability: "Cap or exclusion of liability between the parties.",
  },
  expectedClauses: [
    {
      clauseType: "sow_hierarchy",
      severityIfMissing: "high",
      findingCategory: "msa_sow_hierarchy_gap",
      textSynonyms: ["statement of work", "sow", "order of precedence", "conflict"],
    },
    {
      clauseType: "acceptance",
      severityIfMissing: "medium",
      findingCategory: "msa_deemed_acceptance",
      textSynonyms: ["acceptance", "inspection", "testing window"],
    },
  ],
  riskCategories: [
    {
      category: "msa_sow_hierarchy_gap",
      displayLabel: "Missing MSA/SOW conflict hierarchy",
      guidance: "No order of precedence between the MSA and statements of work.",
    },
    {
      category: "msa_deemed_acceptance",
      displayLabel: "Deemed acceptance on delivery",
      guidance: "Deliverables are deemed accepted on delivery without an inspection window.",
    },
    {
      category: "msa_vendor_owns_work_product",
      displayLabel: "Vendor owns custom work product",
      guidance: "Custom deliverables remain with the vendor rather than vesting in the customer on payment.",
    },
    {
      category: "msa_weak_liability_cap",
      displayLabel: "Liability cap below MSA playbook baseline",
      guidance: "Liability cap is unilateral or below about 12 months' fees without named exceptions.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  relatedChecks: [
    {
      primary: "acceptance",
      related: ["payment", "intellectual_property"],
      note: "Acceptance windows are usually checked against invoice timing and work-product vesting.",
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["sow", "statement of work", "order of precedence"],
      focus: {
        ruleIds: ["msa.sow_hierarchy"],
        riskCategoryIds: ["msa_sow_hierarchy_gap"],
      },
    },
    {
      triggerPhrases: ["acceptance", "deemed accepted", "inspection window"],
      focus: {
        ruleIds: ["msa.acceptance_window"],
        riskCategoryIds: ["msa_deemed_acceptance"],
      },
    },
  ],
  defaultOperation: "risk_flag",
};
