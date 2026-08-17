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
    "uk.era.s1.worker_particulars",
    "Written particulars extend to workers, not only employees",
    "A UK employment or worker contract should be capable of functioning as (or sitting with) a section 1 statement of initial employment particulars for a worker, not only an employee. Flag contracts that address employees only, omit worker-status particulars, or assume the old employee-only duty.",
    "uk_worker_particulars_gap",
    ["statement_of_particulars"],
    "Employment Rights Act 1996 s.1 as amended by the Employment Rights (Miscellaneous Amendments) Regulations 2019 (the supplied 'Employment Statutory Terms' PDF)."
  ),
  rule(
    "uk.era.s4.changes",
    "Statement of changes must cover workers",
    "Where particulars change, the written statement of changes duty (ERA 1996 s.4 as amended) applies to workers as well as employees. Flag change-control language that is employee-only.",
    "uk_particulars_change_gap",
    ["statement_of_particulars"],
    "Employment Rights Act 1996 s.4 as amended by SI 2019 (Employment Rights (Miscellaneous Amendments) Regulations)."
  ),
  rule(
    "uk.era.s11.reference",
    "Worker may reference incomplete particulars",
    "ERA 1996 s.11 as amended lets a worker (not only an employee) refer questions about a missing or incomplete statement to an employment tribunal. Flag templates that treat particulars as a courtesy document with no worker remedy path.",
    "uk_particulars_reference_gap",
    ["statement_of_particulars"],
    "Employment Rights Act 1996 s.11 as amended by SI 2019."
  ),
];

export const employmentAgreementSkill: AnalysisSkillConfig = {
  skillId: "doc-types/employment-agreement",
  axis: "doc-type",
  label: "UK employment statutory particulars (overlay)",
  version: "0.1.0",
  appliesToDocTypes: ["employment-agreement"],
  appliesToJurisdictions: ["england-wales"],
  triggerPhrases: [
    "employment agreement",
    "statement of particulars",
    "employment rights act",
    "worker particulars",
    "section 1 statement",
  ],
  promptLibraryIds: ["employment"],
  clauseTypes: ["statement_of_particulars", "governing_law"],
  clauseTypeDefinitions: {
    statement_of_particulars: "Written statement of initial employment / worker particulars and changes.",
    governing_law: "Choice of law and/or forum.",
  },
  expectedClauses: [
    {
      clauseType: "statement_of_particulars",
      severityIfMissing: "high",
      findingCategory: "uk_worker_particulars_gap",
      textSynonyms: ["particulars", "written statement", "terms of employment", "worker"],
    },
  ],
  riskCategories: [
    {
      category: "uk_worker_particulars_gap",
      displayLabel: "Missing worker written particulars",
      guidance: "Written particulars are missing or still drafted as employee-only after the 2019 worker extension.",
    },
    {
      category: "uk_particulars_change_gap",
      displayLabel: "Worker change-of-particulars gap",
      guidance: "Change-of-particulars language does not cover workers.",
    },
    {
      category: "uk_particulars_reference_gap",
      displayLabel: "No worker path to challenge incomplete particulars",
      guidance: "The template treats particulars as optional and ignores the worker's s.11 reference route.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  defaultOperation: "compliance_check",
};
