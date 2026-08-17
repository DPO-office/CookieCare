import type { AnalysisSkillConfig, SkillRegimeRule } from "../../types.js";

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[],
  legalHook: string
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType: "judgment",
    findingCategory,
    ruleScope: "per_document",
    appliesToClauseTypes,
    legalHook,
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "ca.ueta_mutual_consent",
    "UETA requires prior mutual agreement to transact electronically",
    "Do not assume an electronic signature is automatically valid under California UETA. Both parties should have agreed to conduct the transaction electronically. Prefer an express 'parties agree to conduct this transaction and execute this agreement by electronic means' clause.",
    "ca_ueta_consent_missing",
    ["electronic_signature"],
    "California Uniform Electronic Transactions Act — validity conditioned on prior mutual agreement to transact electronically."
  ),
  rule(
    "ca.commercial_vs_employment_restraint",
    "Distinguish employment non-competes from commercial restraints",
    "Employee non-competes and similar restraints of trade touching a California employee or California governing law are generally void under Bus. & Prof. Code §16600 (including as of 2024 where signed and performed outside California). Purely commercial restrictive covenants between two businesses are assessed under a narrower rule of reason and should be flagged for lawyer judgment rather than auto-voided.",
    "ca_non_compete_unenforceable",
    ["non_compete"],
    "Cal. Bus. & Prof. Code §16600; commercial-vs-employment distinction in the California drafting pack."
  ),
];

export const californiaJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/california",
  axis: "jurisdiction",
  label: "California",
  version: "0.2.0",
  appliesToDocTypes: [],
  triggerPhrases: ["california", "ca law", "cal. bus", "bus. & prof. code"],
  promptLibraryIds: ["california"],
  clauseTypes: ["governing_law", "non_compete", "electronic_signature"],
  clauseTypeDefinitions: {
    governing_law: "Choice of law and/or forum.",
    non_compete: "Post-termination non-compete / restrictive covenant.",
    electronic_signature:
      "Electronic signature validity and any required prior consent to transact electronically.",
  },
  expectedClauses: [],
  riskCategories: [
    {
      category: "ca_non_compete_unenforceable",
      displayLabel: "California non-compete unenforceability",
      guidance:
        "California generally voids employee non-competes (Bus. & Prof. Code §16600); flag as likely unenforceable.",
    },
    {
      category: "ca_ueta_consent_missing",
      displayLabel: "Missing California UETA e-consent",
      guidance:
        "Electronic execution is relied on without prior mutual agreement to transact electronically under California UETA.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  comparativeChecks: [
    {
      checkId: "ca.non_compete_enforceability",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Under Cal. Bus. & Prof. Code §16600, employee non-competes are generally void. Compare any non-compete / customer non-solicit against this baseline and flag as a likely unenforceability gap (sale-of-business carve-outs excepted). Purely commercial restraints between businesses use a narrower rule of reason — flag for lawyer judgment.",
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["non-compete", "noncompete", "restrictive covenant", "16600"],
      focus: {
        ruleIds: ["ca.commercial_vs_employment_restraint"],
        riskCategoryIds: ["ca_non_compete_unenforceable"],
      },
    },
    {
      triggerPhrases: ["ueta", "electronic signature", "e-sign", "e-consent"],
      focus: {
        ruleIds: ["ca.ueta_mutual_consent"],
        riskCategoryIds: ["ca_ueta_consent_missing"],
      },
    },
  ],
  defaultOperation: "risk_flag",
};
