/**
 * EU AI Act high-risk AI role graded element schemas.
 *
 * Multi-limb requirements from `eu-ai-act/skill.config.ts` requirementEvidence
 * are split so Phase 5 can report Partial when only one limb is met — matching
 * the near-miss language in that package (e.g. provider named with no Section 2
 * duties). Aliases include regime ruleIds. Role-based requirements are
 * conditional on the contract identifying the relevant party role.
 *
 * NOT LEGALLY REVIEWED YET — `reviewStatus: "authored"`.
 *
 * Types are duplicated structurally (not imported) to avoid a circular
 * runtime import with `element-schemas.ts`, which merges this registry.
 */

type ElementKind = "mandatory" | "conditional" | "alternative";
type AggregationRule = "AND" | "OR" | "CHOICE" | "EXCEPTION" | "CONDITIONAL";

interface ElementSchema {
  elementId: string;
  proposition: string;
  kind: ElementKind;
  proofGuidance: string;
  nonProofTraps: string[];
  applicabilityRule?: string;
  remediationGuidance: string;
  version: string;
  distinctiveTokens?: string[];
  requiredTokenGroups?: string[][];
}

interface RequirementElementSchema {
  requirementUid: string;
  canonicalKey: string;
  legalCitation: string;
  title: string;
  aggregationRule: AggregationRule;
  elements: ElementSchema[];
  version: string;
  reviewStatus: "authored" | "legal_reviewed" | "auto_derived";
  aliases?: string[];
}

const ELEMENT_VERSION = "0.1.0";

const HIGH_RISK_ROLE_APPLICABILITY =
  "Applies only when the contract identifies a party in this role for a high-risk AI system. If no such role is allocated, treat as not applicable — neither proved nor contradicted.";

