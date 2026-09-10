import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";

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
    "aiact.art5.prohibited",
    "No prohibited AI practices",
    "A private provider or deployer must not place on the market or put into service an AI system that constitutes a prohibited practice (e.g. subliminal manipulation causing significant harm, social scoring by private parties in the prohibited form, untargeted scraping of facial images to build a recognition database, or other Article 5 prohibitions). Flag contractual permission to do so.",
    "aiact_prohibited_practice",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 5 — prohibited AI practices (private operators only)."
  ),
  rule(
    "aiact.art16.provider",
    "High-risk AI provider duties",
    "A provider of a high-risk AI system must ensure the system complies with Section 2 requirements (risk management, data governance, technical documentation, record-keeping, transparency to deployers, human oversight, accuracy/robustness/cybersecurity) and must have a quality-management system and EU declaration / CE marking path before placing it on the market.",
    "aiact_provider_duty_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 16 and Section 2 of Chapter III — obligations of providers of high-risk AI systems."
  ),
  rule(
    "aiact.art23.importer",
    "Importer duties before placing on the Union market",
    "An importer of a high-risk AI system must ensure the provider has drawn up technical documentation, that the system bears the CE marking, and that the provider has appointed an authorised representative where required, before placing the system on the Union market.",
    "aiact_importer_duty_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 23 — obligations of importers (private)."
  ),
  rule(
    "aiact.art24.distributor",
    "Distributor verification duties",
    "A distributor must verify CE marking, the EU declaration of conformity, and instructions for use, and must not make a high-risk AI system available where it considers the system not in conformity.",
    "aiact_distributor_duty_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 24 — obligations of distributors (private)."
  ),
  rule(
    "aiact.art26.deployer",
    "High-risk AI deployer duties",
    "A deployer of a high-risk AI system must use it in accordance with the instructions, assign human oversight, monitor operation, keep logs, and complete a fundamental-rights impact assessment where Article 27 applies to that deployer. This skill does not cover public-authority market-surveillance duties.",
    "aiact_deployer_duty_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Arts. 26–27 — obligations of deployers of high-risk AI systems."
  ),
  rule(
    "aiact.art50.transparency",
    "Transparency to affected persons for certain AI systems",
    "Providers and deployers of AI systems that interact with people, generate synthetic content, or perform emotion recognition / biometric categorisation must meet Article 50 transparency duties so affected persons know they are interacting with AI or that content is AI-generated, unless an exemption applies.",
    "aiact_transparency_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 50 — transparency obligations for providers and deployers."
  ),
  rule(
    "aiact.art86.explanation",
    "Affected person's right to explanation",
    "Where a deployer uses a high-risk AI system to make or substantially influence a decision producing legal or similarly significant effects on a person, that affected person should be able to obtain a clear explanation of the role of the AI system and the main elements of the decision. Flag contracts that waive or obstruct this right.",
    "aiact_explanation_right_gap",
    ["ai_system_use"],
    "Regulation (EU) 2024/1689 Art. 86 — right to explanation of individual decision-making."
  ),
];

