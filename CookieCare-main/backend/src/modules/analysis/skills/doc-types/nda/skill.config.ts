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
    description:
      "Whether the confidentiality obligations avoid restricting employees' NLRA Section 7 rights to discuss wages, working conditions, or other concerted activity.",
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

/**
 * ACT-Phase 8 — proves the VERIFY primitive is genuinely regime/doc-type
 * agnostic, not just tuned for GDPR: same read-aloud bar, same schema field,
 * zero changes to any ACT capability file. `nda.nlra_section_7`'s
 * description above is deliberately phrased as the PROTECTIVE absence of a
 * restriction (matching every other requirement's "proves = good" polarity)
 * rather than "does this clause create the risk" — so it slots into the same
 * proves/contradicts/insufficient_evidence pipeline as every adequacy check,
 * without needing a separate risk-shaped code path.
 */
const NDA_PROOF_STANDARDS: Record<string, string> = {
  "nda.confidentiality_definition":
    "Proven only by text that (a) defines what counts as Confidential Information " +
    "with reasonable specificity — not merely 'any information disclosed' — AND " +
    "(b) states the standard exclusions: information that is public, " +
    "independently developed, rightfully received from a third party without a " +
    "confidentiality restriction, or already known before disclosure. This is a " +
    "MUTUAL NDA, so the definition and its exclusions must bind BOTH parties " +
    "symmetrically (each is both a discloser and a recipient) — a definition " +
    "that only restricts one named party's use of the other's information, " +
    "while leaving the other party's own information unprotected, does not " +
    "satisfy this for a mutual instrument. A bare statement that the parties " +
    "'may share confidential information,' with no specific definition or no " +
    "exclusions, is insufficient.",
  "nda.purpose_limitation":
    "Proven only by text that names a specific permitted purpose (e.g. " +
    "'evaluating a potential business relationship,' 'the Project') and " +
    "restricts USE of confidential information to that purpose. A clause that " +
    "only prohibits disclosure to third parties, without also restricting the " +
    "receiving party's own internal use of the information to the stated " +
    "purpose, does not satisfy this — non-disclosure and use-limitation are " +
    "different obligations. General business-cooperation language with no " +
    "named purpose is insufficient.",
  "nda.return_or_destruction":
    "Proven only by text obligating a party to return or destroy the other's " +
    "confidential information upon request, termination, or completion of the " +
    "stated purpose. A clause merely stating a party 'may request return,' " +
    "without the receiving party being independently obligated to comply, does " +
    "not satisfy this. A residual-copy exception for legal/compliance " +
    "retention is consistent with this requirement and does not defeat it.",
  "nda.nlra_section_7":
    "Proven only by text that either (a) expressly carves out discussions of " +
    "wages, working conditions, or other NLRA Section 7 protected concerted " +
    "activity from the confidentiality duty, or (b) confines the confidentiality " +
    "duty to genuinely commercial/trade-secret information with no plausible " +
    "reading that reaches wages or working conditions — e.g. a mutual NDA " +
    "between two contracting businesses that never addresses either party's own " +
    "employees at all. Contradicted only by text that, on its plain terms, " +
    "would restrict employees or workers from discussing wages, working " +
    "conditions, or other concerted activity, with no such carve-out. If the " +
    "instrument has no employee-facing confidentiality language at all (a pure " +
    "business-to-business NDA), this proposition is not raised by anything in " +
    "the text — treat as irrelevant, not proved.",
  "nda.term_and_survival":
    "Proven only by text stating (a) how long the agreement itself lasts, AND " +
    "(b) how long the confidentiality duty survives after expiry or " +
    "termination (an explicit survival period, or 'indefinitely' if that is " +
    "what the text actually says). A clause stating only the agreement's term " +
    "with no separate survival statement is partial, not proven — silence on " +
    "survival is a real gap, not something to infer favorably. Do not treat a " +
    "termination-for-convenience clause as answering this; termination rights " +
    "and confidentiality survival are different questions.",
  "nda.governing_law":
    "Proven only by text naming a specific governing law (a named jurisdiction " +
    "or body of law) or a specific forum/venue for disputes. A clause " +
    "referencing 'applicable law' without naming which law, or a generic " +
    "dispute-resolution clause with no named forum, does not satisfy this.",
};

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
      requirementEvidence: Object.fromEntries(
        AUTHORED_REQUIREMENTS.map((r) => [
          r.id,
          { hypothesis: r.description, proofStandard: NDA_PROOF_STANDARDS[r.id] },
        ])
      ),
      sourceMode: "authored",
      requirementKinds: ["adequacy", "verification"],
      packageVersion: "0.1.0",
      label: "NDA structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: [
          "executive_summary",
          "key_findings",
          "material_gaps",
          "recommendations",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Confidentiality",
            sectionId: "key_findings",
            requirementTags: ["nda.confidentiality_definition", "nda.purpose_limitation"],
          },
          {
            heading: "Disclosures",
            sectionId: "key_findings",
            requirementTags: ["nda.nlra_section_7"],
          },
          {
            heading: "Term and survival",
            sectionId: "key_findings",
            requirementTags: ["nda.term_and_survival"],
          },
          {
            heading: "Return and destruction",
            sectionId: "key_findings",
            requirementTags: ["nda.return_or_destruction"],
          },
          {
            heading: "Remedies and governing law",
            sectionId: "key_findings",
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
