/**
 * HIPAA BAA graded element schemas.
 *
 * Multi-limb requirements from `hipaa-baa/skill.config.ts` requirementEvidence
 * are split so Phase 5 can report Partial when only one limb is met — matching
 * the near-miss language in that package (e.g. technical-only safeguards,
 * breach notice without discovery trigger). Aliases include package-native ids
 * and regime ruleIds.
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

export const HIPAA_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "hipaa.baa.safeguards",
    canonicalKey: "hipaa.baa.safeguards",
    legalCitation: "45 CFR §164.314 / HIPAA Security Rule",
    title:
      "Administrative, physical, and technical safeguards for ePHI",
    aggregationRule: "AND",
    aliases: [
      "hipaa_safeguards",
      "hipaa.baa.safeguards",
      "security_safeguards",
    ],
    elements: [
      {
        elementId: "SF1",
        proposition:
          "The business associate implements administrative safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
        kind: "mandatory",
        proofGuidance:
          "Administrative safeguards must be expressly addressed — policies, workforce training, access management, or equivalent Security Rule administrative controls.",
        nonProofTraps: [
          "A general 'information security measures' clause with no administrative safeguards named.",
          "Technical/IT security language alone with no administrative limb.",
        ],
        remediationGuidance:
          "Add administrative safeguards appropriate to protect ePHI confidentiality, integrity, and availability.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "administrative safeguards",
          "administrative",
          "policies and procedures",
          "workforce training",
          "access management",
        ],
      },
      {
        elementId: "SF2",
        proposition:
          "The business associate implements physical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
        kind: "mandatory",
        proofGuidance:
          "Physical safeguards must be expressly addressed — facility access, workstation security, device/media controls, or equivalent.",
        nonProofTraps: [
          "Technical security controls alone with no physical safeguards named.",
          "A bare Security Rule cross-reference with no substantive physical safeguard content.",
        ],
        remediationGuidance:
          "Add physical safeguards appropriate to protect ePHI confidentiality, integrity, and availability.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "physical safeguards",
          "physical",
          "facility access",
          "workstation security",
          "device and media",
        ],
      },
      {
        elementId: "SF3",
        proposition:
          "The business associate implements technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of electronic PHI.",
        kind: "mandatory",
        proofGuidance:
          "Technical safeguards must be expressly addressed — access control, audit controls, integrity, transmission security, or equivalent.",
        nonProofTraps: [
          "Administrative and physical safeguards named but no technical safeguards.",
          "A bare 'Business Associate will comply with the Security Rule' cross-reference with no substantive safeguard content — treat as partial, not full proof.",
        ],
        remediationGuidance:
          "Add technical safeguards appropriate to protect ePHI confidentiality, integrity, and availability.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "technical safeguards",
          "technical",
          "access control",
          "audit controls",
          "transmission security",
          "encryption",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "hipaa.baa.subcontractor_flowdown",
    canonicalKey: "hipaa.baa.subcontractor_flowdown",
    legalCitation: "45 CFR §164.504(e)(2)(ii)(D)",
    title: "Subcontractor BAAs with equivalent restrictions",
    aggregationRule: "AND",
    aliases: [
      "hipaa.baa.subcontractor_flowdown",
      "subprocessor_flow_down",
    ],
    elements: [
      {
        elementId: "SC1",
        proposition:
          "Agents and subcontractors that create, receive, maintain, or transmit PHI for the business associate are bound in writing to restrictions on PHI use and disclosure.",
        kind: "mandatory",
        proofGuidance:
          "Look for a written binding requirement for subcontractors/agents handling PHI — not merely an expectation of compliance with law.",
        nonProofTraps: [
          "A general statement that subcontractors must 'comply with applicable law' with no written BAA-equivalent binding requirement.",
          "Silence on subcontractors entirely when the business associate may use agents or subcontractors.",
        ],
        remediationGuidance:
          "Require agents and subcontractors handling PHI to be bound in writing by appropriate restrictions.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "subcontractor",
          "agent",
          "written agreement",
          "business associate agreement",
          "in writing",
          "flow down",
          "flow-down",
        ],
      },
      {
        elementId: "SC2",
        proposition:
          "Those written restrictions are at least as protective as the BAA itself, including Security Rule safeguards for ePHI.",
        kind: "mandatory",
        proofGuidance:
          "The flow-down must reach BAA-equivalent or 'same restrictions' / 'at least as protective' language, including Security Rule safeguards for ePHI.",
        nonProofTraps: [
          "A requirement that subcontractors sign 'appropriate agreements' with no 'same' or 'at least as protective' standard.",
          "Written subcontractor agreements that omit Security Rule safeguards for ePHI.",
        ],
        remediationGuidance:
          "Require subcontractor/agent restrictions that are the same as or at least as protective as the BAA, including Security Rule safeguards.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "same restrictions",
          "at least as protective",
          "substantially similar",
          "security rule safeguards",
          "equivalent protections",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "hipaa.baa.breach_notice",
    canonicalKey: "hipaa.baa.breach_notice",
    legalCitation: "45 CFR §164.410",
    title:
      "Prompt breach and security-incident notice to the covered entity",
    aggregationRule: "AND",
    aliases: [
      "hipaa.baa.breach_notice",
      "breach_notice_timing",
      "breach_notification",
    ],
    elements: [
      {
        elementId: "BN1",
        proposition:
          "The business associate must notify the covered entity in writing of a Breach or Security Incident within a numeric deadline at or inside HIPAA's outer 60-day limit (a shorter, more protective window also satisfies this).",
        kind: "mandatory",
        proofGuidance:
          "Look for a numeric notice deadline — e.g. 60 days, 30 days, two business days — not merely 'promptly' or 'without unreasonable delay' with no backstop.",
        nonProofTraps: [
          "A purely vague standard ('promptly notify', 'without unreasonable delay') with no numeric backstop.",
          "A notice window longer than 60 days from any trigger.",
        ],
        remediationGuidance:
          "State a numeric written notice deadline at or inside the 60-day HIPAA outer limit.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "60 days",
          "sixty days",
          "two business days",
          "5 business days",
          "30 days",
          "no later than",
          "no event more than",
        ],
      },
      {
        elementId: "BN2",
        proposition:
          "The notice deadline is measured from discovery of the breach or security incident, not from confirmation, investigation completion, or another later trigger.",
        kind: "mandatory",
        proofGuidance:
          "The trigger must be discovery-based. A deadline measured from 'confirmation of a reportable breach' or similar is a near-miss.",
        nonProofTraps: [
          "A numeric deadline measured from confirmation of a reportable breach rather than discovery.",
          "A deadline measured from completion of an investigation or determination that a breach occurred.",
        ],
        remediationGuidance:
          "Tie the notice deadline to discovery of the breach or security incident.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "discovery of the breach",
          "discovery of",
          "upon discovery",
          "date of discovery",
          "discovered",
          "security incident",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "hipaa.baa.return_or_destroy",
    canonicalKey: "hipaa.baa.return_or_destroy",
    legalCitation: "45 CFR §164.504(e)(2)(ii)(J)",
    title: "Return or destroy PHI at termination",
    aggregationRule: "AND",
    aliases: [
      "hipaa.baa.return_or_destroy",
      "return_or_destroy",
      "deletion_on_termination",
    ],
    elements: [
      {
        elementId: "RD1",
        proposition:
          "On termination, the business associate must return or destroy PHI in its possession (including copies not otherwise retained as permitted by law).",
        kind: "mandatory",
        proofGuidance:
          "Look for a termination-triggered return-or-destroy obligation for PHI — either branch or an election between them satisfies this element.",
        nonProofTraps: [
          "A confidentiality-survival clause with no return or destruction at termination.",
          "Destruction-only language with no return branch where return may be required.",
        ],
        remediationGuidance:
          "Require return or destruction of PHI upon termination of the arrangement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "return or destroy",
          "return and destroy",
          "upon termination",
          "at termination",
          "destroy phi",
          "return phi",
        ],
        requiredTokenGroups: [
          ["return", "destroy", "destruction"],
          ["termination", "terminate", "expir", "end of"],
          ["phi", "protected health information"],
        ],
      },
      {
        elementId: "RD2",
        proposition:
          "Where return or destruction is not feasible, the same protections of the BAA continue to apply to any retained PHI for as long as it is retained.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the contract addresses return or destruction of PHI at termination. A clause requiring return/destroy with no infeasibility carve-out is a partial gap on this element specifically.",
        proofGuidance:
          "The infeasibility exception must extend continuing BAA protections to retained PHI — not merely permit retention without safeguards.",
        nonProofTraps: [
          "A return-or-destroy clause with no infeasibility exception at all.",
          "An infeasibility carve-out that permits retention but does not extend BAA protections to retained PHI.",
        ],
        remediationGuidance:
          "Add an infeasibility exception under which the same BAA protections continue for retained PHI.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "not feasible",
          "infeasible",
          "extend the protections",
          "same protections",
          "as long as retained",
          "continuing protections",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