export const euAiActSkill: AnalysisSkillConfig = {
  skillId: "regimes/ai-governance/eu-ai-act",
  axis: "regime",
  family: "ai-governance",
  label: "EU AI Act (private operators)",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "eu ai act",
    "artificial intelligence act",
    "2024/1689",
    "high-risk ai",
    "prohibited ai",
    "ai provider",
    "ai deployer",
  ],
  promptLibraryIds: ["eu-ai-act", "ai-act"],
  clauseTypes: ["ai_system_use"],
  clauseTypeDefinitions: {
    ai_system_use: "Contractual allocation of AI provider, deployer, importer, or distributor roles and duties.",
  },
  expectedClauses: [
    {
      clauseType: "ai_system_use",
      severityIfMissing: "high",
      findingCategory: "aiact_provider_duty_gap",
      textSynonyms: ["ai system", "high-risk", "provider", "deployer"],
    },
  ],
  riskCategories: [
    {
      category: "aiact_prohibited_practice",
      displayLabel: "Contract permits a prohibited AI practice",
      guidance: "The contract would allow an Article 5 prohibited AI practice.",
    },
    {
      category: "aiact_provider_duty_gap",
      displayLabel: "High-risk AI provider duties missing",
      guidance: "Provider obligations for a high-risk AI system are incomplete.",
    },
    {
      category: "aiact_importer_duty_gap",
      displayLabel: "AI importer duties missing",
      guidance: "Importer verification duties before Union placing on the market are missing.",
    },
    {
      category: "aiact_distributor_duty_gap",
      displayLabel: "AI distributor duties missing",
      guidance: "Distributor CE / conformity verification duties are missing.",
    },
    {
      category: "aiact_deployer_duty_gap",
      displayLabel: "High-risk AI deployer duties missing",
      guidance: "Deployer instructions, human oversight, logging, or FRIA duties are missing.",
    },
    {
      category: "aiact_transparency_gap",
      displayLabel: "AI transparency to affected persons missing",
      guidance: "Article 50 transparency to affected persons is not addressed.",
    },
    {
      category: "aiact_explanation_right_gap",
      displayLabel: "Affected-person explanation right obstructed",
      guidance: "The contract waives or obstructs the Article 86 explanation right.",
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
      id: "aiact.structural_review",
      requirementIds: RULES.map((r) => r.ruleId),
      capabilityIds: RULES.map((r) => r.ruleId),
      clauseTypes: ["ai_system_use"],
      extractionTargets: [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right",
      ],
      requirementEvidence: {
        "aiact.art5.prohibited": {
          hypothesis:
            "The contract does not permit either party to place on the market or put into service an AI system that constitutes an Article 5 prohibited practice (e.g. subliminally manipulative systems causing significant harm, prohibited private social scoring, or untargeted facial-image scraping to build a recognition database).",
          evidenceHints: ["subliminal", "social scoring", "facial recognition database", "manipulative", "exploit vulnerabilities"],
          proofStandard:
            "Proven only by text that either affirmatively prohibits the specific " +
            "Article 5 practices, or, more commonly, contains no language describing " +
            "or authorizing an AI system with those characteristics — the absence of " +
            "any such description in an ordinary commercial AI-use contract is itself " +
            "sufficient (do not require an express negative covenant naming Article " +
            "5 to find this proven). Contradicted only by text that DOES describe or " +
            "authorize a system with a prohibited characteristic — e.g. scope " +
            "language permitting untargeted scraping of facial images to build a " +
            "recognition database, or a social-scoring use case.",
        },
        "aiact.art16.provider": {
          hypothesis:
            "Where a party is acting as the PROVIDER of a high-risk AI system, the contract confirms that party's Section 2 duties (risk management, data governance, technical documentation, record-keeping, transparency to deployers, human-oversight design, accuracy/robustness/cybersecurity) and a quality-management system with an EU declaration/CE-marking path before market placement.",
          evidenceHints: ["provider", "high-risk ai system", "quality management system", "technical documentation", "declaration of conformity", "CE marking"],
          proofStandard:
            "Proven only where the contract identifies a party as PROVIDER of a " +
            "high-risk AI system AND allocates at least the core Section 2 duties to " +
            "that party (technical documentation, risk management, and a conformity/" +
            "CE-marking commitment). A contract that names a party 'Provider' with no " +
            "operative duties attached is a gap. If the contract does not involve a " +
            "high-risk AI system or does not allocate a provider role at all, this " +
            "proposition is not raised — treat as not applicable, not contradicted.",
        },
        "aiact.art23.importer": {
          hypothesis:
            "Where a party is acting as the IMPORTER of a high-risk AI system, the contract confirms that party verifies the provider has prepared technical documentation, that the system bears CE marking, and that an EU authorised representative has been appointed where required, before placing the system on the Union market.",
          evidenceHints: ["importer", "CE marking", "authorised representative", "before placing on the market"],
          proofStandard:
            "Proven only where the contract identifies a party as IMPORTER of a " +
            "high-risk AI system AND commits that party to the pre-market " +
            "verification duties (technical documentation exists, CE marking is " +
            "present, authorised representative appointed where required). If no " +
            "party is identified as an importer, or the AI system is not high-risk, " +
            "this proposition is not raised — treat as not applicable.",
        },
        "aiact.art24.distributor": {
          hypothesis:
            "Where a party is acting as a DISTRIBUTOR of a high-risk AI system, the contract confirms that party verifies CE marking, the EU declaration of conformity, and instructions for use, and does not make the system available where it considers the system non-conforming.",
          evidenceHints: ["distributor", "verify conformity", "declaration of conformity", "instructions for use"],
          proofStandard:
            "Proven only where the contract identifies a party as DISTRIBUTOR of a " +
            "high-risk AI system AND requires that party to verify CE marking, the " +
            "declaration of conformity, and instructions for use before making the " +
            "system available, with a stop-distribution duty if non-conformity is " +
            "identified. If no party is a distributor of a high-risk AI system, this " +
            "proposition is not raised — treat as not applicable.",
        },
        "aiact.art26.deployer": {
          hypothesis:
            "Where a party is acting as the DEPLOYER of a high-risk AI system, the contract confirms that party uses the system per the provider's instructions, assigns human oversight, monitors operation, keeps logs, and (where Article 27 applies to that deployer) completes a fundamental-rights impact assessment.",
          evidenceHints: ["deployer", "human oversight", "in accordance with the instructions for use", "logs", "fundamental rights impact assessment"],
          proofStandard:
            "Proven only where the contract identifies a party as DEPLOYER of a " +
            "high-risk AI system AND allocates at least instructions-compliant use " +
            "and human-oversight duties to that party. A contract naming a " +
            "'Deployer' with no operative oversight/logging duties is a gap. If no " +
            "party is a deployer of a high-risk AI system, this proposition is not " +
            "raised — treat as not applicable.",
        },
        "aiact.art50.transparency": {
          hypothesis:
            "Where the AI system interacts with people, generates synthetic content, or performs emotion recognition or biometric categorisation, the contract requires that affected persons be informed they are interacting with AI or that content is AI-generated, consistent with Article 50, unless an exemption applies.",
          evidenceHints: ["disclose that they are interacting with an ai system", "ai-generated content", "emotion recognition", "biometric categorisation", "label as ai-generated"],
          proofStandard:
            "Proven only where the contract describes an AI system falling within " +
            "Article 50's scope (chatbot/interactive system, synthetic-content " +
            "generation, or emotion-recognition/biometric-categorisation use) AND " +
            "requires disclosure to affected persons of that fact. Contradicted by " +
            "text expressly permitting such a system with no disclosure requirement. " +
            "If the contract describes no in-scope system at all, this proposition " +
            "is not raised — treat as not applicable.",
        },
        "aiact.art86.explanation": {
          hypothesis:
            "Where a deployer uses a high-risk AI system to make or substantially influence a decision producing legal or similarly significant effects on a person, the contract preserves that affected person's ability to obtain a clear explanation of the AI system's role and the main elements of the decision, rather than waiving or obstructing it.",
          polarity: "risk_present",
          evidenceHints: ["waive", "no right to explanation", "final and binding decision", "explanation of the decision"],
          proofStandard:
            "This is a RISK check: proven (the risk is present) only by text that " +
            "expressly waives, disclaims, or otherwise obstructs an affected person's " +
            "right to an explanation of a qualifying automated/AI-assisted decision " +
            "(e.g. 'the AI system's determination is final and not subject to " +
            "explanation or appeal'). A contract that is simply silent on the " +
            "explanation right, or that does not involve a high-risk AI system " +
            "making legal/significant-effect decisions about a natural person, does " +
            "NOT prove this risk — treat as not applicable rather than proved.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "EU AI Act (private operators) structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "requirements_matrix", "material_gaps", "recommendations", "conclusion"],
      },
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["prohibited", "article 5"],
      focus: {
        ruleIds: ["aiact.art5.prohibited"],
        riskCategoryIds: ["aiact_prohibited_practice"],
      },
    },
    {
      triggerPhrases: ["deployer", "article 26", "human oversight"],
      focus: {
        ruleIds: ["aiact.art26.deployer"],
        riskCategoryIds: ["aiact_deployer_duty_gap"],
      },
    },
    {
      triggerPhrases: ["provider", "article 16", "high-risk"],
      focus: {
        ruleIds: ["aiact.art16.provider"],
        riskCategoryIds: ["aiact_provider_duty_gap"],
      },
    },
  ],
  defaultOperation: "compliance_check",
};
