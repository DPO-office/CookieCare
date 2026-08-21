import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";
import type { IntentRequirement } from "../../../models/intent.js";

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
    "nda.ci_definition",
    "Confidential information must be defined",
    "A mutual NDA should define confidential information (and typical exclusions such as public domain, independently developed, and rightfully received information) rather than relying on an unbounded residual duty of secrecy.",
    "nda_definition_gap",
    ["confidentiality", "definitions"]
  ),
  rule(
    "nda.purpose_limitation",
    "Use limited to the stated purpose",
    "Confidential information should be usable only for the disclosed purpose (evaluation, negotiation, or a named project), not for general competitive use.",
    "nda_purpose_limitation_gap",
    ["confidentiality"]
  ),
  rule(
    "nda.return_or_destruction",
    "Return or destruction on request or expiry",
    "The NDA should require return or destruction of confidential information on request or when the purpose ends, with a documented residual-copy exception if needed for legal retention.",
    "nda_return_destruction_gap",
    ["confidentiality", "termination"]
  ),
  rule(
    "nda.nlra_section_7_carveout",
    "Employee-facing confidentiality must not swallow Section 7 activity",
    "Where the NDA or confidentiality covenant binds employees or workers, it should not reasonably be read to prohibit discussing wages, working conditions, or other NLRA Section 7 concerted activity. Boeing-category analysis still requires a legitimate confidentiality interest and a narrowly tailored rule.",
    "nda_nlra_section_7_risk",
    ["confidentiality"],
    "NLRB Boeing Co., 365 NLRB No. 154; ABA Journal of Labor & Employment Law guidance on confidentiality rules that survive NLRB scrutiny (the supplied 'Standard Mutual NDA Blueprint' PDF is this article, not a model NDA)."
  ),
  rule(
    "nda.term_and_survival",
    "Term and survival of confidentiality should be stated",
    "The NDA should state how long the agreement lasts and how long confidentiality duties survive expiry or termination, rather than leaving duration unbounded or silent.",
    "nda_term_survival_gap",
    ["termination", "confidentiality"]
  ),
  rule(
    "nda.governing_law",
    "Governing law or forum should be stated",
    "The NDA should identify a governing law and, where used, a forum or dispute-resolution venue.",
    "nda_governing_law_gap",
    ["governing_law"]
  ),
];

const AUTHORED_REQUIREMENTS: IntentRequirement[] = [
  {
    id: "nda.confidentiality_definition",
    description: "Whether confidential information is defined, including typical exclusions.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "nda.purpose_limitation",
    description: "Whether use of confidential information is limited to a stated purpose.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "nda.return_or_destruction",
    description: "Whether return or destruction of confidential information is required on request or expiry.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "nda.nlra_section_7",
    description: "Whether employee-facing confidentiality language would reasonably restrict NLRA Section 7 activity.",
    type: "adequacy",
    priority: "required",
  },
  {
    id: "nda.term_and_survival",
    description: "Whether the NDA states its term and how long confidentiality survives.",
    type: "adequacy",
    priority: "supporting",
  },
  {
    id: "nda.governing_law",
    description: "Whether the NDA states governing law or forum.",
    type: "adequacy",
    priority: "supporting",
  },
];

export const ndaDocTypeSkill: AnalysisSkillConfig = {
  skillId: "doc-types/nda",
  axis: "doc-type",
  label: "Non-Disclosure Agreement",
  version: "0.1.0",
  docTypeClassifiers: [
    {
      docTypeId: "nda",
      priority: 85,
      patterns: ["\\bnon-?disclosure\\b", "\\bnda\\b", "\\bconfidential information\\b"],
    },
  ],
  appliesToDocTypes: ["nda"],
  triggerPhrases: [
    "nda",
    "non-disclosure",
    "non disclosure agreement",
    "confidentiality agreement",
    "mutual nda",
  ],
  promptLibraryIds: ["nda"],
  clauseTypes: ["confidentiality", "definitions", "termination", "governing_law"],
  clauseTypeDefinitions: {
    confidentiality: "Confidentiality obligations and survival.",
    governing_law: "Choice of law and/or forum.",
  },
  expectedClauses: [
    {
      clauseType: "confidentiality",
      severityIfMissing: "high",
      findingCategory: "weak_confidentiality",
      textSynonyms: ["confidential", "non-disclosure", "non disclosure"],
    },
  ],
  riskCategories: [
    {
      category: "nda_definition_gap",
      displayLabel: "Undefined confidential information",
      guidance: "Confidential information is undefined or unbounded.",
    },
    {
      category: "nda_purpose_limitation_gap",
      displayLabel: "No purpose limitation on use",
      guidance: "Confidential information may be used beyond the stated purpose.",
    },
    {
      category: "nda_return_destruction_gap",
      displayLabel: "Missing return or destruction duty",
      guidance: "No return or destruction obligation on expiry or request.",
    },
    {
      category: "nda_nlra_section_7_risk",
      displayLabel: "Employee confidentiality may restrict Section 7 activity",
      guidance:
        "An employee-facing confidentiality rule may reasonably be read to restrict NLRA Section 7 activity.",
    },
    {
      category: "nda_term_survival_gap",
      displayLabel: "Missing term or survival language",
      guidance: "The NDA does not state its term or how long confidentiality survives.",
    },
    {
      category: "nda_governing_law_gap",
      displayLabel: "Missing governing law",
      guidance: "The NDA does not identify governing law or forum.",
    },
    {
      category: "weak_confidentiality",
      displayLabel: "Weak or one-sided confidentiality",
      guidance: "Confidentiality obligations are weak or one-sided.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  authoredRequirements: AUTHORED_REQUIREMENTS,
  evidencePackages: [
    {
      id: "nda.structural_review",
      kind: "evaluation",
      requirementIds: AUTHORED_REQUIREMENTS.map((r) => r.id),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: ["confidentiality", "definitions", "termination", "governing_law"],
      extractionTargets: [
        "scope_of_confidential_information",
        "permitted_purpose",
        "term",
        "return_or_destruction",
      ],
      sourceMode: "authored",
      requirementKinds: ["adequacy", "verification"],
      packageVersion: "0.1.0",
      label: "NDA structural review",
      report: {
        sections: [
          "scope",
          "requirements_detail",
          "qualifications",
          "recommendations",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Confidentiality",
            requirementTags: ["nda.confidentiality_definition", "nda.purpose_limitation"],
          },
          {
            heading: "Disclosures",
            requirementTags: ["nda.nlra_section_7"],
          },
          {
            heading: "Term and survival",
            requirementTags: ["nda.term_and_survival"],
          },
          {
            heading: "Return and destruction",
            requirementTags: ["nda.return_or_destruction"],
          },
          {
            heading: "Remedies and governing law",
            requirementTags: ["nda.governing_law"],
          },
        ],
      },
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["section 7", "nlra", "nlrb", "boeing", "concerted activity"],
      focus: {
        ruleIds: ["nda.nlra_section_7_carveout"],
        riskCategoryIds: ["nda_nlra_section_7_risk"],
      },
    },
  ],
  defaultOperation: "risk_flag",
};
