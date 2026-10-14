/**
 * CCPA/CPRA service-provider graded element schemas.
 *
 * Multi-limb requirements from `ccpa-cpra/skill.config.ts` requirementEvidence
 * are split so Phase 5 can report Partial when only one limb is met — matching
 * the near-miss language in that package (e.g. sell-only without share/CCBA).
 * Aliases include package-native ids (`no_sell_share`, …) and regime ruleIds.
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

export const CCPA_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "ccpa.sp.no_sell_share",
    canonicalKey: "ccpa.service_provider.no_sell_share",
    legalCitation: "CPRA Cal. Civ. Code §1798.140 / §1798.100 et seq.",
    title:
      "Service provider must not sell or share personal information",
    aggregationRule: "AND",
    aliases: [
      "no_sell_share",
      "ccpa.sp.no_sell_share",
      "sell_share_prohibition",
    ],
    elements: [
      {
        elementId: "SS1",
        proposition:
          "The service provider is contractually prohibited from selling personal information received from or on behalf of the business.",
        kind: "mandatory",
        proofGuidance:
          "Look for an express prohibition on selling personal information processed for the business — not merely a confidentiality or non-disclosure clause.",
        nonProofTraps: [
          "A general confidentiality or non-disclosure clause with no express sell prohibition.",
          "A prohibition on 'transfer for monetary consideration' that does not address selling personal information under CPRA.",
        ],
        remediationGuidance:
          "Expressly prohibit the service provider from selling personal information received from or on behalf of the business.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "shall not sell",
          "will not sell",
          "prohibit",
          "selling personal information",
          "no sale",
        ],
      },
      {
        elementId: "SS2",
        proposition:
          "The service provider is contractually prohibited from sharing personal information, including disclosure for cross-context behavioural advertising.",
        kind: "mandatory",
        proofGuidance:
          "CPRA 'share' includes cross-context behavioural advertising. A sell-only prohibition without share/CCBA language is partial, not full proof.",
        nonProofTraps: [
          "A clause prohibiting only 'sale' of personal information with no mention of 'sharing' or cross-context advertising.",
          "A marketing restriction that does not reach cross-context behavioural advertising disclosures.",
        ],
        remediationGuidance:
          "Add an express prohibition on sharing personal information, including for cross-context behavioural advertising.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "shall not share",
          "will not share",
          "cross-context behavioral advertising",
          "cross-context behavioural advertising",
          "cross context",
          "behavioural advertising",
          "behavioral advertising",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "ccpa.sp.business_purpose_limit",
    canonicalKey: "ccpa.service_provider.business_purpose_limit",
    legalCitation: "CPRA service-provider contract duties",
    title:
      "Retain, use, and disclose only for the specified business purpose",
    aggregationRule: "AND",
    aliases: [
      "business_purpose_limit",
      "ccpa.sp.business_purpose_limit",
      "business_purpose_limitation",
    ],
    elements: [
      {
        elementId: "BP1",
        proposition:
          "The service provider may retain, use, or disclose personal information only for the specific business purpose(s) stated in the contract (or as otherwise permitted by the contract and the CPRA).",
        kind: "mandatory",
        proofGuidance:
          "Look for purpose-tied retention/use/disclosure language tied to specified business purpose(s) in the agreement — not an open-ended services licence alone.",
        nonProofTraps: [
          "A bare 'as necessary to provide the Services' clause with no tie to a specified business purpose.",
          "A permitted-use list with no retention/use/disclosure scope limitation.",
        ],
        remediationGuidance:
          "Limit retention, use, and disclosure to the specific business purpose(s) stated in the contract.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "business purpose",
          "specified in this agreement",
          "specified purpose",
          "only for the purpose",
          "not retain, use, or disclose",
        ],
      },
      {
        elementId: "BP2",
        proposition:
          "The contract expressly excludes use of the business's personal information for the provider's own independent or unrelated commercial purposes outside the direct business relationship.",
        kind: "mandatory",
        proofGuidance:
          "The CPRA-specific carve-out against independent provider use is operative — a services-scoped licence without this exclusion is partial.",
        nonProofTraps: [
          "A clause permitting use 'as necessary to provide the Services' with no express exclusion of independent provider purposes.",
          "A general 'internal business purposes' carve-out without tying it to the contracted business relationship.",
        ],
        remediationGuidance:
          "Expressly exclude retention, use, or disclosure for the provider's own independent or unrelated business purposes.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "for its own commercial purposes",
          "independent purposes",
          "unrelated purposes",
          "outside the direct business relationship",
          "not for its own",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "ccpa.sp.consumer_rights_assistance",
    canonicalKey: "ccpa.service_provider.consumer_rights_assistance",
    legalCitation: "CPRA service-provider contract §4 — Consumers' Rights",
    title:
      "Assist with verifiable consumer requests and forward direct requests",
    aggregationRule: "AND",
    aliases: [
      "consumer_rights_assistance",
      "ccpa.sp.consumer_rights_assist",
      "verifiable_request_assistance",
      "request_forwarding",
    ],
    elements: [
      {
        elementId: "CR1",
        proposition:
          "The service provider assists the business in responding to verifiable consumer requests covering at least delete and know/access (and correct where addressed).",
        kind: "mandatory",
        proofGuidance:
          "Operative assistance obligation for verifiable consumer requests — not a bare acknowledgement that consumers have rights under CPRA.",
        nonProofTraps: [
          "A generic 'comply with applicable privacy law' statement with no assistance duty.",
          "A consumer-rights list naming delete/know/access with no obligation on the provider to assist the business.",
        ],
        remediationGuidance:
          "Obligate the provider to assist the business with verifiable consumer requests, including delete and know/access.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "assist the business",
          "verifiable consumer request",
          "right to know",
          "right to delete",
          "right to correct",
          "consumer request",
        ],
      },
      {
        elementId: "CR2",
        proposition:
          "The service provider forwards any consumer request it receives directly to the business rather than responding to it as if it were the business.",
        kind: "mandatory",
        proofGuidance:
          "The forwarding duty specifically prevents the provider from purporting to act as the business. Assistance without forwarding is partial.",
        nonProofTraps: [
          "An assistance clause that is silent on forwarding direct consumer requests to the business.",
          "A clause allowing the provider to respond directly to consumer requests without forwarding.",
        ],
        remediationGuidance:
          "Require the provider to forward consumer requests received directly to the business rather than answering as the business.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "forward",
          "refer to the business",
          "direct to the business",
          "not respond on behalf",
          "rather than responding",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
