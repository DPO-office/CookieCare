/**
 * GDPR Article 28 graded element schemas — remaining mandatory-clauses and
 * chapeau requirements not already in `ARTICLE_28_ELEMENT_REGISTRY`.
 *
 * Each requirement is split into discrete legal limbs so Phase 5 can report
 * Partial when only one limb is met — matching the near-miss language in
 * `gdpr.art28.3.mandatory_clauses` / `gdpr.art28.3.chapeau`
 * `requirementEvidence` blocks in skill.config.ts. Aliases include the
 * package-native ids (`art28_3_c_security`, `controller_obligations_rights`, …).
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

export const ARTICLE_28_REMAINING_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "gdpr.art28.controller_obligations_rights",
    canonicalKey: "gdpr.article28.controller_obligations_and_rights",
    legalCitation: "GDPR Article 28(3), preamble — controller obligations and rights",
    title: "Controller obligations and rights particular",
    aggregationRule: "AND",
    aliases: [
      "controller_obligations_rights",
      "controller_obligations_and_rights",
      "article28.controller_obligations_rights",
      "article28.controller_obligations_and_rights",
      "gdpr.article28.controller_obligations_rights",
    ],
    elements: [
      {
        elementId: "CO1",
        proposition:
          "The contract states what the controller must do in connection with the processing — e.g. give lawful documented instructions, ensure a legal basis, comply with data protection laws, or minimise personal data.",
        kind: "mandatory",
        proofGuidance:
          "Controller-side duties — not processor obligations dressed as controller language. Look for 'the Controller shall', 'Controller warrants', or equivalent controller obligations.",
        nonProofTraps: [
          "A clause describing only the processor's duties (the common Art 28(3)(a)-(h) content) with no controller obligation.",
          "A generic mutual compliance recital that does not name a controller-specific duty.",
        ],
        remediationGuidance:
          "Add controller obligations (lawful instructions, legal basis, compliance with data protection laws, or data minimisation).",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "controller shall",
          "controller warrants",
          "lawful instructions",
          "legal basis",
          "data protection laws",
          "minimise",
          "minimize",
        ],
      },
      {
        elementId: "CO2",
        proposition:
          "The contract states what the controller is entitled to do — e.g. give instructions, audit or inspect the processor's compliance, or exercise other controller rights over the processing.",
        kind: "mandatory",
        proofGuidance:
          "Controller-side rights or entitlements — audit/inspection powers, instruction rights, or similar controller prerogatives distinct from processor covenants.",
        nonProofTraps: [
          "Processor audit obligations framed only as what the processor must permit, with no controller right to exercise them.",
          "A processor-only compliance clause with no controller entitlement named.",
        ],
        remediationGuidance:
          "Add controller rights (instructions, audit/inspection, or other controller entitlements over the processing).",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "controller may",
          "controller's right",
          "controller right",
          "audit",
          "inspect",
          "instructions",
          "entitled",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.c.security_measures",
    canonicalKey: "gdpr.article28.3c.security_measures",
    legalCitation: "GDPR Article 28(3)(c)",
    title: "Appropriate technical and organisational security measures",
    aggregationRule: "AND",
    aliases: [
      "art28_3_c_security",
      "gdpr.article28.3c.security_measures",
      "article28.3c.security_measures",
      "security_measures",
    ],
    elements: [
      {
        elementId: "C1",
        proposition:
          "The processor is obligated to implement appropriate technical and organisational measures to protect personal data (a TOMs/security covenant, not a bare compliance aspiration).",
        kind: "mandatory",
        proofGuidance:
          "An operative obligation on the processor to implement technical and organisational measures appropriate to the risk — may reference Article 32 or 'appropriate security measures'.",
        nonProofTraps: [
          "A generic 'comply with Data Protection Laws' statement with no security-measures obligation.",
          "A confidentiality clause with no technical/organisational security commitment.",
        ],
        remediationGuidance:
          "Add an Article 28(3)(c) / Article 32 security-measures obligation on the processor.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "technical and organi",
          "security measures",
          "appropriate measures",
          "article 32",
          "tom",
          "safeguards",
        ],
      },
      {
        elementId: "C2",
        proposition:
          "The security commitment is substantiated — by named measures (encryption, access controls, resilience, testing) or by an incorporated security exhibit/schedule whose content is confirmed in the reviewed materials.",
        kind: "mandatory",
        proofGuidance:
          "Substantive security content — enumerated controls, risk-appropriate measures, or a confirmed security exhibit/schedule. A bare pointer to 'the Information Security Exhibit' counts only if that exhibit is supplied and contains measures.",
        nonProofTraps: [
          "A bare cross-reference to an Information Security Exhibit or security schedule that is not supplied or confirmed to contain measures.",
          "A one-line 'industry-standard security' promise with no measures, exhibit, or schedule.",
        ],
        remediationGuidance:
          "Substantiate the security obligation with named measures or attach/incorporate a security exhibit with actual controls.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "encrypt",
          "access control",
          "resilien",
          "testing",
          "security exhibit",
          "security schedule",
          "security appendix",
          "iso 27001",
          "soc 2",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.d.subprocessors",
    canonicalKey: "gdpr.article28.3d.subprocessors",
    legalCitation: "GDPR Article 28(2) and 28(3)(d)",
    title: "Subprocessor authorisation, notice, and engagement",
    aggregationRule: "AND",
    aliases: [
      "art28_3_d_subprocessors",
      "gdpr.article28.3d.subprocessors",
      "article28.3d.subprocessors",
      "subprocessors",
    ],
    elements: [
      {
        elementId: "D1",
        proposition:
          "The processor must obtain the controller's prior general or specific written authorisation before engaging a subprocessor.",
        kind: "mandatory",
        proofGuidance:
          "Prior written authorisation — specific (per subprocessor) or general (list + changes). 'May engage subprocessors' or notice-only language is not enough.",
        nonProofTraps: [
          "A clause that merely says the processor 'will notify' or 'may engage subprocessors' without prior authorisation.",
          "A published subprocessor list with no authorisation mechanism.",
        ],
        remediationGuidance:
          "Require prior general or specific written authorisation before engaging any subprocessor.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "prior",
          "authoris",
          "authoriz",
          "written consent",
          "written approval",
          "general authorisation",
          "specific authorisation",
        ],
      },
      {
        elementId: "D2",
        proposition:
          "Where general authorisation applies, the controller receives advance notice of subprocessor changes and a meaningful opportunity to object.",
        kind: "mandatory",
        proofGuidance:
          "Change-notice + objection window — typically 30 days' notice and a right to object before the new subprocessor processes data. Required when general (not specific-only) authorisation is used.",
        nonProofTraps: [
          "Notice of subprocessor changes with no objection right.",
          "A post-hoc notification after the subprocessor is already engaged.",
        ],
        remediationGuidance:
          "Add advance notice and a meaningful objection opportunity for subprocessor changes under general authorisation.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "object",
          "opportunity to object",
          "thirty days",
          "30 days",
          "notice of change",
          "new subprocessor",
        ],
      },
      {
        elementId: "D3",
        proposition:
          "Each subprocessor is engaged under a written agreement imposing data-protection obligations on the subprocessor (equivalent engagement), not merely announced or listed.",
        kind: "mandatory",
        proofGuidance:
          "Written subprocessor agreement / DPA requirement — the processor must impose contractual data-protection terms on subprocessors, not merely disclose their names.",
        nonProofTraps: [
          "A subprocessor list or registry with no written-agreement requirement.",
          "Processor liability for subprocessor acts without a written engagement obligation.",
        ],
        remediationGuidance:
          "Require each subprocessor to be engaged under a written data-processing agreement.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "written agreement",
          "data processing agreement",
          "sub-processor agreement",
          "subprocessor agreement",
          "written contract",
          "impose obligations",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.e.data_subject_rights",
    canonicalKey: "gdpr.article28.3e.data_subject_rights",
    legalCitation: "GDPR Article 28(3)(e)",
    title: "Processor assistance with data-subject rights requests",
    aggregationRule: "AND",
    aliases: [
      "art28_3_e_dsr_assistance",
      "gdpr.article28.3e.data_subject_rights",
      "article28.3e.data_subject_rights",
      "dsr_assistance",
    ],
    elements: [
      {
        elementId: "E1",
        proposition:
          "The processor is obligated to assist the controller in responding to data-subject rights requests (access, rectification, erasure, portability, objection, etc.) made to the controller.",
        kind: "mandatory",
        proofGuidance:
          "An assistance covenant tied to Chapter III / data-subject rights — 'assist the Controller in responding to data subject requests', not a bare rights list.",
        nonProofTraps: [
          "A generic 'data subject rights will be respected' statement with no processor assistance duty.",
          "A clause obligating the processor only to forward or redirect requests to the controller.",
        ],
        remediationGuidance:
          "Add a processor assistance covenant for controller-facing data-subject rights requests.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "assist",
          "data subject",
          "rights request",
          "chapter iii",
          "access request",
          "dsar",
        ],
      },
      {
        elementId: "E2",
        proposition:
          "The assistance commitment includes operational mechanics — appropriate technical and organisational measures, information, or technical support the controller needs to fulfil requests — not merely notice or redirection.",
        kind: "mandatory",
        proofGuidance:
          "Substantive operational assistance — providing data, tools, or support needed to respond. Mere forwarding/redirection is partial, not full proof.",
        nonProofTraps: [
          "Generic Chapter III assistance language without operational mechanics — e.g. 'assist with data subject rights' with no commitment to provide means, information, or technical support.",
          "A redirect-to-controller clause with no substantive assistance beyond notice.",
          "Listing Articles 15–22 without any operational assistance commitment.",
        ],
        remediationGuidance:
          "Add operational DSR assistance mechanics (technical measures, information provision, or support tools) beyond mere redirection.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "technical and organi",
          "technical support",
          "provide information",
          "provide the means",
          "fulfil",
          "fulfill",
          "respond to",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.h.audits_and_inspections",
    canonicalKey: "gdpr.article28.3h.audits_and_inspections",
    legalCitation: "GDPR Article 28(3)(h) and closing sentence",
    title: "Audit, inspection, and unlawful-instruction warning",
    aggregationRule: "AND",
    aliases: [
      "art28_3_h_audit",
      "gdpr.article28.3h.audits_and_inspections",
      "article28.3h.audits_and_inspections",
      "audit_rights",
    ],
    elements: [
      {
        elementId: "H1",
        proposition:
          "The processor must make available information necessary to demonstrate compliance AND allow for and contribute to audits and inspections by the controller or its mandated auditor.",
        kind: "mandatory",
        proofGuidance:
          "Both limbs required — compliance information AND an actual audit/inspection right. Third-party certifications on request alone is partial.",
        nonProofTraps: [
          "Third-party certifications/reports (SOC2, ISO 27001) on request with no independent audit/inspection right.",
          "An information-provision clause with no audit or inspection right.",
          "An audit right limited to reviewing a summary report that cannot demonstrate compliance.",
        ],
        remediationGuidance:
          "Add both compliance-information access and a controller (or auditor) audit/inspection right with processor contribution.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "audit",
          "inspection",
          "demonstrate compliance",
          "make available information",
          "contribute to",
          "mandated auditor",
        ],
      },
      {
        elementId: "H2",
        proposition:
          "The processor must immediately inform the controller if, in its opinion, an instruction infringes GDPR or other data-protection provisions.",
        kind: "mandatory",
        proofGuidance:
          "Article 28(3) closing sentence — immediate warning of unlawful instructions. Distinct from the documented-instructions clause in 28(3)(a).",
        nonProofTraps: [
          "A documented-instructions clause with no unlawful-instruction warning.",
          "A general compliance cooperation clause with no immediate-inform duty.",
        ],
        remediationGuidance:
          "Add the immediate unlawful-instruction notification duty.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "unlawful",
          "infringes",
          "immediately inform",
          "immediately notify",
          "instruction infringes",
          "contrary to",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_4.subprocessor_flow_down",
    canonicalKey: "gdpr.article28.4.subprocessor_flow_down",
    legalCitation: "GDPR Article 28(4)",
    title: "Same data-protection obligations imposed on subprocessors",
    aggregationRule: "AND",
    aliases: [
      "art28_4_subprocessor_flow_down",
      "gdpr.article28.4.subprocessor_flow_down",
      "article28.4.subprocessor_flow_down",
      "subprocessor_flow_down",
    ],
    elements: [
      {
        elementId: "F1",
        proposition:
          "The processor must impose on each subprocessor the same data-protection obligations imposed on the processor by the DPA — specifically by reference to the processor's Article 28(3) obligations.",
        kind: "mandatory",
        proofGuidance:
          "Same-obligations covenant — 'impose the same data protection obligations', 'equivalent to those in this DPA', or reference to Article 28(3) obligations flowing down.",
        nonProofTraps: [
          "A general statement that subprocessors must comply with data protection law.",
          "Processor liability for subprocessor acts without a same-obligations flow-down covenant.",
        ],
        remediationGuidance:
          "Require subprocessors to be bound by the same Article 28(3) obligations as the processor.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "same obligations",
          "same data protection",
          "equivalent obligations",
          "article 28(3)",
          "flow-down",
          "flow down",
        ],
      },
      {
        elementId: "F2",
        proposition:
          "Flow-down is evidenced as an actual contractual imposition on subprocessors (by contract, DPA, or equivalent written instrument), not merely asserted via processor liability.",
        kind: "mandatory",
        proofGuidance:
          "Evidence that obligations are contractually imposed on subprocessors — written agreement, DPA, or explicit 'by contract' language. Liability alone does not prove flow-down.",
        nonProofTraps: [
          "Processor remains liable for subprocessor conduct with no contractual flow-down language.",
          "A subprocessor list with no 'by written agreement' or 'by contract' imposition.",
        ],
        remediationGuidance:
          "Evidence contractual flow-down — require subprocessors to enter written agreements imposing the same obligations.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "by contract",
          "written agreement",
          "data processing agreement",
          "impose on",
          "bind",
          "subprocessor agreement",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
