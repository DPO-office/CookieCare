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
    "de.choice_of_law_2708",
    "Delaware choice-of-law is strongly enforceable",
    "A Delaware choice-of-law clause should be treated as creating a significant, material, and reasonable relationship with Delaware regardless of other connections. Prefer language that can sit with 6 Del. C. §2708(a).",
    "de_choice_of_law_weak",
    ["governing_law"],
    "6 Del. C. §2708(a)."
  ),
  rule(
    "de.forum_exclusivity",
    "Forum-selection exclusivity must be express",
    "Pair governing law with an exclusive Delaware forum-selection clause if that is the intent. Under Delaware UETA, a forum clause is not exclusive unless the agreement expressly says so. Enforceability of a Delaware forum clause in a court outside Delaware is less certain — flag as drafting risk.",
    "de_forum_not_exclusive",
    ["governing_law"],
    "Delaware forum-selection practice; UETA — forum clause not exclusive unless expressly stated."
  ),
  rule(
    "de.public_policy_noncompete",
    "Delaware law does not automatically override another state's non-compete public policy",
    "Do not assume a Delaware choice-of-law clause overrides another state's fundamental public policy on non-competes. Delaware courts have limited enforcement in such conflicts. Flag California-touching or similar public-policy clashes.",
    "de_public_policy_noncompete",
    ["non_compete", "governing_law"],
    "Delaware conflict-of-laws limits on using §2708 to defeat another state's fundamental public policy (including non-competes)."
  ),
  rule(
    "de.ueta_esign",
    "Electronic signatures have the same effect as originals",
    "Do not require wet-ink signature for a standard commercial contract governed by Delaware law. Delaware UETA gives electronic signatures and records the same legal effect as originals. No general corporate-seal requirement for ordinary commercial contracts.",
    "de_wet_ink_required",
    ["electronic_signature"],
    "Delaware Uniform Electronic Transactions Act."
  ),
];

export const delawareJurisdictionSkill: AnalysisSkillConfig = {
  skillId: "jurisdictions/delaware",
  axis: "jurisdiction",
  label: "Delaware",
  version: "0.2.0",
  appliesToDocTypes: [],
  triggerPhrases: ["delaware", "de law", "laws of the state of delaware", "6 del. c."],
  promptLibraryIds: ["delaware"],
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
      category: "de_choice_of_law_weak",
      displayLabel: "Weak Delaware choice-of-law clause",
      guidance: "The Delaware governing-law clause is missing or does not sit cleanly with 6 Del. C. §2708.",
    },
    {
      category: "de_forum_not_exclusive",
      displayLabel: "Delaware forum not expressly exclusive",
      guidance: "Forum selection is not expressly exclusive, or exclusivity may fail outside Delaware.",
    },
    {
      category: "de_public_policy_noncompete",
      displayLabel: "Delaware law used to evade another state's non-compete policy",
      guidance:
        "Delaware choice-of-law is used as if it automatically overrides another state's fundamental non-compete public policy.",
    },
    {
      category: "de_wet_ink_required",
      displayLabel: "Unnecessary wet-ink requirement under Delaware UETA",
      guidance: "The contract requires wet-ink execution for a standard commercial contract governed by Delaware law.",
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
      // "de.public_policy_noncompete" deliberately excluded: whether a
      // Delaware choice-of-law clause improperly evades another state's
      // non-compete policy turns on facts outside the four corners of the
      // contract (where the restrained party actually lives/works), not on
      // anything the contract text alone can prove or contradict. Left on
      // the judgment-only path rather than authoring a proof standard the
      // text can't actually satisfy.
      id: "de.structural_review",
      requirementIds: ["de.choice_of_law_2708", "de.forum_exclusivity", "de.ueta_esign"],
      capabilityIds: ["de.choice_of_law_2708", "de.forum_exclusivity", "de.ueta_esign"],
      clauseTypes: ["governing_law", "electronic_signature"],
      extractionTargets: ["choice_of_law_clause", "forum_selection_clause", "esign_clause"],
      requirementEvidence: {
        "de.choice_of_law_2708": {
          hypothesis:
            "The agreement selects Delaware law to govern in language that qualifies for 6 Del. C. §2708(a)'s deeming provision — a written choice-of-law clause in a contract, agreement, or undertaking covering not less than $100,000 in the aggregate.",
          evidenceHints: ["governed by the laws of the State of Delaware", "choice of law", "6 Del. C.", "2708"],
          proofStandard:
            "Proven only by an express written clause selecting Delaware law to " +
            "govern the agreement. A choice-of-law clause naming a different state, " +
            "or one that is silent on governing law entirely, does not satisfy this. " +
            "Note in the finding (do not treat as a proof failure) when the " +
            "agreement's stated value cannot be confirmed to meet the $100,000 " +
            "aggregate threshold that §2708(a)'s deeming provision requires — that " +
            "is a scope caveat on the statute's applicability, not evidence against " +
            "the clause itself.",
        },
        "de.forum_exclusivity": {
          hypothesis:
            "Where the agreement pairs Delaware governing law with a Delaware forum, the forum-selection clause expressly states that the named Delaware forum is exclusive.",
          evidenceHints: ["exclusive jurisdiction", "sole and exclusive forum", "irrevocably submit", "courts of the State of Delaware"],
          proofStandard:
            "Proven only by text expressly using an exclusivity term (e.g. 'exclusive " +
            "jurisdiction,' 'sole and exclusive forum') when naming the Delaware " +
            "forum. A forum clause that merely states the parties 'consent to' or " +
            "'submit to' jurisdiction in Delaware, without an exclusivity term, does " +
            "NOT satisfy this — under Delaware UETA/forum practice, a forum clause is " +
            "not exclusive unless expressly stated, so non-exclusive or ambiguous " +
            "language is a gap. If the agreement contains no Delaware forum clause " +
            "at all (governing law only, no forum selection), this proposition is not " +
            "raised — treat as not applicable.",
        },
        "de.ueta_esign": {
          hypothesis:
            "The agreement treats electronic signatures and records as having the same legal effect as original wet-ink signatures, with no general wet-ink or seal requirement for this ordinary commercial contract.",
          evidenceHints: ["electronic signature", "same force and effect", "counterparts", "wet ink", "original signature"],
          proofStandard:
            "Proven only by text either (a) expressly permitting electronic " +
            "execution with the same effect as an original (e.g. a standard " +
            "'counterparts/electronic signature' boilerplate clause), or (b) " +
            "containing no clause requiring wet-ink or original manual signature. " +
            "Contradicted by text expressly requiring an original, manually-signed, " +
            "or notarized/sealed signature for what is an ordinary commercial " +
            "contract with no statutory seal requirement.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "Delaware jurisdiction overlay review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "conclusion"],
      },
    },
  ],
  comparativeChecks: [
    {
      checkId: "de.non_compete_reasonableness",
      clauseTypesToCompare: ["non_compete"],
      guidance:
        "Delaware courts enforce reasonable non-competes; flag unbounded duration/geography as high risk. Delaware choice-of-law does not automatically override another state's fundamental public policy on non-competes.",
    },
  ],
  defaultOperation: "risk_flag",
};
