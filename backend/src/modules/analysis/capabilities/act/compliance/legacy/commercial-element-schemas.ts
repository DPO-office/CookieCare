/**
 * Commercial graded element schemas — MSA and SaaS structural review only.
 *
 * Each requirement is split into discrete commercial limbs so Phase 5 can
 * report Partial when only one limb is met — matching the near-miss language
 * in `msa` and `saas-agreement` skill.config.ts `requirementEvidence`
 * blocks. Aliases include package-native ids (`msa.work_product_ownership`,
 * `saas.availability_sla`, …).
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

export const COMMERCIAL_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "msa.work_product_ownership",
    canonicalKey: "msa.work_product_ownership",
    legalCitation: "MSA AI Prompt Repository Playbook, Sections B1–B2",
    title: "Customer ownership of custom work product",
    aggregationRule: "AND",
    aliases: [
      "msa.work_product_ownership",
      "work_product_ownership",
      "msa_vendor_owns_work_product",
    ],
    elements: [
      {
        elementId: "WP1",
        proposition:
          "Custom deliverables and work product created for the customer vest in or are assigned to the customer upon payment.",
        kind: "mandatory",
        proofGuidance:
          "Customer vesting/assignment of custom deliverables — 'work product vests in Customer', 'assigns to Customer upon payment'. Vendor retention of custom deliverables with only a licence to customer is the contradicting position.",
        nonProofTraps: [
          "Vendor retains ownership of custom deliverables and merely licenses them to the customer.",
          "A generic IP clause with no work-product vesting on payment.",
        ],
        remediationGuidance:
          "Vest or assign custom work product in the customer upon payment.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "work product",
          "deliverables",
          "vests in",
          "assigns to",
          "upon payment",
          "customer owns",
        ],
      },
      {
        elementId: "WP2",
        proposition:
          "The vendor retains background/pre-existing IP and grants the customer a licence to use any such IP embedded in the deliverables.",
        kind: "mandatory",
        proofGuidance:
          "Background-IP carve-out + embedded-IP licence — vendor keeps pre-existing IP; customer gets a licence to use it as incorporated in deliverables.",
        nonProofTraps: [
          "Customer vesting language with no background-IP reservation or embedded-IP licence.",
          "A blanket 'all IP belongs to vendor' clause with no customer licence for embedded background IP.",
        ],
        remediationGuidance:
          "Reserve vendor background IP and grant the customer a licence to embedded pre-existing IP in deliverables.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "background ip",
          "pre-existing ip",
          "preexisting",
          "embedded",
          "licence",
          "license",
          "retains ownership",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "msa.liability_cap_baseline",
    canonicalKey: "msa.liability_cap_baseline",
    legalCitation: "MSA AI Prompt Repository Playbook, Sections E1–E2",
    title: "Mutual liability cap at least 12 months' fees with named carve-outs",
    aggregationRule: "AND",
    aliases: [
      "msa.liability_cap_baseline",
      "liability_cap_baseline",
      "msa_weak_liability_cap",
    ],
    elements: [
      {
        elementId: "LC1",
        proposition:
          "The limitation of liability applies mutually to both parties — not a unilateral cap protecting only the vendor (or only the customer).",
        kind: "mandatory",
        proofGuidance:
          "Mutual cap — liability limits bind both parties symmetrically. A vendor-only cap with the customer uncapped (or vice versa) is a gap.",
        nonProofTraps: [
          "A unilateral cap limiting only the vendor's liability while the customer's liability is uncapped.",
          "An uncapped liability clause with no structured cap at all (does not prove this baseline either).",
        ],
        remediationGuidance:
          "Make the liability cap mutual — apply to both parties.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "each party",
          "both parties",
          "mutual",
          "aggregate liability",
          "limitation of liability",
        ],
      },
      {
        elementId: "LC2",
        proposition:
          "The cap is set at a numeric level equal to or greater than approximately 12 months' fees paid or payable (or an equivalent annual-contract-value formulation).",
        kind: "mandatory",
        proofGuidance:
          "Numeric floor — '12 months' fees', 'fees paid in the preceding 12 months', '1x ACV', or equivalent. A cap below 12 months or with no numeric level is partial.",
        nonProofTraps: [
          "A cap below 12 months' fees with no stated baseline.",
          "A fixed nominal amount unrelated to fees/ACV that is materially below 12 months' fees.",
        ],
        remediationGuidance:
          "Set the liability cap at no less than approximately 12 months' fees or equivalent ACV.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "12 months",
          "twelve months",
          "fees paid",
          "fees payable",
          "annual contract value",
          "acv",
          "preceding 12",
        ],
      },
      {
        elementId: "LC3",
        proposition:
          "Named carve-outs from the cap exist for at least IP infringement, confidentiality breach, and gross negligence or willful misconduct (typically uncapped or super-capped).",
        kind: "mandatory",
        proofGuidance:
          "Carve-out structure — exceptions for IP infringement, confidentiality, and gross negligence/willful misconduct. A cap with no carve-outs is a gap.",
        nonProofTraps: [
          "A mutual 12-month cap with no carve-outs for IP, confidentiality, or gross negligence.",
          "A blanket cap with no named exceptions.",
        ],
        remediationGuidance:
          "Add carve-outs from the cap for IP infringement, confidentiality breach, and gross negligence/willful misconduct.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "carve-out",
          "carve out",
          "except",
          "excluded",
          "ip infringement",
          "confidentiality",
          "gross negligence",
          "willful misconduct",
          "wilful misconduct",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "saas.availability_sla",
    canonicalKey: "saas.availability_sla",
    legalCitation: "MSite SaaS Terms & Conditions cl. 2.7 (benchmark)",
    title: "Numeric availability SLA with measurement window and exclusions",
    aggregationRule: "AND",
    aliases: [
      "saas.availability_sla",
      "availability_sla",
      "missing_sla_uptime",
    ],
    elements: [
      {
        elementId: "SL1",
        proposition:
          "The SaaS terms state a specific numeric availability percentage (benchmark: at least 99%).",
        kind: "mandatory",
        proofGuidance:
          "Numeric uptime/availability commitment — '99%', '99.9% availability'. Best-efforts or 'commercially reasonable uptime' without a percentage is not enough.",
        nonProofTraps: [
          "A best-efforts or 'commercially reasonable uptime' statement with no numeric percentage.",
          "A numeric percentage below approximately 99% without justification as a partial gap.",
        ],
        remediationGuidance:
          "State a numeric availability percentage (benchmark: at least 99%).",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "99%",
          "99.9%",
          "availability",
          "uptime",
          "service level",
          "percent",
        ],
      },
      {
        elementId: "SL2",
        proposition:
          "The availability commitment has a stated measurement window (e.g. monthly or quarterly).",
        kind: "mandatory",
        proofGuidance:
          "Measurement period — 'measured quarterly', 'per calendar month', 'during each measurement period'. A percentage with no window is partial.",
        nonProofTraps: [
          "A numeric availability percentage with no measurement window.",
          "An undefined 'per period' reference with no calendar anchor.",
        ],
        remediationGuidance:
          "Add a stated measurement window for the availability commitment.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "measured",
          "measurement period",
          "quarterly",
          "monthly",
          "calendar month",
          "per month",
        ],
      },
      {
        elementId: "SL3",
        proposition:
          "Stated maintenance windows and exclusions from availability measurement are defined (planned/unscheduled maintenance, excluded downtime).",
        kind: "mandatory",
        proofGuidance:
          "Exclusions — planned maintenance windows, scheduled downtime, and/or excluded downtime categories. Silence on exclusions is a gap when an SLA is otherwise present.",
        nonProofTraps: [
          "An availability percentage with no maintenance or exclusion language.",
          "A blanket 'excluding force majeure' with no maintenance-window definition.",
        ],
        remediationGuidance:
          "Define maintenance windows and exclusions from availability measurement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "maintenance",
          "maintenance window",
          "planned maintenance",
          "scheduled maintenance",
          "excluded downtime",
          "exclusion",
          "downtime",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
