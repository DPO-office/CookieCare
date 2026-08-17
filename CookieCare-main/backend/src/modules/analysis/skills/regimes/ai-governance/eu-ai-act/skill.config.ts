import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../types.js";

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
