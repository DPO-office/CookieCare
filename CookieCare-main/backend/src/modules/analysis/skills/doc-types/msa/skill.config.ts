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
  evidencePackages: [
    {
      id: "msa.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: ["sow_hierarchy", "acceptance", "intellectual_property", "limitation_of_liability"],
      extractionTargets: ["sow_hierarchy", "acceptance_window", "work_product_ownership", "liability_cap"],
      requirementEvidence: {
        "msa.sow_hierarchy": {
          hypothesis:
            "The MSA governs all statements of work issued under it and prevails over conflicting SOW terms unless a SOW expressly identifies the MSA section it overrides.",
          evidenceHints: ["order of precedence", "conflict", "statement of work", "prevails", "governs"],
          proofStandard:
            "Proven only by text stating an explicit order of precedence under which " +
            "the MSA controls over a conflicting SOW, with any override mechanism " +
            "requiring the SOW to expressly identify the MSA provision it displaces " +
            "(not a bare 'the SOW governs' silence). A precedence clause running the " +
            "other way (SOW controls over MSA on conflict) or an agreement silent on " +
            "precedence entirely does not satisfy this.",
        },
        "msa.acceptance_window": {
          hypothesis:
            "The customer has an explicit inspection/testing window before a deliverable is accepted and payment becomes due, rather than deliverables being deemed accepted automatically on delivery.",
          evidenceHints: ["acceptance", "inspection period", "testing window", "deemed accepted", "days to review"],
          proofStandard:
            "Proven only by text stating a specific inspection/testing period during " +
            "which the customer may accept or reject a deliverable before payment is " +
            "due. Contradicted by text stating a deliverable is deemed accepted " +
            "immediately, automatically, or 'upon delivery' with no customer review " +
            "window. Silence on acceptance entirely is a gap, not proof.",
        },
        "msa.work_product_ownership": {
          hypothesis:
            "Custom deliverables and work product created for the customer vest in the customer upon payment, with the vendor retaining only its own pre-existing background IP and granting the customer a license to any pre-existing IP embedded in the deliverables.",
          evidenceHints: ["work product", "deliverables", "vests in", "assigns", "background ip", "pre-existing ip"],
          proofStandard:
            "Proven only by text that assigns or vests ownership of custom deliverables " +
            "in the customer (typically upon payment), while separately preserving " +
            "vendor ownership of its own background/pre-existing IP and granting the " +
            "customer a license to use any such background IP embedded in the " +
            "deliverables. Text that has the vendor retain ownership of custom " +
            "deliverables and merely license them to the customer does NOT satisfy " +
            "this — that is the contradicting position this element is checking for.",
        },
        "msa.liability_cap_baseline": {
          hypothesis:
            "The limitation of liability is mutual and capped at no less than approximately 12 months' fees (or one times annual contract value), with named carve-outs (typically uncapped or super-capped) for IP infringement, confidentiality breach, and gross negligence or willful misconduct.",
          evidenceHints: ["limitation of liability", "aggregate liability", "12 months", "fees paid", "carve-out", "gross negligence"],
          proofStandard:
            "Proven only by text stating a liability cap that (a) applies MUTUALLY to " +
            "both parties (not solely limiting the vendor's liability while leaving " +
            "the customer uncapped, or vice versa), (b) is set at a numeric level " +
            "equal to or greater than approximately 12 months' fees paid or payable " +
            "(or an equivalent ACV-based formulation), and (c) names carve-outs from " +
            "the cap for at least IP infringement, confidentiality breach, and gross " +
            "negligence/willful misconduct. A unilateral cap protecting only the " +
            "vendor, or a cap below the 12-month baseline with no stated carve-outs, " +
            "is a gap, not proof. An uncapped liability clause with no named carve-out " +
            "structure at all does not by itself prove this specific, structured " +
            "baseline either.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "MSA structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "recommendations", "conclusion"],
      },
    },
  ],
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
