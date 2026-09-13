/**
 * GDPR Chapter III (Art 12(3) + Arts 15–22) graded element schemas.
 *
 * Each requirement is split into baseline vs full (or other discrete legal
 * limbs) so Phase 5 can report Partial when only one limb is met — matching
 * the near-miss language in `gdpr.dsr.rights_verification.requirementEvidence`.
 * Aliases include the package-native ids (`art15_access`, …) used by that
 * evidence package.
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

export const DSR_CHAPTER_III_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "gdpr.art12_3.response_timeframe",
    canonicalKey: "gdpr.article12.3.response_timeframe",
    legalCitation: "GDPR Article 12(3)",
    title:
      "Respond to data-subject requests without undue delay and within one month",
    aggregationRule: "AND",
    aliases: [
      "art12_3_response_timeframe",
      "gdpr.art12.3",
      "gdpr.article12.3",
      "article12.3.response_timeframe",
      "dsr.response_timeframes",
    ],
    elements: [
      {
        elementId: "T1",
        proposition:
          "The contract states a specific numeric response deadline for data-subject requests functionally equivalent to without undue delay and within one month of receipt.",
        kind: "mandatory",
        proofGuidance:
          "Look for 'within one month', 'within 30 days', or an equivalent hard clock tied to data-subject / Chapter III requests. Vague diligence language alone is not enough.",
        nonProofTraps: [
          "'Promptly', 'reasonably', 'as soon as reasonably practicable', or 'without undue delay' with no numeric backstop.",
          "A general cooperation clause with no response deadline.",
        ],
        remediationGuidance:
          "State a one-month (or 30-day) numeric response deadline for data-subject requests.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "one month",
          "1 month",
          "30 days",
          "thirty days",
          "within one month",
          "within 30",
        ],
      },
      {
        elementId: "T2",
        proposition:
          "Any complexity/volume extension is capped at two further months and conditioned on notice to the data subject within the first month stating the reasons for delay.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the contract grants an extension, prolongation, or similar right to delay the response beyond the initial one-month clock.",
        proofGuidance:
          "Extension must be capped (≤ two further months) AND require notice within the original month stating reasons. An open-ended or unconditional extension is not full proof.",
        nonProofTraps: [
          "An open-ended right to extend 'as needed' or 'where reasonably required' with no two-month cap.",
          "An extension with no duty to notify the data subject of the delay and reasons within the first month.",
        ],
        remediationGuidance:
          "Cap any extension at two further months and require reasoned notice within the first month.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "extend",
          "extension",
          "further two months",
          "two further months",
          "additional two months",
          "prolong",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art15.access",
    canonicalKey: "gdpr.article15.access",
    legalCitation: "GDPR Article 15",
    title: "Right of access — confirmation, copy, and Article 15(1) particulars",
    aggregationRule: "AND",
    aliases: [
      "art15_access",
      "gdpr.art15",
      "gdpr.article15",
      "article15.access",
      "gdpr.right.access",
    ],
    elements: [
      {
        elementId: "A1",
        proposition:
          "A data subject can obtain confirmation that their personal data is being processed and a copy of that data.",
        kind: "mandatory",
        proofGuidance:
          "Operative right of access / confirmation-and-copy language, not a bare 'rights will be honored' list item.",
        nonProofTraps: [
          "A generic 'data subject rights will be respected' statement with no confirmation or copy commitment.",
          "Access limited to a privacy notice URL with no copy of the subject's own data.",
        ],
        remediationGuidance:
          "Grant confirmation of processing and a copy of the personal data on request.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "right of access",
          "access request",
          "confirmation",
          "copy of",
          "subject access",
          "dsar",
        ],
      },
      {
        elementId: "A2",
        proposition:
          "The response supplies substantially the Article 15(1) particulars (purposes, categories of data, recipients, retention period or criteria, other applicable rights, complaint route, source where not collected from the subject, and — where applicable — meaningful information about automated decision-making).",
        kind: "mandatory",
        proofGuidance:
          "Look for a commitment to provide Art 15(1)-style particulars, or an enumerated disclosure list covering those heads. Naming 'access' alone without particulars is incomplete.",
        nonProofTraps: [
          "Naming 'right of access' in a rights list with no particulars commitment.",
          "A privacy-policy cross-reference that does not undertake to supply the Art 15(1) information on request.",
        ],
        remediationGuidance:
          "Commit to providing the Article 15(1) information categories with the access response.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "purposes",
          "categories of",
          "recipients",
          "retention",
          "complain",
          "supervisory",
          "article 15",
        ],
      },
      {
        elementId: "A3",
        proposition:
          "Further copies may be charged only a reasonable administrative fee (first copy free / charge limited to manifestly unfounded or excessive requests).",
        kind: "conditional",
        applicabilityRule:
          "Applies when the contract addresses fees, charges, or costs for access copies or DSARs.",
        proofGuidance:
          "Fee language must preserve a free first copy or limit charges to reasonable administrative cost / manifestly unfounded or excessive requests.",
        nonProofTraps: [
          "A right to charge for every copy with no free-first-copy or manifestly-unfounded framing.",
        ],
        remediationGuidance:
          "Limit fees to reasonable administrative cost for further copies; keep the first copy free except for manifestly unfounded or excessive requests.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "fee",
          "charge",
          "administrative cost",
          "manifestly unfounded",
          "excessive",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art16.rectification",
    canonicalKey: "gdpr.article16.rectification",
    legalCitation: "GDPR Article 16",
    title: "Right to rectification and completion",
    aggregationRule: "AND",
    aliases: [
      "art16_rectification",
      "gdpr.art16",
      "gdpr.article16",
      "article16.rectification",
      "gdpr.right.rectification",
    ],
    elements: [
      {
        elementId: "R1",
        proposition:
          "Inaccurate personal data must be rectified without undue delay upon request.",
        kind: "mandatory",
        proofGuidance:
          "An obligation on the controller/processor to correct inaccurate data, not merely a channel to 'submit a correction request'.",
        nonProofTraps: [
          "A clause allowing the data subject only to submit a request, with no duty to act on it.",
        ],
        remediationGuidance:
          "Obligate rectification of inaccurate personal data without undue delay.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "rectif",
          "correct inaccurate",
          "inaccurate",
          "without undue delay",
        ],
      },
      {
        elementId: "R2",
        proposition:
          "Incomplete personal data may be completed, including by means of a supplementary statement.",
        kind: "mandatory",
        proofGuidance:
          "Separate completion limb — supplementary statement or equivalent completion mechanism.",
        nonProofTraps: [
          "Correction of inaccurate data alone, with no completion / supplementary-statement language.",
        ],
        remediationGuidance:
          "Add a completion right, including by supplementary statement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "complete",
          "incomplete",
          "supplementary statement",
          "completion",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art17.erasure",
    canonicalKey: "gdpr.article17.erasure",
    legalCitation: "GDPR Article 17",
    title: "Right to erasure (right to be forgotten)",
    aggregationRule: "AND",
    aliases: [
      "art17_erasure",
      "gdpr.art17",
      "gdpr.article17",
      "article17.erasure",
      "gdpr.right.erasure",
      "right to be forgotten",
    ],
    elements: [
      {
        elementId: "E1",
        proposition:
          "Personal data must be erased without undue delay on a data-subject erasure request or when an Article 17(1) ground applies — not only upon contract termination.",
        kind: "mandatory",
        proofGuidance:
          "Mid-term erasure-on-request (or Art 17(1) grounds) mechanism. Narrow Art 17(3) retention exceptions are consistent and do not defeat this.",
        nonProofTraps: [
          "Deletion only 'upon termination of the Agreement' / 'at the end of the Term' with no mid-term erasure-request path.",
          "A generic 'we honor erasure rights' list item with no operative erase-on-request duty.",
        ],
        remediationGuidance:
          "Add a mid-term erasure-on-request obligation tied to Article 17(1) grounds, independent of contract end.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "eras",
          "right to be forgotten",
          "delete personal data",
          "erasure request",
          "upon request",
        ],
        requiredTokenGroups: [
          ["eras", "forgotten", "delete", "deletion"],
          [
            "request",
            "data subject",
            "individual",
            "withdraw",
            "object",
            "article 17",
          ],
        ],
      },
      {
        elementId: "E2",
        proposition:
          "Where personal data has been made public, reasonable steps are taken to inform other controllers processing the data that the data subject has requested erasure of links, copies, or replications.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the arrangement contemplates publication of personal data or making personal data public.",
        proofGuidance:
          "Article 17(2) take-down / notify-other-controllers assistance when data was made public.",
        nonProofTraps: [
          "A general subprocessor flow-down with no publication / other-controller notification on erasure.",
        ],
        remediationGuidance:
          "Add Article 17(2) reasonable-steps notice to other controllers where data was made public.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "made public",
          "publicly available",
          "other controllers",
          "links",
          "copies",
          "replications",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art18.restriction",
    canonicalKey: "gdpr.article18.restriction",
    legalCitation: "GDPR Article 18",
    title: "Right to restriction of processing",
    aggregationRule: "AND",
    aliases: [
      "art18_restriction",
      "gdpr.art18",
      "gdpr.article18",
      "article18.restriction",
      "gdpr.right.restriction",
    ],
    elements: [
      {
        elementId: "X1",
        proposition:
          "A distinct restriction remedy exists — data is marked/stored but not otherwise actively processed — separate from erasure and from continued normal processing.",
        kind: "mandatory",
        proofGuidance:
          "Restriction / marking language with limited permitted further processing (consent, legal claims, third-party rights, important public interest).",
        nonProofTraps: [
          "Only 'delete or keep processing' with no separate restriction option.",
          "Silence on restriction.",
        ],
        remediationGuidance:
          "Add a restriction-of-processing remedy distinct from erasure.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "restriction of processing",
          "restrict processing",
          "restrict",
          "mark the data",
          "marked",
        ],
      },
      {
        elementId: "X2",
        proposition:
          "Restriction is available for at least one Article 18(1) ground (contested accuracy, unlawful processing with erasure opposed, controller no longer needs the data but the data subject needs it for legal claims, or a pending objection).",
        kind: "mandatory",
        proofGuidance:
          "Tie the restriction right to one or more Art 18(1) triggers, not an undefined 'restriction' label alone.",
        nonProofTraps: [
          "Using the word 'restriction' without any ground or operative effect on processing.",
        ],
        remediationGuidance:
          "State the Article 18(1) grounds that trigger restriction.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "accuracy",
          "contested",
          "unlawful",
          "legal claims",
          "object",
          "pending",
        ],
      },
      {
        elementId: "X3",
        proposition:
          "The data subject is informed before a restriction is lifted.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the contract addresses lifting, ending, or withdrawing a restriction of processing.",
        proofGuidance:
          "Article 18(3) — inform before lifting the restriction.",
        nonProofTraps: [
          "A restriction clause that is silent on notice before lifting.",
        ],
        remediationGuidance:
          "Require notice to the data subject before lifting any restriction.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "lift",
          "lifting",
          "before lifting",
          "withdraw the restriction",
          "end the restriction",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art19.recipient_notification",
    canonicalKey: "gdpr.article19.recipient_notification",
    legalCitation: "GDPR Article 19",
    title:
      "Notification of rectification, erasure, or restriction to recipients",
    aggregationRule: "AND",
    aliases: [
      "art19_recipient_notification",
      "gdpr.art19",
      "gdpr.article19",
      "article19.recipient_notification",
      "gdpr.right.notification",
    ],
    elements: [
      {
        elementId: "N1",
        proposition:
          "Recipients to whom personal data has been disclosed are notified of any rectification, erasure, or restriction, unless impossible or involving disproportionate effort.",
        kind: "mandatory",
        proofGuidance:
          "Notice duty specifically triggered by rectification / erasure / restriction — not a generic Art 28(4) subprocessor flow-down of confidentiality or security.",
        nonProofTraps: [
          "Subprocessor flow-down of confidentiality/security with no rights-exercise recipient notice.",
          "Silence on notifying downstream recipients of rectification, erasure, or restriction.",
        ],
        remediationGuidance:
          "Require notification to recipients when data is rectified, erased, or restricted.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "notify recipients",
          "communicate rectification",
          "communicate erasure",
          "communicate restriction",
          "recipients to whom",
          "inform each recipient",
        ],
      },
      {
        elementId: "N2",
        proposition:
          "On request, the data subject is informed about those recipients.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the contract addresses informing the data subject about recipients of their personal data in connection with Article 19.",
        proofGuidance:
          "Article 19 second sentence — tell the data subject who the recipients were, on request.",
        nonProofTraps: [
          "A general recipient-categories disclosure in a privacy notice with no on-request Article 19 duty.",
        ],
        remediationGuidance:
          "Commit to informing the data subject of recipients on request after rectification, erasure, or restriction notices.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "inform the data subject",
          "on request",
          "those recipients",
          "identity of the recipients",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art20.portability",
    canonicalKey: "gdpr.article20.portability",
    legalCitation: "GDPR Article 20",
    title: "Right to data portability",
    aggregationRule: "AND",
    aliases: [
      "art20_portability",
      "gdpr.art20",
      "gdpr.article20",
      "article20.portability",
      "gdpr.right.portability",
    ],
    elements: [
      {
        elementId: "P1",
        proposition:
          "The data subject can receive the personal data they provided in a structured, commonly used, machine-readable format.",
        kind: "mandatory",
        proofGuidance:
          "Format commitment (structured / commonly used / machine-readable), not mere 'we will provide your data'.",
        nonProofTraps: [
          "Generic 'provide your data upon request' with no format commitment.",
          "PDF-only or unstructured dump presented as portability.",
        ],
        remediationGuidance:
          "Commit to a structured, commonly used, machine-readable export format.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "portability",
          "structured",
          "machine-readable",
          "commonly used",
          "export",
          "interoperable",
        ],
      },
      {
        elementId: "P2",
        proposition:
          "The data can be transmitted to another controller, including direct transmission where technically feasible.",
        kind: "mandatory",
        proofGuidance:
          "Transmission / direct-transfer limb — not only a self-service download.",
        nonProofTraps: [
          "Export-to-self only, with no transmission-to-another-controller path.",
        ],
        remediationGuidance:
          "Support transmission to another controller, including direct transmission where technically feasible.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "transmit",
          "transmission",
          "another controller",
          "third party",
          "direct transmission",
          "transfer to",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art21.objection",
    canonicalKey: "gdpr.article21.objection",
    legalCitation: "GDPR Article 21",
    title:
      "Right to object — legitimate interests / public task and direct marketing",
    aggregationRule: "AND",
    aliases: [
      "art21_objection",
      "gdpr.art21",
      "gdpr.article21",
      "article21.objection",
      "gdpr.right.object",
    ],
    elements: [
      {
        elementId: "O1",
        proposition:
          "The data subject can object to processing based on legitimate interests or public task; processing stops unless compelling legitimate grounds or legal-claims defense are demonstrated.",
        kind: "mandatory",
        proofGuidance:
          "Objection right distinct from erasure/restriction, tied to Art 6(1)(e)/(f)-style bases, with a limited continued-processing exception.",
        nonProofTraps: [
          "A generic 'objection' list item with no operative effect on processing.",
          "Marketing opt-out alone presented as the entire Article 21 right.",
        ],
        remediationGuidance:
          "Add an Article 21(1) objection right with the compelling-grounds / legal-claims override only.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "right to object",
          "object to processing",
          "legitimate interest",
          "legitimate interests",
          "public task",
          "compelling legitimate",
        ],
      },
      {
        elementId: "O2",
        proposition:
          "The data subject can object to direct-marketing processing (including related profiling) at any time, with no override.",
        kind: "mandatory",
        proofGuidance:
          "Separate, unconditional marketing objection / opt-out — no compelling-grounds override for marketing.",
        nonProofTraps: [
          "Only a general legitimate-interest objection with no distinct marketing limb.",
          "A marketing preference centre that still allows the controller to continue marketing after objection.",
        ],
        remediationGuidance:
          "Add an unconditional direct-marketing objection right, including related profiling.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "direct marketing",
          "marketing",
          "opt out",
          "opt-out",
          "unsubscribe",
          "profiling",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art22.automated_decisions",
    canonicalKey: "gdpr.article22.automated_decisions",
    legalCitation: "GDPR Article 22",
    title:
      "Automated individual decision-making, including profiling — safeguards",
    aggregationRule: "AND",
    aliases: [
      "art22_automated_decisions",
      "gdpr.art22",
      "gdpr.article22",
      "article22.automated_decisions",
      "gdpr.right.automated_decisions",
    ],
    elements: [
      {
        elementId: "AD1",
        proposition:
          "Where solely automated decision-making producing legal or similarly significant effects is described, an Article 22(2) exception is identified (contract necessity, authorised by law with safeguards, or explicit consent).",
        kind: "conditional",
        applicabilityRule:
          "Applies only when the contract describes solely automated decision-making (including profiling) that produces legal effects or similarly significantly affects a data subject. If no such ADM is described, treat as not applicable — neither proved nor contradicted.",
        proofGuidance:
          "Name which Art 22(2) exception applies. A generic 'we comply with data protection law' statement is not enough.",
        nonProofTraps: [
          "Describing scoring, screening, or eligibility automation with no Art 22(2) exception.",
          "A blanket compliance recital with no operative ADM safeguards.",
        ],
        remediationGuidance:
          "Identify the Article 22(2) exception that authorises the automated decision-making.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "automated",
          "solely automated",
          "profiling",
          "decision-making",
          "scoring",
          "explicit consent",
        ],
      },
      {
        elementId: "AD2",
        proposition:
          "Where such automated decision-making applies, the data subject has at least the rights to human intervention, to express their point of view, and to contest the decision.",
        kind: "conditional",
        applicabilityRule:
          "Applies under the same conditions as AD1 — solely automated decision-making with legal or similarly significant effects is described.",
        proofGuidance:
          "Operative human-intervention / express-view / contest rights for in-scope ADM.",
        nonProofTraps: [
          "ADM described with no human-review or contest mechanism.",
        ],
        remediationGuidance:
          "Provide human intervention, a right to express a view, and a right to contest the decision.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "human intervention",
          "human review",
          "express a view",
          "contest",
          "challenge the decision",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