export const AIACT_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "aiact.art16.provider",
    canonicalKey: "aiact.article16.provider",
    legalCitation: "Regulation (EU) 2024/1689 Art. 16 and Section 2 of Chapter III",
    title: "High-risk AI provider duties",
    aggregationRule: "AND",
    aliases: ["aiact.art16.provider"],
    elements: [
      {
        elementId: "P1",
        proposition:
          "Where a party is the provider of a high-risk AI system, the contract allocates a risk-management obligation for that system.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Look for operative risk-management duties allocated to the identified provider — not merely naming a party 'Provider'.",
        nonProofTraps: [
          "A contract naming a party 'Provider' with no operative risk-management duties attached.",
          "A general AI compliance recital with no provider-specific risk-management allocation.",
        ],
        remediationGuidance:
          "Allocate risk-management duties to the identified high-risk AI provider.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "risk management",
          "risk-management",
          "risk assessment",
          "provider",
          "high-risk ai system",
        ],
      },
      {
        elementId: "P2",
        proposition:
          "Where a party is the provider of a high-risk AI system, the contract allocates technical-documentation obligations for that system.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Technical documentation must be an operative provider duty — drawing up, maintaining, or supplying documentation before market placement.",
        nonProofTraps: [
          "A provider role label with no technical-documentation duty.",
          "Documentation obligations placed only on the deployer or importer with none on the provider.",
        ],
        remediationGuidance:
          "Allocate technical-documentation duties to the identified high-risk AI provider.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "technical documentation",
          "technical documents",
          "draw up documentation",
          "provider",
        ],
      },
      {
        elementId: "P3",
        proposition:
          "Where a party is the provider of a high-risk AI system, the contract commits that party to a quality-management system and an EU declaration of conformity / CE-marking path before market placement.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Look for QMS plus conformity/CE-marking commitments before placing the system on the market — core Section 2 provider duties.",
        nonProofTraps: [
          "Risk management and documentation alone with no QMS or conformity/CE-marking commitment.",
          "A statement that the system 'complies with the AI Act' with no operative QMS or declaration/CE path.",
        ],
        remediationGuidance:
          "Add quality-management and EU declaration/CE-marking obligations for the provider before market placement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "quality management system",
          "declaration of conformity",
          "CE marking",
          "CE mark",
          "before placing on the market",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "aiact.art23.importer",
    canonicalKey: "aiact.article23.importer",
    legalCitation: "Regulation (EU) 2024/1689 Art. 23",
    title: "Importer duties before placing on the Union market",
    aggregationRule: "AND",
    aliases: ["aiact.art23.importer"],
    elements: [
      {
        elementId: "I1",
        proposition:
          "Where a party is the importer of a high-risk AI system, the contract requires that party to verify the provider has prepared technical documentation before placing the system on the Union market.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Pre-market verification that technical documentation exists — an operative importer duty, not a passive assumption.",
        nonProofTraps: [
          "An importer role label with no documentation-verification duty.",
          "Documentation obligations allocated only to the provider with no importer verification step.",
        ],
        remediationGuidance:
          "Require the importer to verify provider technical documentation before market placement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "importer",
          "technical documentation",
          "verify",
          "before placing on the market",
        ],
      },
      {
        elementId: "I2",
        proposition:
          "Where a party is the importer of a high-risk AI system, the contract requires that party to verify the system bears CE marking before placing it on the Union market.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "CE-marking verification is a distinct pre-market importer duty — not implied by general conformity language alone.",
        nonProofTraps: [
          "A general 'compliant with applicable law' statement with no CE-marking verification duty for the importer.",
          "CE marking mentioned only in product specs with no importer verification obligation.",
        ],
        remediationGuidance:
          "Require the importer to verify CE marking before placing the system on the Union market.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "CE marking",
          "CE mark",
          "importer",
          "verify",
          "before placing on the market",
        ],
      },
      {
        elementId: "I3",
        proposition:
          "Where a party is the importer of a high-risk AI system, the contract requires that party to verify an EU authorised representative has been appointed where required, before placing the system on the Union market.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Authorised-representative verification where required — a third distinct pre-market importer duty.",
        nonProofTraps: [
          "CE and documentation verification without authorised-representative verification where the provider is outside the Union.",
          "An authorised representative named in recitals with no importer verification duty.",
        ],
        remediationGuidance:
          "Require the importer to verify appointment of an EU authorised representative where required.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "authorised representative",
          "authorized representative",
          "importer",
          "verify",
          "where required",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "aiact.art24.distributor",
    canonicalKey: "aiact.article24.distributor",
    legalCitation: "Regulation (EU) 2024/1689 Art. 24",
    title: "Distributor verification duties",
    aggregationRule: "AND",
    aliases: ["aiact.art24.distributor"],
    elements: [
      {
        elementId: "D1",
        proposition:
          "Where a party is the distributor of a high-risk AI system, the contract requires that party to verify CE marking, the EU declaration of conformity, and instructions for use before making the system available.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "All three verification heads — CE marking, declaration of conformity, and instructions for use — must be allocated to the distributor before availability.",
        nonProofTraps: [
          "CE marking verification alone with no declaration-of-conformity or instructions-for-use verification.",
          "A distributor role label with no pre-availability verification duties.",
        ],
        remediationGuidance:
          "Require the distributor to verify CE marking, the EU declaration of conformity, and instructions for use before making the system available.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "distributor",
          "verify conformity",
          "declaration of conformity",
          "instructions for use",
          "CE marking",
        ],
      },
      {
        elementId: "D2",
        proposition:
          "Where a party is the distributor of a high-risk AI system, the contract requires that party not to make the system available where it considers the system non-conforming.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "A stop-distribution duty when non-conformity is identified — separate from the verification limb.",
        nonProofTraps: [
          "Verification duties without a duty to stop distribution if non-conformity is identified.",
          "A right to continue distributing pending provider remediation with no stop-duty.",
        ],
        remediationGuidance:
          "Add a duty not to make the system available where the distributor considers it non-conforming.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "distributor",
          "non-conform",
          "not in conformity",
          "not make available",
          "stop distribution",
          "withdraw",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "aiact.art26.deployer",
    canonicalKey: "aiact.article26.deployer",
    legalCitation: "Regulation (EU) 2024/1689 Arts. 26–27",
    title: "High-risk AI deployer duties",
    aggregationRule: "AND",
    aliases: ["aiact.art26.deployer"],
    elements: [
      {
        elementId: "DP1",
        proposition:
          "Where a party is the deployer of a high-risk AI system, the contract requires that party to use the system in accordance with the provider's instructions for use.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Instructions-compliant use is a core deployer duty — operative language, not merely naming a party 'Deployer'.",
        nonProofTraps: [
          "A deployer role label with no instructions-compliant use obligation.",
          "A general 'use the system responsibly' clause with no tie to the provider's instructions for use.",
        ],
        remediationGuidance:
          "Require the deployer to use the high-risk AI system in accordance with the provider's instructions for use.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "deployer",
          "in accordance with the instructions for use",
          "instructions for use",
          "provider's instructions",
        ],
      },
      {
        elementId: "DP2",
        proposition:
          "Where a party is the deployer of a high-risk AI system, the contract requires that party to assign human oversight of the system's operation.",
        kind: "conditional",
        applicabilityRule: HIGH_RISK_ROLE_APPLICABILITY,
        proofGuidance:
          "Human oversight must be an operative deployer duty — assignment, maintenance, or ensuring oversight during operation.",
        nonProofTraps: [
          "Instructions-compliant use alone with no human-oversight duty.",
          "A deployer named with logging duties but no human oversight allocation.",
        ],
        remediationGuidance:
          "Require the deployer to assign human oversight of the high-risk AI system's operation.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "human oversight",
          "human-in-the-loop",
          "human review",
          "deployer",
          "oversight",
        ],
      },
      {
        elementId: "DP3",
        proposition:
          "Where a party is the deployer of a high-risk AI system and Article 27 applies to that deployer, the contract requires completion of a fundamental-rights impact assessment.",
        kind: "conditional",
        applicabilityRule:
          "Applies only when the contract identifies a deployer of a high-risk AI system AND Article 27 FRIA obligations apply to that deployer (e.g. public-body deployer or other Art 27 trigger described in the contract). If no deployer role is allocated or Art 27 does not apply, treat as not applicable.",
        proofGuidance:
          "FRIA is conditional on Art 27 applicability — look for an operative FRIA duty when the contract triggers Art 27 for the deployer.",
        nonProofTraps: [
          "A generic DPIA or impact-assessment clause with no fundamental-rights / Art 27 FRIA framing where Art 27 applies.",
          "Silence on FRIA where the contract expressly places the deployer in an Art 27 scope (e.g. public authority deployer).",
        ],
        remediationGuidance:
          "Add a fundamental-rights impact assessment obligation for the deployer where Article 27 applies.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "fundamental rights impact assessment",
          "FRIA",
          "article 27",
          "deployer",
          "fundamental rights",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
