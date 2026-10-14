import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";

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
  docTypeClassifiers: [
    {
      docTypeId: "employment-agreement",
      priority: 80,
      patterns: [
        "\\bemployment agreement\\b",
        "\\bemployee\\b.*\\bemployer\\b",
        "\\bstatement of particulars\\b",
      ],
    },
  ],
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
  evidencePackages: [
    {
      // "uk.era.s11.reference" is deliberately NOT included: it is a
      // statutory tribunal-referral right that exists independent of
      // contract text (a worker's ability to refer a missing/incomplete
      // statement to a tribunal is not something the document itself
      // proves or disproves by its wording), so no crisp proofStandard can
      // be authored for it without inventing a proposition the statute
      // does not actually ask the contract to state. Left on the
      // judgment-only path per the task's own guardrail against hollow
      // proof standards.
      id: "employment.uk_particulars_structural_review",
      requirementIds: ["uk.era.s1.worker_particulars", "uk.era.s4.changes"],
      capabilityIds: ["uk.era.s1.worker_particulars", "uk.era.s4.changes"],
      clauseTypes: ["statement_of_particulars", "governing_law"],
      extractionTargets: ["worker_particulars", "particulars_change_notice"],
      requirementEvidence: {
        "uk.era.s1.worker_particulars": {
          hypothesis:
            "The document provides section 1 written particulars (names of the parties, start date, pay, hours, holiday entitlement, place of work, job title or description, and notice periods) and extends them to workers, not only to employees.",
          evidenceHints: [
            "written particulars",
            "statement of employment",
            "worker",
            "start date",
            "notice period",
            "place of work",
          ],
          proofStandard:
            "Proven only by text that (a) sets out the core ERA 1996 s.1 particulars " +
            "(pay, hours, holiday, place of work, job title/description, start date, " +
            "notice), AND (b) does not confine those particulars, or the document's " +
            "coverage, to persons labelled 'employee' where the relationship in " +
            "question is or may be a 'worker' relationship. Contradicted by text that " +
            "defines the statement of particulars as an employee-exclusive document " +
            "(e.g. 'this statement applies to Employees' with no worker-status " +
            "coverage) while the individual signing is engaged as a worker rather " +
            "than an employee. A document that provides the particulars without ever " +
            "restricting them by employment-status label satisfies this even if it " +
            "does not use the word 'worker' expressly.",
        },
        "uk.era.s4.changes": {
          hypothesis:
            "The document requires written notice of any change to the statutory particulars, applicable to workers as well as employees.",
          evidenceHints: [
            "change of particulars",
            "notify",
            "written notice",
            "amendment to terms",
          ],
          proofStandard:
            "Proven only by text obligating written notice of any change to the " +
            "particulars set out above, without restricting that change-notice duty " +
            "to persons labelled 'employee.' A change-notice clause that on its face " +
            "applies only to 'employees,' in a document that also covers workers, is " +
            "a gap, not proof. Silence on change notice entirely is not proof.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "UK worker/employee statutory particulars review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "conclusion"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
