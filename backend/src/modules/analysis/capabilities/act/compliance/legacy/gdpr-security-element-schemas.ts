/**
 * GDPR Articles 32, 33(2), and 35 graded element schemas.
 *
 * Each requirement is split into baseline vs full (or other discrete legal
 * limbs) so Phase 5 can report Partial when only one limb is met — matching
 * the near-miss language in `gdpr.security.breach_and_accountability`
 * requirementEvidence. Aliases include the package-native ids (`art32_security`,
 * `art33_2_processor_breach_notice`, `art35_dpia`) used by that evidence package.
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

export const GDPR_SECURITY_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "gdpr.art32",
    canonicalKey: "gdpr.article32.security",
    legalCitation: "GDPR Article 32",
    title: "Security of processing — CIA measures and risk-appropriate TOMs",
    aggregationRule: "AND",
    aliases: [
      "art32_security",
      "gdpr.art32",
      "gdpr.article32",
      "article32.security",
    ],
    elements: [
      {
        elementId: "S1",
        proposition:
          "Technical and organisational measures address ongoing confidentiality, integrity, availability, and resilience of processing systems and services.",
        kind: "mandatory",
        proofGuidance:
          "Article 32(1)(b) CIA/resilience limb — encryption, access controls, resilience, or equivalent measures, not a bare 'reasonable security' recital.",
        nonProofTraps: [
          "A generic 'appropriate security' statement naming no confidentiality, integrity, availability, or resilience measures.",
          "Confidentiality-only language with no integrity, availability, or resilience commitment.",
        ],
        remediationGuidance:
          "Implement measures ensuring confidentiality, integrity, availability, and resilience of processing systems.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "confidentiality",
          "integrity",
          "availability",
          "resilience",
          "encryption",
          "access control",
        ],
      },
      {
        elementId: "S2",
        proposition:
          "Security measures are appropriate to the risk — considering state of the art, implementation cost, processing nature/scope/context/purposes, and likely impact on individuals.",
        kind: "mandatory",
        proofGuidance:
          "Risk-appropriate TOMs limb — measures tied to risk context, not one-size-fits-all boilerplate.",
        nonProofTraps: [
          "A fixed checklist of controls with no risk-appropriateness framing.",
          "Referencing an external standard with no obligation to implement risk-appropriate measures.",
        ],
        remediationGuidance:
          "Tie security measures to processing risk, context, and likely individual impact.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "appropriate to the risk",
          "risk-based",
          "state of the art",
          "technical and organisational",
          "tom",
          "measures",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art33.2",
    canonicalKey: "gdpr.article33.2.processor_breach_notice",
    legalCitation: "GDPR Article 33(2)",
    title: "Processor breach notification to controller",
    aggregationRule: "AND",
    aliases: [
      "art33_2_processor_breach_notice",
      "gdpr.art33.2",
      "gdpr.article33.2",
      "processor_breach_notice",
    ],
    elements: [
      {
        elementId: "B1",
        proposition:
          "After becoming aware of a personal-data breach, the processor notifies the controller without undue delay.",
        kind: "mandatory",
        proofGuidance:
          "Operative processor-to-controller breach notification with a without-undue-delay standard or equivalent hard clock.",
        nonProofTraps: [
          "A generic 'security incident' notice with no personal-data breach trigger.",
          "Vague 'promptly' or 'as soon as practicable' with no without-undue-delay framing for personal-data breaches.",
        ],
        remediationGuidance:
          "Require the processor to notify the controller of personal-data breaches without undue delay.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "personal data breach",
          "data breach",
          "without undue delay",
          "notify the controller",
          "becoming aware",
        ],
      },
      {
        elementId: "B2",
        proposition:
          "The processor assists the controller with the controller's breach-related obligations under Articles 33 and 34 (and related documentation under Article 33(5)).",
        kind: "mandatory",
        proofGuidance:
          "Assistance limb distinct from upward notification — help the controller meet supervisory notification, individual communication, and breach-documentation duties.",
        nonProofTraps: [
          "Processor breach notification upward only, with no assistance for controller breach obligations.",
          "A generic cooperation clause unrelated to breach response assistance.",
        ],
        remediationGuidance:
          "Obligate the processor to assist the controller with Articles 33-34 breach obligations.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "assist",
          "assistance",
          "breach notification",
          "supervisory authority",
          "data subject",
          "article 33",
          "article 34",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art35",
    canonicalKey: "gdpr.article35.dpia",
    legalCitation: "GDPR Article 35",
    title: "Data protection impact assessment",
    aggregationRule: "AND",
    aliases: [
      "art35_dpia",
      "gdpr.art35",
      "gdpr.article35",
      "article35.dpia",
      "data_protection_impact_assessment",
    ],
    elements: [
      {
        elementId: "D1",
        proposition:
          "Where processing is likely to result in a high risk, a data protection impact assessment is performed before that processing begins.",
        kind: "mandatory",
        proofGuidance:
          "When-required limb — DPIA before likely-high-risk processing (systematic monitoring, special-category data at scale, automated decision-making with legal effects, etc.).",
        nonProofTraps: [
          "A generic 'DPIA may be conducted' option with no before-processing trigger for high-risk processing.",
          "Silence on DPIA where high-risk processing is described.",
        ],
        remediationGuidance:
          "Commit to performing a DPIA before likely-high-risk processing begins.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "data protection impact assessment",
          "dpia",
          "high risk",
          "before processing",
          "prior to processing",
        ],
      },
      {
        elementId: "D2",
        proposition:
          "The DPIA documents processing operations and purposes, necessity/proportionality assessment, risk assessment, and measures to address risks — including safeguards, security measures, and mechanisms demonstrating compliance.",
        kind: "mandatory",
        proofGuidance:
          "Documented content limb — not merely a promise to 'carry out a DPIA' with no documented assessment elements.",
        nonProofTraps: [
          "A bare 'we will conduct a DPIA' commitment with no documented assessment content.",
          "Risk assessment language with no safeguards or compliance-evidence element.",
        ],
        remediationGuidance:
          "Document DPIA content covering operations, necessity, risks, and mitigating measures.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "necessity",
          "proportionality",
          "risk assessment",
          "safeguards",
          "mitigat",
          "document",
          "impact assessment",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
