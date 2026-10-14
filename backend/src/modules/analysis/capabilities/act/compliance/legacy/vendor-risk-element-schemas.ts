/**
 * EBA outsourcing, NIST 800-161 C-SCRM, and NIST CSF Detect/Respond/Recover
 * graded element schemas.
 *
 * Each requirement is split into discrete limbs so Phase 5 can report Partial
 * when only one limb is met — matching the near-miss language in
 * `vendor_risk.structural_review.requirementEvidence` and
 * `cybersecurity.structural_review.requirementEvidence`.
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

export const VENDOR_RISK_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "eba.outsourcing.audit_access",
    canonicalKey: "eba.outsourcing.audit_access",
    legalCitation: "EBA/GL/2019/02 §13.3 Access, information and audit rights",
    title: "Access, information, and audit rights over outsourced services",
    aggregationRule: "AND",
    aliases: [
      "eba.outsourcing.audit_access",
      "eba_audit_access",
      "audit_access_rights",
    ],
    elements: [
      {
        elementId: "AA1",
        proposition:
          "The institution retains access rights over the outsourced service — including to relevant records, systems, or facilities needed to verify performance and compliance.",
        kind: "mandatory",
        proofGuidance:
          "Operative access language (physical or logical) over the outsourced function, not merely a right to receive summary reports.",
        nonProofTraps: [
          "A right limited solely to receiving SOC/ISO reports with no records or on-site access option.",
          "Silence on access entirely for critical/important outsourcing.",
        ],
        remediationGuidance:
          "Grant the institution access rights over records, systems, or facilities relevant to the outsourced function.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "access rights",
          "right of access",
          "access to records",
          "access to facilities",
          "inspect",
        ],
      },
      {
        elementId: "AA2",
        proposition:
          "The institution retains information rights — timely provision of information necessary to assess the outsourced function, risks, and compliance.",
        kind: "mandatory",
        proofGuidance:
          "Information-rights limb distinct from audit mechanics — duty to provide relevant operational, security, or compliance information on request or on a schedule.",
        nonProofTraps: [
          "Audit rights alone with no separate information-provision duty.",
          "A generic confidentiality carve-out that eliminates information rights entirely.",
        ],
        remediationGuidance:
          "Require timely provision of information necessary to assess the outsourced service and associated risks.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "information rights",
          "provide information",
          "make available information",
          "reporting",
          "transparency",
        ],
      },
      {
        elementId: "AA3",
        proposition:
          "The institution (and, where stated, the competent authority) may conduct audits or inspections of the outsourced service, including by an independent auditor.",
        kind: "mandatory",
        proofGuidance:
          "Audit/inspection right with reasonable notice and confidentiality conditions acceptable; certification-only substitutes are partial at best.",
        nonProofTraps: [
          "Certification or audit-report delivery with no independent audit or inspection right.",
          "Audit rights subject to counterparty refusal without cause.",
        ],
        remediationGuidance:
          "Grant audit and inspection rights, including for the competent authority where applicable.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "audit rights",
          "audit",
          "inspection",
          "independent auditor",
          "competent authority",
          "regulator",
        ],
      },
      {
        elementId: "AA4",
        proposition:
          "Where sub-outsourcing is contemplated, access, information, and audit rights reach sub-outsourced service locations or equivalent flow-down obligations apply.",
        kind: "conditional",
        applicabilityRule:
          "Applies when the arrangement contemplates sub-outsourcing, subcontractors, or third-party service locations.",
        proofGuidance:
          "Sub-location reach or flow-down of audit/access/information rights to sub-outsourcers — not merely a list of approved subcontractors.",
        nonProofTraps: [
          "Subcontractor use permitted with no audit/access reach to sub-locations.",
          "A subprocessor list with no flow-down of audit or access rights.",
        ],
        remediationGuidance:
          "Extend audit, access, and information rights to sub-outsourced locations or flow them down contractually.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "sub-outsourcing",
          "subcontractor",
          "sub-processor",
          "sub-outsourced",
          "flow-down",
          "third party locations",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "eba.outsourcing.exit",
    canonicalKey: "eba.outsourcing.exit",
    legalCitation:
      "EBA/GL/2019/02 exit-strategy expectations for critical or important functions",
    title: "Documented exit strategy and termination assistance",
    aggregationRule: "AND",
    aliases: ["eba.outsourcing.exit", "eba_exit_strategy", "exit_strategy"],
    elements: [
      {
        elementId: "EX1",
        proposition:
          "A documented exit strategy or express exit-plan commitment exists for the outsourced critical or important function.",
        kind: "mandatory",
        proofGuidance:
          "Exit strategy, transition plan, or reintegration plan language tied to the outsourced function — not merely generic termination rights.",
        nonProofTraps: [
          "Termination-for-convenience alone with no exit-strategy or transition-plan commitment.",
          "Silence on exit planning for critical/important outsourcing.",
        ],
        remediationGuidance:
          "Document an exit strategy enabling reintegration or transfer of the outsourced function.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "exit strategy",
          "exit plan",
          "transition plan",
          "reintegration",
          "wind-down plan",
        ],
      },
      {
        elementId: "EX2",
        proposition:
          "Contractual termination assistance or equivalent transition services enable reintegration or transfer without undue disruption.",
        kind: "mandatory",
        proofGuidance:
          "Termination assistance, transition services, knowledge transfer, or data/service handback mechanics — operative, not aspirational.",
        nonProofTraps: [
          "A bare right to terminate with no assistance or transition period.",
          "Exit strategy language with no contractual assistance obligation.",
        ],
        remediationGuidance:
          "Add termination assistance or transition services enabling orderly transfer or reintegration.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "termination assistance",
          "transition services",
          "transfer of services",
          "knowledge transfer",
          "handover",
          "wind-down assistance",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "eba.outsourcing.suboutsourcing",
    canonicalKey: "eba.outsourcing.suboutsourcing",
    legalCitation:
      "EBA/GL/2019/02 §13.1 Sub-outsourcing of critical or important functions",
    title: "Control of sub-outsourcing of critical functions",
    aggregationRule: "AND",
    aliases: [
      "eba.outsourcing.suboutsourcing",
      "eba_suboutsourcing",
      "suboutsourcing_controls",
    ],
    elements: [
      {
        elementId: "SO1",
        proposition:
          "Sub-outsourcing of critical or important functions requires prior notice and/or prior consent before appointment.",
        kind: "mandatory",
        proofGuidance:
          "Prior notice or prior written consent mechanism before sub-outsourcing — not merely post-hoc notification.",
        nonProofTraps: [
          "A free right to use subcontractors without notice or consent.",
          "Post-appointment notification only with no objection or consent window.",
        ],
        remediationGuidance:
          "Require prior notice and/or consent before sub-outsourcing critical or important functions.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "prior notice",
          "prior consent",
          "prior written consent",
          "sub-outsourcing",
          "subcontractor",
          "approval",
        ],
      },
      {
        elementId: "SO2",
        proposition:
          "Audit, access, and security (or equivalent) duties flow down to sub-outsourcers by contract.",
        kind: "mandatory",
        proofGuidance:
          "Flow-down of audit, access, and security obligations — equivalent obligations language tied to sub-outsourcers.",
        nonProofTraps: [
          "Notice/consent alone with no flow-down of audit, access, or security duties.",
          "A general 'subcontractors must comply with law' statement with no equivalent contractual flow-down.",
        ],
        remediationGuidance:
          "Flow down audit, access, and security obligations to sub-outsourcers by contract.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "flow-down",
          "equivalent obligations",
          "same obligations",
          "sub-outsourcer",
          "subcontractor",
          "audit",
          "security",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "nist.800161.cscm",
    canonicalKey: "nist.800161.cscm",
    legalCitation:
      "NIST SP 800-161r1 Cybersecurity Supply Chain Risk Management",
    title: "C-SCRM supplier assessment, flow-down, and monitoring",
    aggregationRule: "AND",
    aliases: ["nist.800161.cscm", "nist_cscm", "cscm_practices"],
    elements: [
      {
        elementId: "CS1",
        proposition:
          "Supplier assessment or due-diligence practices address cyber supply-chain risk before engagement or onboarding.",
        kind: "mandatory",
        proofGuidance:
          "Supplier assessment, vendor diligence, or onboarding security review — applies only where NIST 800-161 is the chosen standard.",
        nonProofTraps: [
          "Generic 'industry security practices' with no supplier-assessment content.",
          "Silence on supplier assessment where NIST 800-161 is invoked as the standard.",
        ],
        remediationGuidance:
          "Add supplier assessment or due-diligence practices for cyber supply-chain risk.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "supplier assessment",
          "vendor assessment",
          "due diligence",
          "onboarding",
          "800-161",
          "c-scrm",
        ],
      },
      {
        elementId: "CS2",
        proposition:
          "Security requirements flow down to suppliers, subcontractors, or downstream service providers.",
        kind: "mandatory",
        proofGuidance:
          "Flow-down of security requirements to the supply chain — contractual or operational pass-through.",
        nonProofTraps: [
          "Supplier assessment alone with no security-requirement flow-down.",
          "A provider-only security clause with no downstream pass-through.",
        ],
        remediationGuidance:
          "Flow down security requirements to suppliers and subcontractors.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "flow-down",
          "security requirements",
          "supplier",
          "subcontractor",
          "downstream",
          "supply chain",
        ],
      },
      {
        elementId: "CS3",
        proposition:
          "Ongoing monitoring of supplier or supply-chain security posture is addressed.",
        kind: "mandatory",
        proofGuidance:
          "Ongoing monitoring, periodic reassessment, or continuous oversight of supplier security — not one-time onboarding only.",
        nonProofTraps: [
          "One-time due diligence with no ongoing monitoring commitment.",
          "Silence on monitoring where NIST 800-161 is the chosen standard.",
        ],
        remediationGuidance:
          "Add ongoing monitoring or periodic reassessment of supplier security posture.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "ongoing monitoring",
          "continuous monitoring",
          "periodic assessment",
          "reassessment",
          "supply chain risk",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "nist.csf.detect_respond_recover",
    canonicalKey: "nist.csf.detect_respond_recover",
    legalCitation:
      "NIST CSF 2.0 Detect (DE), Respond (RS), Recover (RC) functions",
    title: "CSF Detect, Respond, and Recover outcomes in incident language",
    aggregationRule: "AND",
    aliases: [
      "nist.csf.detect_respond_recover",
      "nist_csf_drr",
      "detect_respond_recover",
    ],
    elements: [
      {
        elementId: "DR1",
        proposition:
          "Incident-related language addresses detection capability — identifying anomalous activity, security events, or potential incidents.",
        kind: "mandatory",
        proofGuidance:
          "Detect outcomes: monitoring, detection, alerting, or security-event identification — applies only where CSF 2.0 is a binding contractual standard.",
        nonProofTraps: [
          "Notification timing alone with no detection or monitoring capability.",
          "Silence on detection where CSF is binding.",
        ],
        remediationGuidance:
          "Address detection capability in incident-response or security provisions.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "detect",
          "detection",
          "monitoring",
          "security event",
          "anomal",
          "alert",
        ],
      },
      {
        elementId: "DR2",
        proposition:
          "A response process exists — containment, investigation, escalation, or coordinated incident response after detection.",
        kind: "mandatory",
        proofGuidance:
          "Respond outcomes: incident response plan, escalation, containment, or coordinated response — distinct from mere notification to a counterparty.",
        nonProofTraps: [
          "A bare 'notify within X hours' clause with no response process.",
          "Detection language with no response mechanics.",
        ],
        remediationGuidance:
          "Add an incident response process covering containment, investigation, or escalation.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "respond",
          "response",
          "incident response",
          "containment",
          "escalation",
          "investigation",
        ],
      },
      {
        elementId: "DR3",
        proposition:
          "Recovery or restoration commitments address returning to normal operations after an incident.",
        kind: "mandatory",
        proofGuidance:
          "Recover outcomes: restoration, business continuity, disaster recovery, or return-to-operations — not notification-only.",
        nonProofTraps: [
          "Incident notification with no recovery or restoration commitment.",
          "Response process alone with no restoration or continuity language.",
        ],
        remediationGuidance:
          "Add recovery or restoration commitments after security incidents.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "recover",
          "recovery",
          "restoration",
          "restore",
          "business continuity",
          "disaster recovery",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
