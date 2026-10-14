import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";
import { finalizeRegimeRuleContracts } from "../../../runtime/catalog/rule-contract-helpers.js";


const RULES: SkillRegimeRule[] = [
  {
    "ruleId": "aiact.art5.prohibited",
    "label": "No prohibited AI practices",
    "ruleText": "A private provider or deployer must not place on the market or put into service an AI system that constitutes a prohibited practice (e.g. subliminal manipulation causing significant harm, social scoring by private parties in the prohibited form, untargeted scraping of facial images to build a recognition database, or other Article 5 prohibitions). Flag contractual permission to do so.",
    "checkType": "judgment",
    "findingCategory": "aiact_prohibited_practice",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 5 — prohibited AI practices (private operators only).",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 5 — prohibited AI practices (private operators only).",
      "provisionPath": [
        "aiact.art5.prohibited"
      ],
      "citationAliases": [
        "aiact.art5.prohibited",
        "Regulation (EU) 2024/1689 Art. 5 — prohibited AI practices (private operators only)."
      ]
    },
    "selection": {
      "aliases": [
        "no prohibited ai practices",
        "subliminal",
        "social scoring",
        "facial recognition database",
        "manipulative",
        "exploit vulnerabilities"
      ],
      "concepts": [
        "prohibited",
        "practices",
        "private",
        "provider",
        "deployer",
        "place",
        "market",
        "service",
        "system",
        "constitutes",
        "practice",
        "subliminal",
        "manipulation",
        "causing",
        "significant",
        "harm",
        "social",
        "scoring",
        "parties",
        "form",
        "untargeted",
        "scraping",
        "facial",
        "images",
        "recognition",
        "database",
        "manipulative",
        "exploit",
        "vulnerabilities"
      ],
      "actors": [
        "provider",
        "deployer"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The contract does not permit either party to place on the market or put into service an AI system that constitutes an Article 5 prohibited practice (e.g. subliminally manipulative systems causing significant harm, prohibited private social scoring, or untargeted facial-image scraping to build a recognition database).",
      "evidenceHints": [
        "subliminal",
        "social scoring",
        "facial recognition database",
        "manipulative",
        "exploit vulnerabilities"
      ],
      "proofStandard": "Proven only by text that either affirmatively prohibits the specific Article 5 practices, or, more commonly, contains no language describing or authorizing an AI system with those characteristics — the absence of any such description in an ordinary commercial AI-use contract is itself sufficient (do not require an express negative covenant naming Article 5 to find this proven). Contradicted only by text that DOES describe or authorize a system with a prohibited characteristic — e.g. scope language permitting untargeted scraping of facial images to build a recognition database, or a social-scoring use case.",
      "proofElements": [
        {
          "id": "operative_prohibition",
          "description": "The contract does not authorise an Article 5 prohibited AI practice",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "applicable_practice_controls",
          "description": "Controls address the prohibited-practice category raised by the described AI use",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "aiact.art5.prohibited"
  },
  {
    "ruleId": "aiact.art16.provider",
    "label": "High-risk AI provider duties",
    "ruleText": "A provider of a high-risk AI system must ensure the system complies with Section 2 requirements (risk management, data governance, technical documentation, record-keeping, transparency to deployers, human oversight, accuracy/robustness/cybersecurity) and must have a quality-management system and EU declaration / CE marking path before placing it on the market.",
    "checkType": "judgment",
    "findingCategory": "aiact_provider_duty_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 16 and Section 2 of Chapter III — obligations of providers of high-risk AI systems.",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 16 and Section 2 of Chapter III — obligations of providers of high-risk AI systems.",
      "provisionPath": [
        "aiact.art16.provider"
      ],
      "citationAliases": [
        "aiact.art16.provider",
        "Regulation (EU) 2024/1689 Art. 16 and Section 2 of Chapter III — obligations of providers of high-risk AI systems."
      ]
    },
    "selection": {
      "aliases": [
        "high-risk ai provider duties",
        "provider",
        "high-risk ai system",
        "quality management system",
        "technical documentation",
        "declaration of conformity",
        "ce marking"
      ],
      "concepts": [
        "high-risk",
        "provider",
        "duties",
        "system",
        "ensure",
        "complies",
        "section",
        "requirements",
        "risk",
        "management",
        "data",
        "governance",
        "technical",
        "documentation",
        "record-keeping",
        "transparency",
        "deployers",
        "human",
        "oversight",
        "accuracy",
        "robustness",
        "cybersecurity",
        "quality-management",
        "declaration",
        "quality",
        "conformity",
        "marking"
      ],
      "actors": [
        "provider",
        "deployer"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a party is acting as the PROVIDER of a high-risk AI system, the contract confirms that party's Section 2 duties (risk management, data governance, technical documentation, record-keeping, transparency to deployers, human-oversight design, accuracy/robustness/cybersecurity) and a quality-management system with an EU declaration/CE-marking path before market placement.",
      "evidenceHints": [
        "provider",
        "high-risk ai system",
        "quality management system",
        "technical documentation",
        "declaration of conformity",
        "CE marking"
      ],
      "proofStandard": "Proven only where the contract identifies a party as PROVIDER of a high-risk AI system AND allocates at least the core Section 2 duties to that party (technical documentation, risk management, and a conformity/CE-marking commitment). A contract that names a party 'Provider' with no operative duties attached is a gap. If the contract does not involve a high-risk AI system or does not allocate a provider role at all, this proposition is not raised — treat as not applicable, not contradicted.",
      "proofElements": [
        {
          "id": "section_2_controls",
          "description": "The provider addresses risk management, data governance, documentation, records, transparency, oversight, accuracy, robustness, and cybersecurity",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "quality_management",
          "description": "The provider maintains a quality-management system",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "conformity_and_marking",
          "description": "Conformity declaration and CE-marking duties apply before market placement",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Where a party is the provider of a high-risk AI system, the contract allocates a risk-management obligation for that system. Proof: Look for operative risk-management duties allocated to the identified provider — not merely naming a party 'Provider'. Non-proof: A contract naming a party 'Provider' with no operative risk-management duties attached. A general AI compliance recital with no provider-specific risk-management allocation. Remediation: Allocate risk-management duties to the identified high-risk AI provider.",
        "Within the selected rule only, regarding Where a party is the provider of a high-risk AI system, the contract allocates technical-documentation obligations for that system. Proof: Technical documentation must be an operative provider duty — drawing up, maintaining, or supplying documentation before market placement. Non-proof: A provider role label with no technical-documentation duty. Documentation obligations placed only on the deployer or importer with none on the provider. Remediation: Allocate technical-documentation duties to the identified high-risk AI provider.",
        "Within the selected rule only, regarding Where a party is the provider of a high-risk AI system, the contract commits that party to a quality-management system and an EU declaration of conformity / CE-marking path before market placement. Proof: Look for QMS plus conformity/CE-marking commitments before placing the system on the market — core Section 2 provider duties. Non-proof: Risk management and documentation alone with no QMS or conformity/CE-marking commitment. A statement that the system 'complies with the AI Act' with no operative QMS or declaration/CE path. Remediation: Add quality-management and EU declaration/CE-marking obligations for the provider before market placement."
      ]
    },
    "legacyRequirementId": "aiact.art16.provider"
  },
  {
    "ruleId": "aiact.art23.importer",
    "label": "Importer duties before placing on the Union market",
    "ruleText": "An importer of a high-risk AI system must ensure the provider has drawn up technical documentation, that the system bears the CE marking, and that the provider has appointed an authorised representative where required, before placing the system on the Union market.",
    "checkType": "judgment",
    "findingCategory": "aiact_importer_duty_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 23 — obligations of importers (private).",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 23 — obligations of importers (private).",
      "provisionPath": [
        "aiact.art23.importer"
      ],
      "citationAliases": [
        "aiact.art23.importer",
        "Regulation (EU) 2024/1689 Art. 23 — obligations of importers (private)."
      ]
    },
    "selection": {
      "aliases": [
        "importer duties before placing on the union market",
        "importer",
        "ce marking",
        "authorised representative",
        "before placing on the market"
      ],
      "concepts": [
        "importer",
        "duties",
        "placing",
        "union",
        "market",
        "high-risk",
        "system",
        "ensure",
        "provider",
        "drawn",
        "technical",
        "documentation",
        "bears",
        "marking",
        "appointed",
        "authorised",
        "representative",
        "required"
      ],
      "actors": [
        "provider",
        "importer"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a party is acting as the IMPORTER of a high-risk AI system, the contract confirms that party verifies the provider has prepared technical documentation, that the system bears CE marking, and that an EU authorised representative has been appointed where required, before placing the system on the Union market.",
      "evidenceHints": [
        "importer",
        "CE marking",
        "authorised representative",
        "before placing on the market"
      ],
      "proofStandard": "Proven only where the contract identifies a party as IMPORTER of a high-risk AI system AND commits that party to the pre-market verification duties (technical documentation exists, CE marking is present, authorised representative appointed where required). If no party is identified as an importer, or the AI system is not high-risk, this proposition is not raised — treat as not applicable.",
      "proofElements": [
        {
          "id": "technical_documentation",
          "description": "The importer verifies provider technical documentation",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "ce_marking",
          "description": "The importer verifies CE marking",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "authorized_representative",
          "description": "The importer verifies an authorised representative where required",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "pre_market_timing",
          "description": "Verification occurs before placing the system on the Union market",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Where a party is the importer of a high-risk AI system, the contract requires that party to verify the provider has prepared technical documentation before placing the system on the Union market. Proof: Pre-market verification that technical documentation exists — an operative importer duty, not a passive assumption. Non-proof: An importer role label with no documentation-verification duty. Documentation obligations allocated only to the provider with no importer verification step. Remediation: Require the importer to verify provider technical documentation before market placement.",
        "Within the selected rule only, regarding Where a party is the importer of a high-risk AI system, the contract requires that party to verify the system bears CE marking before placing it on the Union market. Proof: CE-marking verification is a distinct pre-market importer duty — not implied by general conformity language alone. Non-proof: A general 'compliant with applicable law' statement with no CE-marking verification duty for the importer. CE marking mentioned only in product specs with no importer verification obligation. Remediation: Require the importer to verify CE marking before placing the system on the Union market.",
        "Within the selected rule only, regarding Where a party is the importer of a high-risk AI system, the contract requires that party to verify an EU authorised representative has been appointed where required, before placing the system on the Union market. Proof: Authorised-representative verification where required — a third distinct pre-market importer duty. Non-proof: CE and documentation verification without authorised-representative verification where the provider is outside the Union. An authorised representative named in recitals with no importer verification duty. Remediation: Require the importer to verify appointment of an EU authorised representative where required."
      ]
    },
    "legacyRequirementId": "aiact.art23.importer"
  },
  {
    "ruleId": "aiact.art24.distributor",
    "label": "Distributor verification duties",
    "ruleText": "A distributor must verify CE marking, the EU declaration of conformity, and instructions for use, and must not make a high-risk AI system available where it considers the system not in conformity.",
    "checkType": "judgment",
    "findingCategory": "aiact_distributor_duty_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 24 — obligations of distributors (private).",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 24 — obligations of distributors (private).",
      "provisionPath": [
        "aiact.art24.distributor"
      ],
      "citationAliases": [
        "aiact.art24.distributor",
        "Regulation (EU) 2024/1689 Art. 24 — obligations of distributors (private)."
      ]
    },
    "selection": {
      "aliases": [
        "distributor verification duties",
        "distributor",
        "verify conformity",
        "declaration of conformity",
        "instructions for use"
      ],
      "concepts": [
        "distributor",
        "verification",
        "duties",
        "verify",
        "marking",
        "declaration",
        "conformity",
        "instructions",
        "make",
        "high-risk",
        "system",
        "available",
        "considers"
      ],
      "actors": [
        "distributor"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a party is acting as a DISTRIBUTOR of a high-risk AI system, the contract confirms that party verifies CE marking, the EU declaration of conformity, and instructions for use, and does not make the system available where it considers the system non-conforming.",
      "evidenceHints": [
        "distributor",
        "verify conformity",
        "declaration of conformity",
        "instructions for use"
      ],
      "proofStandard": "Proven only where the contract identifies a party as DISTRIBUTOR of a high-risk AI system AND requires that party to verify CE marking, the declaration of conformity, and instructions for use before making the system available, with a stop-distribution duty if non-conformity is identified. If no party is a distributor of a high-risk AI system, this proposition is not raised — treat as not applicable.",
      "proofElements": [
        {
          "id": "ce_marking",
          "description": "The distributor verifies CE marking",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "declaration_and_instructions",
          "description": "The distributor verifies the declaration of conformity and instructions for use",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "nonconformity_stop",
          "description": "A system suspected of nonconformity is not made available",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Where a party is the distributor of a high-risk AI system, the contract requires that party to verify CE marking, the EU declaration of conformity, and instructions for use before making the system available. Proof: All three verification heads — CE marking, declaration of conformity, and instructions for use — must be allocated to the distributor before availability. Non-proof: CE marking verification alone with no declaration-of-conformity or instructions-for-use verification. A distributor role label with no pre-availability verification duties. Remediation: Require the distributor to verify CE marking, the EU declaration of conformity, and instructions for use before making the system available.",
        "Within the selected rule only, regarding Where a party is the distributor of a high-risk AI system, the contract requires that party not to make the system available where it considers the system non-conforming. Proof: A stop-distribution duty when non-conformity is identified — separate from the verification limb. Non-proof: Verification duties without a duty to stop distribution if non-conformity is identified. A right to continue distributing pending provider remediation with no stop-duty. Remediation: Add a duty not to make the system available where the distributor considers it non-conforming."
      ]
    },
    "legacyRequirementId": "aiact.art24.distributor"
  },
  {
    "ruleId": "aiact.art26.deployer",
    "label": "High-risk AI deployer duties",
    "ruleText": "A deployer of a high-risk AI system must use it in accordance with the instructions, assign human oversight, monitor operation, keep logs, and complete a fundamental-rights impact assessment where Article 27 applies to that deployer. This skill does not cover public-authority market-surveillance duties.",
    "checkType": "judgment",
    "findingCategory": "aiact_deployer_duty_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Arts. 26–27 — obligations of deployers of high-risk AI systems.",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Arts. 26–27 — obligations of deployers of high-risk AI systems.",
      "provisionPath": [
        "aiact.art26.deployer"
      ],
      "citationAliases": [
        "aiact.art26.deployer",
        "Regulation (EU) 2024/1689 Arts. 26–27 — obligations of deployers of high-risk AI systems."
      ]
    },
    "selection": {
      "aliases": [
        "high-risk ai deployer duties",
        "deployer",
        "human oversight",
        "in accordance with the instructions for use",
        "logs",
        "fundamental rights impact assessment"
      ],
      "concepts": [
        "high-risk",
        "deployer",
        "duties",
        "system",
        "accordance",
        "instructions",
        "assign",
        "human",
        "oversight",
        "monitor",
        "operation",
        "keep",
        "logs",
        "complete",
        "fundamental-rights",
        "impact",
        "assessment",
        "article",
        "applies",
        "skill",
        "cover",
        "public-authority",
        "market-surveillance",
        "fundamental",
        "rights"
      ],
      "actors": [
        "deployer"
      ],
      "actions": [],
      "objects": [
        "rights_request"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a party is acting as the DEPLOYER of a high-risk AI system, the contract confirms that party uses the system per the provider's instructions, assigns human oversight, monitors operation, keeps logs, and (where Article 27 applies to that deployer) completes a fundamental-rights impact assessment.",
      "evidenceHints": [
        "deployer",
        "human oversight",
        "in accordance with the instructions for use",
        "logs",
        "fundamental rights impact assessment"
      ],
      "proofStandard": "Proven only where the contract identifies a party as DEPLOYER of a high-risk AI system AND allocates at least instructions-compliant use and human-oversight duties to that party. A contract naming a 'Deployer' with no operative oversight/logging duties is a gap. If no party is a deployer of a high-risk AI system, this proposition is not raised — treat as not applicable.",
      "proofElements": [
        {
          "id": "instructions_and_oversight",
          "description": "The deployer follows instructions and assigns human oversight",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "monitoring_and_logs",
          "description": "The deployer monitors operation and keeps required logs",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "fria_when_applicable",
          "description": "A fundamental-rights impact assessment is completed when Article 27 applies",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Within the selected rule only, regarding Where a party is the deployer of a high-risk AI system, the contract requires that party to use the system in accordance with the provider's instructions for use. Proof: Instructions-compliant use is a core deployer duty — operative language, not merely naming a party 'Deployer'. Non-proof: A deployer role label with no instructions-compliant use obligation. A general 'use the system responsibly' clause with no tie to the provider's instructions for use. Remediation: Require the deployer to use the high-risk AI system in accordance with the provider's instructions for use.",
        "Within the selected rule only, regarding Where a party is the deployer of a high-risk AI system, the contract requires that party to assign human oversight of the system's operation. Proof: Human oversight must be an operative deployer duty — assignment, maintenance, or ensuring oversight during operation. Non-proof: Instructions-compliant use alone with no human-oversight duty. A deployer named with logging duties but no human oversight allocation. Remediation: Require the deployer to assign human oversight of the high-risk AI system's operation.",
        "Within the selected rule only, regarding Where a party is the deployer of a high-risk AI system and Article 27 applies to that deployer, the contract requires completion of a fundamental-rights impact assessment. Proof: FRIA is conditional on Art 27 applicability — look for an operative FRIA duty when the contract triggers Art 27 for the deployer. Non-proof: A generic DPIA or impact-assessment clause with no fundamental-rights / Art 27 FRIA framing where Art 27 applies. Silence on FRIA where the contract expressly places the deployer in an Art 27 scope (e.g. public authority deployer). Remediation: Add a fundamental-rights impact assessment obligation for the deployer where Article 27 applies."
      ]
    },
    "legacyRequirementId": "aiact.art26.deployer"
  },
  {
    "ruleId": "aiact.art50.transparency",
    "label": "Transparency to affected persons for certain AI systems",
    "ruleText": "Providers and deployers of AI systems that interact with people, generate synthetic content, or perform emotion recognition / biometric categorisation must meet Article 50 transparency duties so affected persons know they are interacting with AI or that content is AI-generated, unless an exemption applies.",
    "checkType": "judgment",
    "findingCategory": "aiact_transparency_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 50 — transparency obligations for providers and deployers.",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 50 — transparency obligations for providers and deployers.",
      "provisionPath": [
        "aiact.art50.transparency"
      ],
      "citationAliases": [
        "aiact.art50.transparency",
        "Regulation (EU) 2024/1689 Art. 50 — transparency obligations for providers and deployers."
      ]
    },
    "selection": {
      "aliases": [
        "transparency to affected persons for certain ai systems",
        "disclose that they are interacting with an ai system",
        "ai-generated content",
        "emotion recognition",
        "biometric categorisation",
        "label as ai-generated"
      ],
      "concepts": [
        "transparency",
        "affected",
        "persons",
        "certain",
        "systems",
        "providers",
        "deployers",
        "interact",
        "people",
        "generate",
        "synthetic",
        "content",
        "perform",
        "emotion",
        "recognition",
        "biometric",
        "categorisation",
        "meet",
        "article",
        "duties",
        "know",
        "they",
        "interacting",
        "ai-generated",
        "disclose",
        "system",
        "label"
      ],
      "actors": [
        "provider",
        "deployer"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where the AI system interacts with people, generates synthetic content, or performs emotion recognition or biometric categorisation, the contract requires that affected persons be informed they are interacting with AI or that content is AI-generated, consistent with Article 50, unless an exemption applies.",
      "evidenceHints": [
        "disclose that they are interacting with an ai system",
        "ai-generated content",
        "emotion recognition",
        "biometric categorisation",
        "label as ai-generated"
      ],
      "proofStandard": "Proven only where the contract describes an AI system falling within Article 50's scope (chatbot/interactive system, synthetic-content generation, or emotion-recognition/biometric-categorisation use) AND requires disclosure to affected persons of that fact. Contradicted by text expressly permitting such a system with no disclosure requirement. If the contract describes no in-scope system at all, this proposition is not raised — treat as not applicable.",
      "proofElements": [
        {
          "id": "interaction_disclosure",
          "description": "People are informed when they interact directly with an AI system",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "synthetic_content_disclosure",
          "description": "AI-generated or manipulated content is disclosed where applicable",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "biometric_emotion_disclosure",
          "description": "Emotion-recognition or biometric-categorisation use is disclosed where applicable",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "aiact.art50.transparency"
  },
  {
    "ruleId": "aiact.art86.explanation",
    "label": "Affected person's right to explanation",
    "ruleText": "Where a deployer uses a high-risk AI system to make or substantially influence a decision producing legal or similarly significant effects on a person, that affected person should be able to obtain a clear explanation of the role of the AI system and the main elements of the decision. Flag contracts that waive or obstruct this right.",
    "checkType": "judgment",
    "findingCategory": "aiact_explanation_right_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "ai_system_use"
    ],
    "legalHook": "Regulation (EU) 2024/1689 Art. 86 — right to explanation of individual decision-making.",
    "authority": {
      "instrument": "Regulation (EU) 2024/1689 (EU AI Act)",
      "citation": "Regulation (EU) 2024/1689 Art. 86 — right to explanation of individual decision-making.",
      "provisionPath": [
        "aiact.art86.explanation"
      ],
      "citationAliases": [
        "aiact.art86.explanation",
        "Regulation (EU) 2024/1689 Art. 86 — right to explanation of individual decision-making."
      ]
    },
    "selection": {
      "aliases": [
        "affected person's right to explanation",
        "waive",
        "no right to explanation",
        "final and binding decision",
        "explanation of the decision"
      ],
      "concepts": [
        "affected",
        "person",
        "right",
        "explanation",
        "deployer",
        "uses",
        "high-risk",
        "system",
        "make",
        "substantially",
        "influence",
        "decision",
        "producing",
        "legal",
        "similarly",
        "significant",
        "effects",
        "should",
        "able",
        "obtain",
        "clear",
        "role",
        "main",
        "elements",
        "waive",
        "final",
        "binding"
      ],
      "actors": [
        "deployer"
      ],
      "actions": [],
      "objects": [
        "rights_request"
      ]
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "Where a deployer uses a high-risk AI system to make or substantially influence a decision producing legal or similarly significant effects on a person, the contract preserves that affected person's ability to obtain a clear explanation of the AI system's role and the main elements of the decision, rather than waiving or obstructing it.",
      "evidenceHints": [
        "waive",
        "no right to explanation",
        "final and binding decision",
        "explanation of the decision"
      ],
      "proofStandard": "This is a RISK check: proven (the risk is present) only by text that expressly waives, disclaims, or otherwise obstructs an affected person's right to an explanation of a qualifying automated/AI-assisted decision (e.g. 'the AI system's determination is final and not subject to explanation or appeal'). A contract that is simply silent on the explanation right, or that does not involve a high-risk AI system making legal/significant-effect decisions about a natural person, does NOT prove this risk — treat as not applicable rather than proved.",
      "proofElements": [
        {
          "id": "significant_decision_scope",
          "description": "The high-risk AI system makes or substantially influences a legally or similarly significant decision",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "ai_role_explanation",
          "description": "The affected person can obtain a clear explanation of the AI system's role",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "decision_elements",
          "description": "The explanation covers the main elements of the decision",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "ai_system_use"
      ],
      "extractionTargets": [
        "prohibited_practice_language",
        "provider_duties",
        "importer_duties",
        "distributor_duties",
        "deployer_duties",
        "transparency_disclosure",
        "explanation_right"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": []
    },
    "legacyRequirementId": "aiact.art86.explanation"
  }
];

const euAiActSkillConfig: AnalysisSkillConfig = {
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
      requirementEvidence: {},
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

export const euAiActSkill = finalizeRegimeRuleContracts(euAiActSkillConfig, {
  instrument: "Regulation (EU) 2024/1689 (EU AI Act)",
});
