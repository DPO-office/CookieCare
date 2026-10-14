import type { SkillRegimeRuleInvestigation } from "../../../runtime/catalog/types.js";

/**
 * Atomic investigation profiles for GDPR regimeRules, keyed by ruleId. Moved
 * (not duplicated) from the hand-authored `requirementEvidence` blocks that
 * used to live only on `evidencePackages` in `skill.config.ts` — each
 * package's `requirementEvidence` is now derived FROM this map via
 * `deriveRequirementEvidence` (see `rule-contract-helpers.ts`), so there is
 * one authored source per rule instead of two.
 *
 * Coverage: every atomic GDPR rule, including the Article 28 provisions that
 * previously rode along as package context without an independent profile.
 */
export const GDPR_RULE_INVESTIGATION: Record<string, SkillRegimeRuleInvestigation> = {
  "gdpr.art28.1": {
    hypothesis:
      "The controller uses only processors that provide sufficient guarantees to implement appropriate technical and organisational measures so processing meets GDPR and protects data-subject rights.",
    evidenceHints: [
      "sufficient guarantees",
      "expert knowledge reliability and resources",
      "appropriate technical and organisational measures",
      "protect the rights of the data subject",
      "processor due diligence",
    ],
    proofStandard:
      "Proven by operative selection, warranty, due-diligence, or assurance text showing that the processor provides sufficient guarantees for GDPR-compliant technical and organisational measures and protection of data-subject rights. A generic statement that the processor is reputable, or a security clause with no processor guarantee or controller-selection commitment, is related context but not complete proof.",
    proofElements: [
  {
    "id": "sufficient_guarantees",
    "description": "Processor provides sufficient guarantees of GDPR-compliant measures and rights protection.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "controller_selection",
    "description": "Controller commits to use only processors meeting that guarantee threshold.",
    "required": true,
    "kind": "mandatory"
  }
],
    evidenceScope: { relationshipScopes: ["controller_to_processor"] },
  },
  "gdpr.art28.2": {
    hypothesis:
      "The processor does not engage another processor without the controller's prior specific or general written authorisation and, for general authorisation, gives advance notice of intended additions or replacements so the controller can object.",
    evidenceHints: [
      "prior specific or general written authorisation",
      "prior written authorization",
      "intended changes concerning the addition or replacement",
      "opportunity to object",
      "new subprocessor",
    ],
    proofStandard:
      "Proven only by operative subprocessor appointment language requiring the controller's prior specific or general written authorisation. Where general authorisation is used, the text must also require notice of intended additions or replacements and preserve an opportunity to object. A mere subprocessor list or notice mechanism without authorisation is partial, not complete proof.",
    proofElements: [
  {
    "id": "written_authorisation",
    "description": "Prior specific or general written controller authorisation is required.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Prior written authorisation clause — either specific approval per subprocessor or general written authorisation.",
    "nonProofTraps": [
      "Notice of subprocessor engagement without an authorisation requirement.",
      "A published subprocessor list with no authorisation or objection right."
    ],
    "remediationGuidance": "Require prior written general or specific controller authorisation before engaging subprocessors."
  },
  {
    "id": "change_notice",
    "description": "General authorisation includes advance notice of additions or replacements.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies when general (rather than specific) written subprocessor authorisation is used.",
    "proofGuidance": "Advance written notice of intended subprocessor changes under general authorisation.",
    "nonProofTraps": [
      "Post-hoc notification after a subprocessor is engaged."
    ],
    "remediationGuidance": "Add advance written notice for subprocessor additions or replacements under general authorisation."
  },
  {
    "id": "objection_opportunity",
    "description": "The controller has a meaningful opportunity to object.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies when general (rather than specific) written subprocessor authorisation is used.",
    "proofGuidance": "A meaningful window and right for the controller to object to subprocessor changes under general authorisation.",
    "nonProofTraps": [
      "Notice with no right or opportunity to object."
    ],
    "remediationGuidance": "Provide an explicit opportunity to object to subprocessor additions or replacements."
  }
],
    evidenceScope: { relationshipScopes: ["controller_to_processor"] },
  },
  "gdpr.art28.9": {
    hypothesis:
      "The Article 28(3) and 28(4) processing terms are recorded in writing, including electronic form.",
    evidenceHints: [
      "in writing including in electronic form",
      "written agreement",
      "data processing addendum",
      "forms part of the agreement",
      "electronic form",
    ],
    proofStandard:
      "Proven by the executed or incorporated written processing agreement itself, including an electronic agreement, or by operative text expressly incorporating the Article 28 processor terms into a written instrument. A verbal arrangement, an unconfirmed external policy, or a bare promise to agree terms later does not satisfy the writing requirement.",
    proofElements: [
  {
    "id": "written_form",
    "description": "The processor terms are contained or incorporated in a written or electronic instrument.",
    "required": true,
    "kind": "mandatory"
  }
],
    evidenceScope: { relationshipScopes: ["controller_to_processor"] },
  },
  "gdpr.art28.10": {
    hypothesis:
      "A processor that determines the purposes and means of processing contrary to the controller's lawful allocation is treated as a controller for that processing rather than using the processor label to avoid controller duties.",
    evidenceHints: [
      "determines the purposes and means",
      "shall be considered to be a controller",
      "independent controller",
      "acts outside documented instructions",
      "own purposes",
    ],
    proofStandard:
      "Proven by role-allocation or consequence language making clear that a processor acting outside the processor role by determining purposes and means bears controller responsibility for that processing. A generic statement that each party complies with law, without addressing re-characterisation or independent-purpose processing, is not complete proof. If the agreement gives the processor no discretion to determine purposes or means, the rule may be satisfied by the strict instructions boundary together with accurate role allocation.",
    proofElements: [
  {
    "id": "role_boundary",
    "description": "Processor status is limited to processing on the controller's behalf and instructions.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "controller_consequence",
    "description": "Determining purposes and means triggers controller responsibility for that processing.",
    "required": true,
    "kind": "mandatory"
  }
],
    evidenceScope: { relationshipScopes: ["controller_to_processor"] },
  },

  // --- gdpr.art28.particulars (aggregated onto the chapeau rule) ---
  "gdpr.art28.3.chapeau": {
    hypothesis:
      "Processing must be governed by a binding contract or legal act in writing that states subject matter, duration, nature, purpose, personal-data types, data-subject categories, and the controller's obligations and rights.",
    evidenceHints: [
      "subject matter",
      "duration",
      "term",
      "nature",
      "purpose",
      "categories of personal data",
      "categories of data subjects",
      "obligations",
      "rights",
      "instructions",
      "statement of work",
      "schedule",
      "annex",
    ],
    proofStandard:
      "Each particular below must be independently proven by contract text; a general recital about the parties' business relationship, or a bare pointer to an unconfirmed external document, does not satisfy any particular it has not itself been shown to state.",
    proofElements: [
  {
    "id": "subject_matter",
    "description": "The contract sets out the subject matter of the processing. Proven only by text stating what personal-data processing activity or service this agreement covers. A named cross-reference to another document counts only if that document itself is confirmed to state the subject matter.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "duration",
    "description": "The contract sets out the duration of the processing. Proven only by text stating how long the processing continues; termination rights or deletion timelines alone do not establish duration unless they also state or reference the processing term itself.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "nature_purpose",
    "description": "The contract sets out the nature AND purpose of the processing — both what activities are performed on the data and why. Either half alone is partial, not present.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "data_categories",
    "description": "The contract sets out the types of personal data processed. A general definition of what could qualify as personal or sensitive data does not prove which categories are actually processed under the services.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "data_subject_categories",
    "description": "The contract sets out the categories of data subjects (who the data is about), distinct from what data is processed about them.",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "controller_obligations_rights",
    "description": "The contract sets out the controller's (not the processor's) obligations and rights — e.g. the duty to give lawful instructions or the right to audit the processor.",
    "required": true,
    "kind": "mandatory"
  }
],
    evidenceScope: { relationshipScopes: ["controller_to_processor"] },
  },

  // --- gdpr.art28.3.mandatory_clauses (1:1) ---
  "gdpr.art28.3.a": {
    hypothesis:
      "The processor processes personal data only on documented instructions from the controller.",
    evidenceHints: ["documented instructions", "instructions"],
    proofStandard:
      "Proven only by text that requires the processor to act ONLY on the controller's documented/written instructions — not merely to comply with data protection law generally, and not merely a description of the processing already agreed in the contract. A general statement that the processor 'will process personal data in accordance with Data Protection Laws' is a compliance obligation, not an instructions-only constraint, and does not by itself satisfy this. The clause must specifically tie processing to controller instructions (a carve-out for legally required processing, paired with a duty to notify the controller first, is consistent with this particular and does not defeat it). The separate duty to immediately warn the controller that an instruction is unlawful is Article 28(3)'s closing sentence, already scoped to gdpr.art28.3.h — do not treat its absence as a defect of this particular.",
    proofElements: [
  {
    "id": "A1",
    "description": "The processor processes personal data only on documented instructions from the controller.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "A clause using 'only on documented instructions' / 'in accordance with the Controller's written instructions'. May sit in an operational-obligations section, a jurisdiction addendum, or the international-transfers section.",
    "nonProofTraps": [
      "'As reasonably necessary to provide the Services' without an instruction-anchor.",
      "A general confidentiality clause."
    ],
    "remediationGuidance": "Add the documented-instructions clause with the standard 28(3)(a) formulation."
  },
  {
    "id": "A2",
    "description": "Instructions to make an international transfer are also processed only on documented instructions, unless required by law (with a notification obligation).",
    "kind": "conditional",
    "required": true,
    "applicabilityGuidance": "Applies when the arrangement contemplates cross-border transfers of personal data. Absence of trigger words is not evidence of non-applicability.",
    "proofGuidance": "The Article 28(3)(a) proviso: unless required by Union or Member State law, in which case the processor notifies the controller before processing (unless the law prohibits notification for important public-interest reasons).",
    "nonProofTraps": [
      "A separate international-transfer clause that names the mechanism (SCCs) but not the instruction-based control."
    ],
    "remediationGuidance": "Add the proviso allowing law-mandated processing with a controller-notification obligation."
  }
],
  },
  "gdpr.art28.3.b": {
    hypothesis: "Persons authorised to process personal data are committed to confidentiality.",
    evidenceHints: ["confidential", "secrecy", "authorised persons", "authorized persons"],
    proofStandard:
      "Proven by text imposing a confidentiality duty specifically on the persons authorised to process personal data (employees, staff, representatives) — via written contractual confidentiality obligations or a statutory duty of confidentiality.",
    proofElements: [
  {
    "id": "primary",
    "description": "Persons authorised to process personal data are committed to confidentiality or are under an appropriate statutory obligation of confidentiality.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "An express obligation that personnel/authorised persons handling personal data are bound by confidentiality commitments.",
    "nonProofTraps": [
      "A general corporate confidentiality clause covering business secrets with no mention of persons processing personal data.",
      "A technical IT security clause with no personnel confidentiality covenant."
    ],
    "remediationGuidance": "Add an express commitment that all personnel authorised to process personal data are bound by contractual or statutory confidentiality duties."
  }
],
  },
  "gdpr.art28.3.c": {
    hypothesis: "The processor implements appropriate technical and organisational security measures.",
    evidenceHints: ["security", "technical and organisational", "tom"],
    proofStandard:
      "Proven only by text obligating the processor to implement technical and organisational measures appropriate to the risk (e.g. referencing encryption, access controls, resilience, testing, or an incorporated security exhibit/schedule). A bare cross-reference to 'the Information Security Exhibit' or similar counts only if that referenced document is confirmed to actually contain security measures — an unconfirmed pointer is a dependency on an unsupplied document, not proof.",
    proofElements: [
  {
    "id": "C1",
    "description": "The processor is obligated to implement appropriate technical and organisational measures to protect personal data (a TOMs/security covenant, not a bare compliance aspiration).",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "An operative obligation on the processor to implement technical and organisational measures appropriate to the risk — may reference Article 32 or 'appropriate security measures'.",
    "nonProofTraps": [
      "A generic 'comply with Data Protection Laws' statement with no security-measures obligation.",
      "A confidentiality clause with no technical/organisational security commitment."
    ],
    "remediationGuidance": "Add an Article 28(3)(c) / Article 32 security-measures obligation on the processor."
  },
  {
    "id": "C2",
    "description": "The security commitment is substantiated — by named measures (encryption, access controls, resilience, testing) or by an incorporated security exhibit/schedule whose content is confirmed in the reviewed materials.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Substantive security content — enumerated controls, risk-appropriate measures, or a confirmed security exhibit/schedule. A bare pointer to 'the Information Security Exhibit' counts only if that exhibit is supplied and contains measures.",
    "nonProofTraps": [
      "A bare cross-reference to an Information Security Exhibit or security schedule that is not supplied or confirmed to contain measures.",
      "A one-line 'industry-standard security' promise with no measures, exhibit, or schedule."
    ],
    "remediationGuidance": "Substantiate the security obligation with named measures or attach/incorporate a security exhibit with actual controls."
  }
],
  },
  "gdpr.art28.3.d": {
    hypothesis: "The processor does not engage another processor without controller authorisation.",
    evidenceHints: [
      "sub-processor", "subprocessor", "authorisation", "authorization", "notice", "object", "written agreement", "thirty days", "30 days",
    ],
    proofStandard:
      "Proven only by text requiring the processor to obtain the controller's prior GENERAL or SPECIFIC written authorization before engaging a subprocessor, AND (for general authorization) giving the controller an opportunity to object to changes. A clause that merely says the processor 'will notify' or 'may engage subprocessors' without any authorization/objection mechanism does not satisfy this — notice alone is not authorization.",
    proofElements: [
  {
    "id": "D1",
    "description": "The processor must obtain the controller's prior general or specific written authorisation before engaging a subprocessor.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Prior written authorisation — specific (per subprocessor) or general (list + changes). 'May engage subprocessors' or notice-only language is not enough.",
    "nonProofTraps": [
      "A clause that merely says the processor 'will notify' or 'may engage subprocessors' without prior authorisation.",
      "A published subprocessor list with no authorisation mechanism."
    ],
    "remediationGuidance": "Require prior general or specific written authorisation before engaging any subprocessor."
  },
  {
    "id": "D2",
    "description": "Where general authorisation applies, the controller receives advance notice of subprocessor changes and a meaningful opportunity to object.",
    "kind": "conditional",
    "required": true,
    "applicabilityGuidance": "Applies when general (rather than specific) written subprocessor authorisation is used. Where specific authorisation is used for every subprocessor, this element is not applicable.",
    "proofGuidance": "Change-notice + objection window — typically 30 days' notice and a right to object before the new subprocessor processes data. Required when general authorisation is used.",
    "nonProofTraps": [
      "Notice of subprocessor changes with no objection right.",
      "A post-hoc notification after the subprocessor is already engaged."
    ],
    "remediationGuidance": "Add advance notice and a meaningful objection opportunity for subprocessor changes under general authorisation."
  },
  {
    "id": "D3",
    "description": "Each subprocessor is engaged under a written agreement imposing data-protection obligations on the subprocessor (equivalent engagement), not merely announced or listed.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Written subprocessor agreement / DPA requirement — the processor must impose contractual data-protection terms on subprocessors, not merely disclose their names.",
    "nonProofTraps": [
      "A subprocessor list or registry with no written-agreement requirement.",
      "Processor liability for subprocessor acts without a written engagement obligation."
    ],
    "remediationGuidance": "Require each subprocessor to be engaged under a written data-processing agreement."
  }
],
  },
  "gdpr.art28.3.e": {
    hypothesis: "The processor assists the controller in responding to data-subject rights requests.",
    evidenceHints: ["data subject", "assist", "rights request", "supervisory"],
    proofStandard:
      "Proven by text obligating the processor to assist the controller (by appropriate technical and organisational measures) in responding to data subject rights requests under Chapter III.",
    proofElements: [
  {
    "id": "processor_assistance",
    "description": "The processor provides substantive assistance to the controller in responding to data-subject rights requests.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "An operative obligation on the processor to assist the controller with data-subject rights requests under Chapter III.",
    "nonProofTraps": [
      "A clause that merely requires forwarding or redirecting data-subject requests to the controller without assisting in fulfilling them."
    ],
    "remediationGuidance": "Add a substantive obligation on the processor to assist the controller in responding to data-subject rights requests."
  },
  {
    "id": "technical_organizational_measures",
    "description": "Assistance is delivered through appropriate technical or organisational measures.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Indication that assistance is provided via technical or organisational capabilities/measures.",
    "nonProofTraps": [
      "A bare statement to cooperate with no operational commitment."
    ],
    "remediationGuidance": "Specify that rights assistance is provided taking into account the nature of processing through appropriate technical and organisational measures."
  }
],
  },
  "gdpr.art28.3.f": {
    hypothesis:
      "The processor assists the controller with security, personal-data-breach, and DPIA obligations.",
    evidenceHints: ["assist", "breach", "dpia", "security of processing", "prior consultation", "supervisory"],
    proofStandard:
      "Proven only by text obligating the processor to assist the controller with the CONTROLLER's own Article 32-36 obligations — security of processing, breach notification to the supervisory authority/data subjects, data protection impact assessments, or prior consultation with a supervisory authority. A clause stating only that the processor will notify the controller of a breach affecting the processor's own systems is the processor's OWN breach-notification duty (a different, narrower obligation) — this particular requires the processor to help the controller satisfy the controller's own downstream obligations, not just report upward.",
    proofElements: [
  {
    "id": "security_assistance",
    "description": "Assistance with controller security obligations under Article 32",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "breach_assistance",
    "description": "Assistance with breach notification and communication under Articles 33-34",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "risk_assessment_assistance",
    "description": "Assistance with DPIAs and prior consultation under Articles 35-36",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art28.3.g": {
    hypothesis:
      "At the end of the services the controller may choose whether the processor deletes or returns personal data and existing copies.",
    evidenceHints: ["delete or return", "end of services", "existing copies", "delete", "deletion", "return", "erasure", "copies"],
    proofStandard:
      "Proven only by text that, at the end of the provision of services (not merely 'on request' at an unspecified time), gives the CONTROLLER an actual choice between deletion and return of all personal data, and requires deletion of existing copies, unless EU/Member State law requires continued storage. It is not enough that the processor performs one of those outcomes unilaterally. A clause obligating deletion only, with no return option the controller can elect, does not fully satisfy this — flag partialCoverage. A clause giving the controller only a vague 'right to request deletion' without the processor being independently obligated to delete or return at end-of-service does not satisfy this.",
    proofElements: [
  {
    "id": "G1",
    "description": "The controller has a right to choose between deletion and return.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "A clause explicitly giving the controller the choice (e.g. 'at the Controller's option, delete or return').",
    "nonProofTraps": [
      "A deletion-only clause with no return branch.",
      "A return-only clause with no deletion branch."
    ],
    "remediationGuidance": "Reword the post-termination clause to grant the controller a choice."
  },
  {
    "id": "G2",
    "description": "The processor is obligated to delete on request.",
    "kind": "alternative",
    "required": false,
    "proofGuidance": "A deletion obligation triggered at the end of services or on request.",
    "nonProofTraps": [
      "A permission to delete rather than an obligation.",
      "A discretion to retain 'for legitimate business purposes' with no boundary."
    ],
    "remediationGuidance": "Convert the retention discretion into a deletion obligation."
  },
  {
    "id": "G3",
    "description": "The processor is obligated to return on request.",
    "kind": "alternative",
    "required": false,
    "proofGuidance": "A return / export obligation triggered at the end of services or on request.",
    "nonProofTraps": [
      "A migration-services offer priced separately, without an obligation."
    ],
    "remediationGuidance": "Add a return obligation (format specified where reasonable)."
  },
  {
    "id": "G4",
    "description": "The processor deletes existing copies unless Union or Member State law requires storage.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "The 28(3)(g) closing proviso — retention only where required by law, with the residual data still subject to processor obligations.",
    "nonProofTraps": [
      "Retention for 'business continuity' or 'audit' without a legal basis."
    ],
    "remediationGuidance": "Add the closing proviso limiting retention to legally required cases."
  }
],
  },
  "gdpr.art28.3.h": {
    hypothesis:
      "The processor makes available information necessary to demonstrate compliance and allows audits and inspections.",
    evidenceHints: ["audit", "inspection", "demonstrate compliance"],
    proofStandard:
      "Proven only by text obligating the processor to make available information necessary to demonstrate compliance AND to allow for and contribute to audits, including inspections, conducted by the controller or an auditor mandated by the controller. Providing only third-party certifications/reports (e.g. SOC2, ISO 27001) on request, with no independent right for the controller (or its auditor) to conduct or contribute to an actual audit/inspection, is a weaker, narrower obligation — treat it as partial/gap, not full satisfaction, since this particular requires both the information AND the audit/inspection right.",
    proofElements: [
  {
    "id": "H1",
    "description": "The processor must make available information necessary to demonstrate compliance AND allow for and contribute to audits and inspections by the controller or its mandated auditor.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Both limbs required — compliance information AND an actual audit/inspection right. Third-party certifications on request alone is partial.",
    "nonProofTraps": [
      "Third-party certifications/reports (SOC2, ISO 27001) on request with no independent audit/inspection right.",
      "An information-provision clause with no audit or inspection right.",
      "An audit right limited to reviewing a summary report that cannot demonstrate compliance."
    ],
    "remediationGuidance": "Add both compliance-information access and a controller (or auditor) audit/inspection right with processor contribution."
  },
  {
    "id": "H2",
    "description": "The processor must immediately inform the controller if, in its opinion, an instruction infringes GDPR or other data-protection provisions.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Article 28(3) closing sentence — immediate warning of unlawful instructions. Distinct from the documented-instructions clause in 28(3)(a).",
    "nonProofTraps": [
      "A documented-instructions clause with no unlawful-instruction warning.",
      "A general compliance cooperation clause with no immediate-inform duty."
    ],
    "remediationGuidance": "Add the immediate unlawful-instruction notification duty."
  }
],
  },
  "gdpr.art28.4": {
    hypothesis: "A subprocessor is bound by the same data-protection obligations as the processor.",
    evidenceHints: ["flow-down", "same obligations", "subprocessor"],
    proofStandard:
      "Proven by text requiring the same data protection obligations imposed on the processor in the DPA to be imposed on any subprocessor by written contract.",
    proofElements: [
  {
    "id": "F1",
    "description": "The processor must by written contract impose on each subprocessor the same data-protection obligations as those imposed on the processor in the DPA.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Contractual flow-down requirement imposing equivalent Article 28(3) data protection obligations on subprocessors.",
    "nonProofTraps": [
      "Processor liability for subprocessor acts without a contractual same-obligations flow-down covenant.",
      "A general requirement that subprocessors comply with data protection laws generally without tying to the DPA terms."
    ],
    "remediationGuidance": "Require subprocessors to be bound by a written contract imposing the same data protection obligations as the DPA."
  }
],
  },

  // --- gdpr.dsr.rights_verification (1:1) ---
  "gdpr.art12.3": {
    hypothesis:
      "The contract commits to responding to data-subject requests without undue delay and within one month of receipt, with any complexity/volume extension capped at two further months and conditioned on notice to the data subject within the first month stating the reasons for delay.",
    evidenceHints: ["one month", "30 days", "within one month", "extend by two", "further two months", "response timeframe", "data subject request"],
    proofStandard:
      "Proven by text that states a specific numeric response deadline for data-subject requests functionally equivalent to 'without undue delay and in any event within one month of receipt.'",
    proofElements: [
  {
    "id": "one_month_deadline",
    "description": "Requests are answered without undue delay and within one month of receipt.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "A specific numeric response deadline of one month / 30 days for responding to data subject requests.",
    "nonProofTraps": [
      "Vague timing phrases like 'promptly', 'as soon as practicable', or 'without undue delay' without a numeric 1-month / 30-day backstop."
    ],
    "remediationGuidance": "Specify a hard response deadline of within one month / 30 days of request receipt."
  },
  {
    "id": "extension_limit",
    "description": "Any complexity or volume extension is capped at two further months.",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies only where the contract claims a right to extend the 1-month response deadline.",
    "proofGuidance": "An extension cap limiting deadline extensions to a maximum of two further months.",
    "nonProofTraps": [
      "Unbounded or open-ended extension rights."
    ],
    "remediationGuidance": "Cap any response extension at two further months."
  },
  {
    "id": "extension_notice",
    "description": "The individual is notified within the first month with reasons for delay.",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies only where the contract claims a right to extend the 1-month response deadline.",
    "proofGuidance": "A requirement to notify the individual within the initial one-month period stating reasons for the delay.",
    "nonProofTraps": [
      "An extension right exercised without giving reasons or notice within the first month."
    ],
    "remediationGuidance": "Require notice to the data subject within the first month stating reasons for any extension."
  }
],
  },
  "gdpr.art15": {
    hypothesis:
      "A data subject may obtain confirmation that their personal data is being processed and a copy of that data, together with the Article 15(1) particulars (purposes, categories of data, recipients, retention period or criteria, other applicable rights, complaint route, source of the data, and — where applicable — meaningful information about automated decision-making logic, significance, and consequences), and further copies may be charged only a reasonable administrative fee.",
    evidenceHints: ["right of access", "confirmation of processing", "copy of your personal data", "purposes of processing", "categories of recipients", "retention period", "reasonable fee"],
    proofStandard:
      "Proven only by text that (a) confirms a data subject can obtain confirmation that their data is being processed and a copy of it, AND (b) commits to supplying substantially the Article 15(1) particulars — purposes, categories of data, recipients or categories of recipients, retention period or criteria, existence of the rectification/erasure/restriction/objection rights, the right to complain to a supervisory authority, the source of the data where not collected from the subject, and (where applicable) meaningful information about any solely automated decision-making, its significance, and its consequences. A bare 'data subject rights will be honored' statement naming none of these particulars is insufficient — Article 15 is a specific disclosure obligation, not a generic access promise. A right to charge for EVERY copy, with no free-first-copy / manifestly-unfounded-or-excessive framing, is a partial gap on the fee element, not a full defeat of the access right itself.",
    proofElements: [
  {
    "id": "confirmation_and_copy",
    "description": "The individual can obtain processing confirmation and a copy of personal data",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "processing_particulars",
    "description": "Purposes, data categories, recipients, and retention period or criteria are supplied",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "rights_source_and_complaint",
    "description": "Applicable rights, complaint route, and source of indirectly collected data are supplied",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "automated_decision_information",
    "description": "Meaningful automated-decision information is supplied where applicable",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where automated decisions requiring this information occur. Missing description leaves applicability unknown."
  },
  {
    "id": "copy_fee_limits",
    "description": "The first copy is free and further-copy charges are limited to a reasonable administrative fee",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art16": {
    hypothesis:
      "The contract commits to correcting inaccurate personal data without undue delay and to allowing a data subject to complete incomplete personal data, including by means of a supplementary statement.",
    evidenceHints: ["rectification", "correct inaccurate", "complete incomplete data", "supplementary statement", "without undue delay"],
    proofStandard:
      "Proven only by text that (a) obligates rectification of inaccurate personal data without undue delay upon request, AND (b) separately addresses completion of incomplete data (e.g. by permitting a supplementary statement or additional data). A clause allowing a data subject merely to 'submit a correction request,' with no corresponding obligation on the controller/processor to act on it, does not satisfy this. Coverage of correction of inaccurate data alone, with no mention of completing incomplete data, is partial, not full proof.",
    proofElements: [
  {
    "id": "correct_inaccurate_data",
    "description": "Inaccurate personal data is corrected",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "complete_incomplete_data",
    "description": "Incomplete personal data can be completed, including by supplementary statement",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "without_undue_delay",
    "description": "Rectification is completed without undue delay",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art17": {
    hypothesis:
      "The contract commits to erasing personal data without undue delay when an Article 17(1) ground applies (data no longer necessary, withdrawn consent with no other lawful basis, successful objection, unlawful processing, a legal erasure obligation, or child-service data collection), subject only to the Article 17(3) exceptions, and takes reasonable steps to inform other controllers where the data was made public.",
    evidenceHints: ["erasure", "right to be forgotten", "delete personal data", "withdrawal of consent", "object to processing", "upon request", "legal obligation to retain"],
    proofStandard:
      "Proven only by text committing to erase personal data on a data-subject erasure request or when a recognized Article 17(1) ground applies — NOT merely a deletion duty triggered solely 'upon termination of the Agreement.' A termination-triggered deletion clause proves only the termination-linked subset of Article 17; the mid-term right arises independent of contract end (e.g. on withdrawn consent or successful objection), so a clause that erases only 'at the end of the Term,' with no mid-term erasure-request mechanism, is PARTIAL coverage, not full proof — do not treat termination-only deletion as satisfying this element. Legal-retention, legal-claims, or public-interest-archiving exceptions are consistent with this requirement and do not defeat it when narrowly stated.",
    proofElements: [
  {
    "id": "erasure_right",
    "description": "Personal data is erased in response to a valid data-subject request or Article 17 ground",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "recognized_grounds",
    "description": "Erasure covers no-longer-necessary, consent withdrawal, successful objection, unlawful processing, and legal-duty grounds",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "without_undue_delay",
    "description": "Erasure occurs without undue delay",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "public_data_propagation",
    "description": "Reasonable steps notify other controllers where erased data was made public",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where the controller has made the relevant personal data public. Silence is not evidence that it has not."
  },
  {
    "id": "bounded_exceptions",
    "description": "Any retention exception is limited to Article 17(3)-consistent grounds",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art18": {
    hypothesis:
      "The contract provides a distinct 'restriction' remedy — data is marked/stored but not otherwise actively processed — when accuracy is contested, processing is unlawful but erasure is opposed, the controller no longer needs the data but the data subject needs it for legal claims, or an objection is pending verification, and notifies the data subject before lifting any restriction.",
    evidenceHints: ["restriction of processing", "restrict processing", "mark the data", "contested accuracy", "pending verification"],
    proofStandard:
      "Proven only by text that provides a RESTRICTION remedy distinct from both erasure and continued normal processing — data is marked/stored but excluded from further processing except with consent, for legal claims, to protect another's rights, or for important public interest — tied to at least one Article 18(1) ground (contested accuracy, unlawful processing with erasure opposed, controller no longer needs it but data subject does for legal claims, or a pending objection). A contract offering only 'delete or keep processing,' with no separate restriction option, does not satisfy this. Silence on restriction entirely is not proof.",
    proofElements: [
  {
    "id": "distinct_restriction_remedy",
    "description": "Restriction is available as a remedy distinct from erasure",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "restriction_grounds",
    "description": "Restriction applies for contested accuracy, unlawful processing, legal claims, or pending objection",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "restricted_processing_limits",
    "description": "Restricted data is stored but otherwise processed only on a permitted basis",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "lifting_notice",
    "description": "The individual is notified before a restriction is lifted",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art19": {
    hypothesis:
      "The controller communicates any rectification, erasure, or restriction of personal data to every recipient to whom the data has been disclosed, unless this proves impossible or involves disproportionate effort, and informs the data subject of those recipients on request.",
    evidenceHints: ["notify recipients", "communicate rectification", "communicate erasure", "communicate restriction", "recipients to whom", "disproportionate effort"],
    proofStandard:
      "Proven only by text obligating notice to downstream recipients (including subprocessors/third parties who received the data) specifically WHEN data is rectified, erased, or restricted — a general subprocessor flow-down of confidentiality or security obligations does NOT satisfy this, because that is a different obligation (Article 28(4)) not tied to rights-exercise notice. An 'impossible or disproportionate effort' carve-out is consistent with the requirement and does not defeat it.",
    proofElements: [
  {
    "id": "recipient_notification",
    "description": "Recipients are notified after rectification, erasure, or restriction",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "exception_limit",
    "description": "The exception is limited to impossibility or disproportionate effort",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "recipient_identity_on_request",
    "description": "The individual is told who the recipients are on request",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art20": {
    hypothesis:
      "Where processing is carried out by automated means on the basis of consent or contract, the data subject can receive the personal data they provided in a structured, commonly used, machine-readable format and have it transmitted to another controller, including direct transmission where technically feasible.",
    evidenceHints: ["data portability", "structured format", "machine-readable", "commonly used format", "transmit to another controller", "export your data"],
    proofStandard:
      "Proven only by text that (a) names or commits to a structured, commonly used, machine-readable export format for data the subject supplied, AND (b) supports transmission to another controller, including direct transmission where technically feasible. A generic 'we will provide your data upon request' statement with no format commitment does not satisfy Article 20's specific technical requirement — format and transmissibility are the operative elements, not mere data provision. If no format or transmission mechanism is named at all, this is a gap, not partial proof.",
    proofElements: [
  {
    "id": "portability_scope",
    "description": "Portability applies to data supplied by the individual and processed by automated means on consent or contract",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "structured_machine_readable_format",
    "description": "Data is supplied in a structured, commonly used, machine-readable format",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "controller_transmission",
    "description": "The individual can transmit data to another controller",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "direct_transmission",
    "description": "Direct controller-to-controller transmission is supported where technically feasible",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art21": {
    hypothesis:
      "The data subject can object to processing carried out on the legitimate-interest or public-task basis, causing the controller to stop unless it demonstrates compelling legitimate grounds or the need to establish, exercise, or defend legal claims; the data subject can additionally object to direct-marketing processing (including related profiling) at any time with no override, and this right is presented clearly and separately from other information no later than the first communication.",
    evidenceHints: ["right to object", "legitimate interests", "direct marketing", "opt out of marketing", "compelling legitimate grounds", "profiling"],
    proofStandard:
      "Proven only by text that provides BOTH halves: (a) an objection right distinct from erasure/restriction, tied to legitimate-interest or public-task processing, where the controller's continued-processing exception is limited to compelling grounds or legal-claims defense; AND (b) a SEPARATE, unconditional direct-marketing objection right (no override permitted for marketing, unlike the general Article 21(1) right). A contract addressing only a general 'opt out of marketing' mechanism, with no broader legitimate-interest objection right, is PARTIAL — both halves are required for full proof. A generic 'data subject rights' list that names 'objection' among several rights with no operative detail on its effect on processing does not satisfy this.",
    proofElements: [
  {
    "id": "general_objection_right",
    "description": "The individual can object to legitimate-interest or public-task processing",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "compelling_grounds_limit",
    "description": "Continued processing is limited to compelling grounds or legal claims",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "marketing_objection",
    "description": "Direct-marketing processing and related profiling stop unconditionally on objection",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "clear_separate_notice",
    "description": "The objection right is presented clearly and separately by the first communication",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art22": {
    hypothesis:
      "The controller does not subject a data subject to a decision based solely on automated processing (including profiling) that produces legal effects or similarly significantly affects them, unless an Article 22(2) exception applies (contract necessity, law with safeguards, or explicit consent), in which case it provides at least a right to human intervention, to express a view, and to contest the decision, and processes any special-category data underlying the decision only with explicit consent or substantial-public-interest law and suitable safeguards.",
    evidenceHints: ["automated decision-making", "solely automated", "profiling", "human intervention", "contest the decision", "legal effects", "explicit consent"],
    proofStandard:
      "Determine applicability from grounded actor and activity facts. Silence leaves applicability unknown; it cannot justify N/A. Where solely automated decisions with legal or similarly significant effects are described, establish the applicable Article 22(2) exception and human-intervention, expression-of-view, and contest safeguards. Generic legal-compliance wording does not establish these safeguards.",
    proofElements: [
  {
    "id": "solely_automated_significant_decision",
    "description": "The rule addresses solely automated decisions producing legal or similarly significant effects",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "lawful_exception",
    "description": "Any such decision is limited to contract necessity, authorising law, or explicit consent",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "human_review_safeguards",
    "description": "The individual can obtain human intervention, express a view, and contest the decision",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "special_category_limit",
    "description": "Special-category data use is limited to explicit consent or substantial-public-interest law with safeguards",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where special-category data is used in the decision. Without grounded facts, applicability remains unknown."
  }
],
  },

  // --- gdpr.security.breach_and_accountability (1:1) ---
  "gdpr.art32": {
    hypothesis:
      "The controller and processor implement technical and organisational measures ensuring a level of security appropriate to the risk — including ongoing confidentiality, integrity, availability, and resilience of processing systems and services, with measures such as pseudonymisation/encryption, timely restoration, regular testing, and controls ensuring authorised persons process only on instructions.",
    evidenceHints: ["technical and organisational measures", "confidentiality", "integrity", "availability", "resilience", "encryption", "pseudonymisation", "risk-based security"],
    proofStandard:
      "Proven only by text obligating risk-appropriate technical and organisational security measures that address BOTH (a) ongoing confidentiality, integrity, availability, and resilience of processing systems/services and (b) measures appropriate to the risk (state of the art, cost, nature/scope/context/purposes, and likely impact). A generic 'industry-standard security' or 'reasonable security' recital naming none of these elements is insufficient — Article 32 requires operative TOMs, not a bare compliance aspiration. A bare cross-reference to an external security exhibit counts only if that exhibit is confirmed to contain risk-appropriate measures; an unconfirmed pointer is a dependency, not proof. Confidentiality-only language without integrity/availability/resilience or risk-appropriateness is partial, not full proof.",
    proofElements: [
  {
    "id": "S1",
    "description": "Technical and organisational measures address ongoing confidentiality, integrity, availability, and resilience of processing systems and services.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Article 32(1)(b) CIA/resilience limb — encryption, access controls, resilience, or equivalent measures, not a bare 'reasonable security' recital.",
    "nonProofTraps": [
      "A generic 'appropriate security' statement naming no confidentiality, integrity, availability, or resilience measures.",
      "Confidentiality-only language with no integrity, availability, or resilience commitment."
    ],
    "remediationGuidance": "Implement measures ensuring confidentiality, integrity, availability, and resilience of processing systems."
  },
  {
    "id": "S2",
    "description": "Security measures are appropriate to the risk — considering state of the art, implementation cost, processing nature/scope/context/purposes, and likely impact on individuals.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Risk-appropriate TOMs limb — measures tied to risk context, not one-size-fits-all boilerplate.",
    "nonProofTraps": [
      "A fixed checklist of controls with no risk-appropriateness framing.",
      "Referencing an external standard with no obligation to implement risk-appropriate measures."
    ],
    "remediationGuidance": "Tie security measures to processing risk, context, and likely individual impact."
  }
],
  },
  "gdpr.art33.1": {
    hypothesis:
      "After becoming aware of a personal-data breach, the controller notifies the competent supervisory authority without undue delay and, where feasible, within 72 hours; a later notification explains the reasons for delay.",
    evidenceHints: ["within 72 hours", "72-hour", "notify the supervisory authority", "competent supervisory authority", "reasons for delay", "becoming aware of a personal data breach"],
    proofStandard:
      "Proven by text requiring the controller to notify the competent supervisory authority after becoming aware of a personal-data breach, without undue delay and where feasible within 72 hours.",
    proofElements: [
  {
    "id": "authority_notification",
    "description": "Controller notifies the competent supervisory authority after becoming aware of a personal-data breach.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Obligation on the controller to notify the supervisory authority upon breach awareness.",
    "nonProofTraps": [
      "Processor-to-controller notification clauses (Article 33(2)).",
      "Generic cooperation or dispute clauses."
    ],
    "remediationGuidance": "Require the controller to notify the competent supervisory authority of personal data breaches."
  },
  {
    "id": "deadline_and_delay",
    "description": "Notification occurs without undue delay and, where feasible, within 72 hours, with reasons provided if delayed.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "72-hour / without undue delay timing requirement, plus duty to explain reasons for delay.",
    "nonProofTraps": [
      "Vague 'promptly' timing with no 72-hour backstop.",
      "Notice with no requirement to explain reasons for delay."
    ],
    "remediationGuidance": "Set a 72-hour notification backstop and require explanations for delayed notice."
  }
],
  },
  "gdpr.art33.2": {
    hypothesis:
      "After becoming aware of a personal-data breach, the processor notifies the controller without undue delay.",
    evidenceHints: ["personal data breach", "without undue delay", "notify the controller", "becoming aware", "assist", "breach notification"],
    proofStandard:
      "Proven by text obligating the processor, after becoming aware of a personal-data breach, to notify the controller without undue delay.",
    proofElements: [
  {
    "id": "breach_awareness_trigger",
    "description": "Notification is triggered by processor awareness of a personal-data breach.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Explicit breach-awareness trigger for notification.",
    "nonProofTraps": [
      "Notification triggered only after full internal investigation or confirmation of harm."
    ],
    "remediationGuidance": "Trigger breach notification upon processor awareness."
  },
  {
    "id": "processor_to_controller",
    "description": "The processor must notify the controller.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Direct obligation on the processor to inform the controller.",
    "nonProofTraps": [
      "Processor notifying third parties or authorities instead of the controller."
    ],
    "remediationGuidance": "Obligate the processor to notify the controller directly."
  },
  {
    "id": "without_undue_delay",
    "description": "Notification must occur without undue delay.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "'Without undue delay' or specific short numeric timeframe (e.g. 24-48 hours).",
    "nonProofTraps": [
      "Commercially reasonable efforts or open-ended timing."
    ],
    "remediationGuidance": "Require processor breach notification without undue delay."
  }
],
  },
  "gdpr.art33.3": {
    hypothesis:
      "The supervisory-authority breach notification describes the breach nature and affected categories/numbers, provides DPO or contact details, describes likely consequences, and describes measures taken or proposed including mitigation.",
    evidenceHints: ["nature of the personal data breach", "categories and approximate number", "data protection officer contact", "likely consequences", "measures taken or proposed", "mitigate adverse effects", "details of data incident"],
    proofStandard:
      "Assess the minimum notification content element by element. Incident details or mitigation alone are partial evidence, not full proof. Full coverage requires: breach nature with affected data-subject and record categories/approximate numbers; DPO or contact-point details; likely consequences; and measures taken or proposed, including mitigation where appropriate. A processor notice may support the controller's report only to the extent it supplies these particulars.",
    proofElements: [
  {
    "id": "breach_nature_and_scale",
    "description": "Breach nature plus affected categories and approximate numbers",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "contact_details",
    "description": "DPO or other contact point details",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "likely_consequences",
    "description": "Likely consequences of the breach",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "measures_and_mitigation",
    "description": "Measures taken or proposed and mitigation of adverse effects",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art33.4": {
    hypothesis:
      "Where all required breach-notification information cannot be supplied at once, it may be provided in phases without undue further delay.",
    evidenceHints: ["provided in phases", "information may be provided in phases", "without undue further delay", "not possible to provide at the same time", "supplemental breach notification"],
    proofStandard:
      "Proven only by text allowing unavailable Article 33(3) information to be supplied in phases while requiring the remaining information without undue further delay. An open-ended right to supplement later, with no urgency standard, is insufficient.",
    proofElements: [
  {
    "id": "phased_information",
    "description": "Unavailable breach information may be supplied in phases",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "further_delay_limit",
    "description": "Remaining information must follow without undue further delay",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art33.5": {
    hypothesis:
      "Every personal-data breach is documented with the facts relating to the breach, its effects, and the remedial action taken, in a form sufficient to verify compliance with Articles 33 and 34.",
    evidenceHints: ["document", "documentation", "breach record", "facts of the breach", "effects", "remedial action", "remediation"],
    proofStandard:
      "Proven only by text committing to document each personal-data breach with facts, effects, and remedial action in a form sufficient to verify Articles 33-34 compliance — not merely a duty to notify. A breach-notification clause alone does not establish recordkeeping unless it also requires documenting facts, effects, and remedial measures. Silence on breach documentation entirely is a gap. Supervisory-authority notification form content under Article 33(3)-(4) is outside this particular.",
    proofElements: [
  {
    "id": "breach_facts",
    "description": "Documentation of facts relating to each personal-data breach",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "breach_effects",
    "description": "Documentation of breach effects",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "remedial_action",
    "description": "Documentation of remedial action taken",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art34": {
    hypothesis:
      "When a personal-data breach is likely to result in a high risk to individuals, the controller communicates the breach to affected data subjects without undue delay in clear plain language, describing its nature, DPO/contact details, likely consequences, and measures taken or proposed to address it — subject only to the Article 34(3) exceptions.",
    evidenceHints: ["communicate to data subjects", "high risk", "without undue delay", "plain language", "likely consequences", "mitigation", "encryption"],
    proofStandard:
      "Proven only by text that commits to individual communication when a breach is likely to create high risk — including nature, contact point, likely consequences, and mitigation — in clear plain language without undue delay. A processor-to-controller breach notice alone does NOT satisfy this controller-side Article 34 duty. Narrow Article 34(3) exceptions (effective technical protection, subsequent elimination of high risk, or disproportionate effort with equally effective public communication) are consistent and do not defeat the commitment when stated. Silence on high-risk individual communication is a gap where breach response is in scope.",
    proofElements: [
  {
    "id": "high_risk_trigger",
    "description": "Communication is triggered by a breach likely to create high risk",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "affected_individuals",
    "description": "Controller communicates the breach to affected data subjects",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "timing_and_language",
    "description": "Communication is without undue delay and in clear plain language",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "individual_notice_content",
    "description": "Communication includes nature, contact point, likely consequences, and mitigation",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art35": {
    hypothesis:
      "Before likely-high-risk processing, the controller performs a data protection impact assessment documenting processing operations and purposes, necessity/proportionality, risk assessment, and safeguards — seeking DPO advice where designated and reviewing when risk changes.",
    evidenceHints: ["data protection impact assessment", "dpia", "high risk", "necessity", "proportionality", "safeguards", "prior to processing"],
    proofStandard:
      "Proven only by text that (a) commits to performing a DPIA before processing likely to result in high risk AND (b) addresses documented assessment content — operations/purposes, necessity/proportionality, risks, and mitigating measures. A bare optional 'DPIA may be conducted' statement, or a generic 'we comply with GDPR' recital, does not satisfy Article 35's before-processing and documentation requirements. Where high-risk processing is described in the agreement with no DPIA commitment, this is a gap. Supervisory-authority list/public-law exceptions under Article 35(5)-(6) are outside this particular.",
    proofElements: [
  {
    "id": "D1",
    "description": "Where processing is likely to result in a high risk, a data protection impact assessment is performed before that processing begins.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "When-required limb — DPIA before likely-high-risk processing (systematic monitoring, special-category data at scale, automated decision-making with legal effects, etc.).",
    "nonProofTraps": [
      "A generic 'DPIA may be conducted' option with no before-processing trigger for high-risk processing.",
      "Silence on DPIA where high-risk processing is described."
    ],
    "remediationGuidance": "Commit to performing a DPIA before likely-high-risk processing begins."
  },
  {
    "id": "D2",
    "description": "The DPIA documents processing operations and purposes, necessity/proportionality assessment, risk assessment, and measures to address risks — including safeguards, security measures, and mechanisms demonstrating compliance.",
    "kind": "mandatory",
    "required": true,
    "proofGuidance": "Documented content limb — not merely a promise to 'carry out a DPIA' with no documented assessment elements.",
    "nonProofTraps": [
      "A bare 'we will conduct a DPIA' commitment with no documented assessment content.",
      "Risk assessment language with no safeguards or compliance-evidence element."
    ],
    "remediationGuidance": "Document DPIA content covering operations, necessity, risks, and mitigating measures."
  }
],
  },
  "gdpr.art36": {
    hypothesis:
      "Where a DPIA indicates processing would result in high risk in the absence of controller measures to mitigate the risk, the controller consults the supervisory authority before processing and provides information to support that consultation.",
    evidenceHints: ["prior consultation", "supervisory authority", "consultation before processing", "high risk", "mitigate the risk", "dpia"],
    proofStandard:
      "Proven by text committing to prior consultation with the supervisory authority before processing when a DPIA indicates unmitigated high risk.",
    proofElements: [
  {
    "id": "high_risk_unmitigated_trigger",
    "description": "Prior consultation is triggered when a DPIA shows high risk remains after mitigation measures.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Trigger linking prior consultation to unmitigated high risk identified in a DPIA.",
    "nonProofTraps": ["Generic cooperation with authorities without a pre-processing consultation trigger."],
    "remediationGuidance": "Commit to consulting the supervisory authority when a DPIA shows unmitigated high risk."
  },
  {
    "id": "prior_consultation_obligation",
    "description": "The controller consults the supervisory authority prior to processing.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Obligation to consult the supervisory authority before initiating processing.",
    "nonProofTraps": ["Post-hoc reporting after processing has commenced."],
    "remediationGuidance": "Require supervisory authority consultation prior to processing."
  }
],
  },

  // --- gdpr.principles.consent_and_accountability (mostly 1:1; art7.* share one profile) ---
  "gdpr.art5.1": {
    hypothesis:
      "Personal data is processed lawfully, fairly, and transparently; collected for specified, explicit, legitimate purposes; limited to what is necessary; kept accurate and no longer than necessary; and secured against unauthorised or unlawful processing and accidental loss, destruction, or damage.",
    evidenceHints: ["lawfully", "fairly", "transparently", "specified purpose", "data minimisation", "accuracy", "retention", "security", "principles"],
    proofStandard:
      "Proven by text committing to processing personal data in accordance with Article 5(1) principles.",
    proofElements: [
  {
    "id": "lawfulness_fairness_transparency",
    "description": "Personal data is processed lawfully, fairly, and in a transparent manner.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitment to lawful, fair, and transparent processing.",
    "nonProofTraps": ["A generic 'comply with applicable laws' recital without data protection principle commitments."],
    "remediationGuidance": "Add express commitments to lawfulness, fairness, and transparency."
  },
  {
    "id": "purpose_limitation_minimisation",
    "description": "Data is collected for specified explicit purposes and limited to what is necessary.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitment to purpose limitation and data minimisation.",
    "nonProofTraps": ["Unrestricted processing for 'any business purpose'."],
    "remediationGuidance": "Limit processing to specified, explicit, and legitimate purposes."
  },
  {
    "id": "accuracy_storage_security",
    "description": "Data is kept accurate, retained no longer than necessary, and processed securely.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitments to accuracy, storage limitation, and integrity/security.",
    "nonProofTraps": ["Indefinite retention without accuracy or security commitments."],
    "remediationGuidance": "Commit to data accuracy, storage limitation, and security."
  }
],
  },
  "gdpr.art5.2": {
    hypothesis: "The controller is responsible for compliance with Article 5(1) principles and can demonstrate that compliance.",
    evidenceHints: ["accountability", "demonstrate compliance", "responsible for compliance", "records", "policies"],
    proofStandard:
      "Proven by text establishing controller responsibility for compliance with Article 5(1) principles and the ability to demonstrate compliance.",
    proofElements: [
  {
    "id": "compliance_responsibility",
    "description": "The controller accepts responsibility for compliance with processing principles.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Explicit controller accountability statement.",
    "nonProofTraps": ["Shifting core controller accountability to a processor."],
    "remediationGuidance": "State that the controller is responsible for compliance with data protection principles."
  },
  {
    "id": "demonstration_capability",
    "description": "The controller can demonstrate compliance with data protection principles.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Obligation or capability to demonstrate principle compliance (documentation, policies, records).",
    "nonProofTraps": ["Responsibility without any recordkeeping or demonstration mechanism."],
    "remediationGuidance": "Commit to maintaining records and policies to demonstrate compliance."
  }
],
  },
  "gdpr.art6.1": {
    hypothesis:
      "For each processing purpose, the controller identifies and satisfies at least one Article 6(1) lawful basis — consent, contract necessity, legal obligation, vital interests, public task, or legitimate interests (with necessity and balancing, especially for children).",
    evidenceHints: ["lawful basis", "legal basis", "consent", "contract", "legitimate interests", "legal obligation", "public task"],
    proofStandard:
      "Proven by text identifying an Article 6(1) lawful basis for the processing activities.",
    proofElements: [
  {
    "id": "identified_lawful_basis",
    "description": "At least one Article 6(1) lawful basis is identified for the processing.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Identification of consent, contract necessity, legal obligation, vital interests, public task, or legitimate interests.",
    "nonProofTraps": ["A generic assertion that 'processing is lawful' without specifying a legal basis."],
    "remediationGuidance": "Identify the applicable Article 6(1) lawful basis for processing."
  },
  {
    "id": "purpose_basis_mapping",
    "description": "Lawful bases are mapped to specified processing purposes.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Linkage between processing purposes and their lawful bases.",
    "nonProofTraps": ["A list of legal bases with no connection to processing purposes."],
    "remediationGuidance": "Specify which lawful basis applies to each processing purpose."
  }
],
  },
  "gdpr.art7.1": {
    hypothesis:
      "Where processing relies on consent, the controller can demonstrate consent; consent requests are clear, distinguishable, and in plain language; withdrawal is as easy as giving consent and is disclosed before consenting; and consent is not made conditional on unnecessary processing.",
    evidenceHints: ["demonstrate consent", "freely given", "withdraw consent", "plain language", "distinguishable", "conditionality"],
    proofStandard:
      "Proven only where consent is identified as a lawful basis AND text addresses Article 7 conditions: demonstrability, clear/distinguishable requests, pre-consent withdrawal disclosure with withdrawal as easy as consent, and no bundling of unnecessary processing as a condition of service. If the processing basis is unstated, applicability is unknown; N/A requires affirmative evidence that consent is not the relevant basis. A generic 'consent will be obtained lawfully' statement without operative Art 7 mechanics is partial, not full proof.",
    proofElements: [
  {
    "id": "demonstrability",
    "description": "The controller must be able to demonstrate that the data subject consented (Art 7(1)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "clear_distinguishable_request",
    "description": "A written consent request presented with other matters is clearly distinguishable, intelligible, easily accessible, and in clear plain language (Art 7(2)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "withdrawal_disclosure",
    "description": "The data subject is informed before consenting that consent may be withdrawn at any time without affecting prior lawful processing, and withdrawal is as easy as giving consent (Art 7(3)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "no_bundling",
    "description": "Consent is not made a condition of a contract or service for processing unnecessary for that contract (Art 7(4)).",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art7.2": {
    hypothesis:
      "A written consent request presented with other matters must be clearly distinguishable, intelligible, easily accessible, and written in clear and plain language; non-compliant parts are not binding.",
    evidenceHints: ["demonstrate consent", "freely given", "withdraw consent", "plain language", "distinguishable", "conditionality"],
    proofStandard:
      "Proven only where consent is identified as a lawful basis AND text addresses Article 7 conditions: demonstrability, clear/distinguishable requests, pre-consent withdrawal disclosure with withdrawal as easy as consent, and no bundling of unnecessary processing as a condition of service. If the processing basis is unstated, applicability is unknown; N/A requires affirmative evidence that consent is not the relevant basis. A generic 'consent will be obtained lawfully' statement without operative Art 7 mechanics is partial, not full proof.",
    proofElements: [
  {
    "id": "demonstrability",
    "description": "The controller must be able to demonstrate that the data subject consented (Art 7(1)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "clear_distinguishable_request",
    "description": "A written consent request presented with other matters is clearly distinguishable, intelligible, easily accessible, and in clear plain language (Art 7(2)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "withdrawal_disclosure",
    "description": "The data subject is informed before consenting that consent may be withdrawn at any time without affecting prior lawful processing, and withdrawal is as easy as giving consent (Art 7(3)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "no_bundling",
    "description": "Consent is not made a condition of a contract or service for processing unnecessary for that contract (Art 7(4)).",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art7.3": {
    hypothesis:
      "The data subject must be informed before consenting that consent may be withdrawn at any time, without affecting prior lawful processing, and withdrawal must be as easy as giving consent.",
    evidenceHints: ["demonstrate consent", "freely given", "withdraw consent", "plain language", "distinguishable", "conditionality"],
    proofStandard:
      "Proven only where consent is identified as a lawful basis AND text addresses Article 7 conditions: demonstrability, clear/distinguishable requests, pre-consent withdrawal disclosure with withdrawal as easy as consent, and no bundling of unnecessary processing as a condition of service. If the processing basis is unstated, applicability is unknown; N/A requires affirmative evidence that consent is not the relevant basis. A generic 'consent will be obtained lawfully' statement without operative Art 7 mechanics is partial, not full proof.",
    proofElements: [
  {
    "id": "demonstrability",
    "description": "The controller must be able to demonstrate that the data subject consented (Art 7(1)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "clear_distinguishable_request",
    "description": "A written consent request presented with other matters is clearly distinguishable, intelligible, easily accessible, and in clear plain language (Art 7(2)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "withdrawal_disclosure",
    "description": "The data subject is informed before consenting that consent may be withdrawn at any time without affecting prior lawful processing, and withdrawal is as easy as giving consent (Art 7(3)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "no_bundling",
    "description": "Consent is not made a condition of a contract or service for processing unnecessary for that contract (Art 7(4)).",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art7.4": {
    hypothesis:
      "When assessing whether consent is freely given, take utmost account of whether a contract or service is made conditional on consent to processing that is unnecessary for that contract.",
    evidenceHints: ["demonstrate consent", "freely given", "withdraw consent", "plain language", "distinguishable", "conditionality"],
    proofStandard:
      "Proven only where consent is identified as a lawful basis AND text addresses Article 7 conditions: demonstrability, clear/distinguishable requests, pre-consent withdrawal disclosure with withdrawal as easy as consent, and no bundling of unnecessary processing as a condition of service. If the processing basis is unstated, applicability is unknown; N/A requires affirmative evidence that consent is not the relevant basis. A generic 'consent will be obtained lawfully' statement without operative Art 7 mechanics is partial, not full proof.",
    proofElements: [
  {
    "id": "demonstrability",
    "description": "The controller must be able to demonstrate that the data subject consented (Art 7(1)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "clear_distinguishable_request",
    "description": "A written consent request presented with other matters is clearly distinguishable, intelligible, easily accessible, and in clear plain language (Art 7(2)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "withdrawal_disclosure",
    "description": "The data subject is informed before consenting that consent may be withdrawn at any time without affecting prior lawful processing, and withdrawal is as easy as giving consent (Art 7(3)).",
    "required": true,
    "kind": "mandatory"
  },
  {
    "id": "no_bundling",
    "description": "Consent is not made a condition of a contract or service for processing unnecessary for that contract (Art 7(4)).",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art24": {
    hypothesis:
      "The controller implements and periodically updates proportionate technical and organisational measures reflecting processing nature, scope, context, purposes, and risks, and uses appropriate data-protection policies where proportionate, to demonstrate GDPR compliance.",
    evidenceHints: ["controller responsibility", "technical and organisational measures", "data protection policies", "proportionate", "demonstrate compliance"],
    proofStandard:
      "Proven by text establishing controller implementation of proportionate technical and organisational measures and data protection policies.",
    proofElements: [
  {
    "id": "proportionate_measures",
    "description": "The controller implements proportionate technical and organisational measures reflecting processing nature, scope, context, and risks.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitment by the controller to implement risk-appropriate technical and organisational measures.",
    "nonProofTraps": ["Generic processor security clauses that do not establish controller-side governance."],
    "remediationGuidance": "State that the controller implements proportionate technical and organisational security measures."
  },
  {
    "id": "data_protection_policies",
    "description": "Appropriate data-protection policies are implemented where proportionate to processing activities.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitment to implement and maintain data protection policies.",
    "nonProofTraps": ["Operational measures with no policy framework or governance commitments."],
    "remediationGuidance": "Implement and maintain appropriate data-protection policies."
  }
],
  },
  "gdpr.art25": {
    hypothesis:
      "At design time and during processing, state-of-the-art, cost- and risk-appropriate measures embed data-protection principles and rights by design and by default — processing only data necessary for each purpose and limiting accessibility by default.",
    evidenceHints: ["privacy by design", "by default", "data minimisation", "state of the art", "necessary for each purpose"],
    proofStandard:
      "Proven by text committing to data protection by design and by default.",
    proofElements: [
  {
    "id": "by_design_measures",
    "description": "Technical and organisational measures embed data protection principles and safeguards into system design.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Express commitment to data protection / privacy by design.",
    "nonProofTraps": ["General security commitments with no privacy-by-design principles."],
    "remediationGuidance": "Incorporate data-protection principles into technical and system design."
  },
  {
    "id": "by_default_minimisation",
    "description": "By default, only personal data necessary for each specific processing purpose is processed.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Express commitment to data protection / privacy by default and minimisation.",
    "nonProofTraps": ["Default collection of broad or unrestricted user data."],
    "remediationGuidance": "Ensure default settings process only data necessary for specified purposes."
  }
],
  },
  "gdpr.art26": {
    hypothesis:
      "Joint controllers transparently allocate GDPR responsibilities — especially rights handling and Articles 13-14 notices — reflect actual roles, make the arrangement's essence available to individuals, and preserve rights against each controller.",
    evidenceHints: ["joint controllers", "joint controllership", "allocation of responsibilities", "essence of the arrangement", "transparent"],
    proofStandard:
      "Proven where joint controllership applies and text transparently allocates responsibilities and discloses the arrangement essence.",
    proofElements: [
  {
    "id": "responsibility_allocation",
    "description": "GDPR compliance responsibilities (especially DSRs and notices) are allocated between joint controllers.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where two or more parties act as joint controllers determining processing purposes and means.",
    "proofGuidance": "Explicit contractual allocation of GDPR duties between joint controllers.",
    "nonProofTraps": ["Naming parties 'joint controllers' without allocating specific compliance duties."],
    "remediationGuidance": "Contractually allocate GDPR compliance responsibilities between the joint controllers."
  },
  {
    "id": "essence_transparency",
    "description": "The essence of the joint-controller arrangement is made available to data subjects.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where joint controllership exists.",
    "proofGuidance": "Commitment to make the essence of the joint arrangement available to individuals.",
    "nonProofTraps": ["A confidential joint-controller agreement with no public summary or notice."],
    "remediationGuidance": "Make the essence of the joint-controller arrangement available to data subjects."
  }
],
  },
  "gdpr.art27": {
    hypothesis:
      "A non-EU controller or processor within Article 3(2) designates a written EU representative established where relevant individuals are located, mandated as the GDPR contact, without displacing controller or processor liability — unless the narrow occasional low-risk exception applies.",
    evidenceHints: ["eu representative", "representative in the union", "article 27", "article 3(2)", "mandated"],
    proofStandard:
      "Proven where a non-EU entity subject to Article 3(2) designates a written EU representative.",
    proofElements: [
  {
    "id": "written_designation",
    "description": "A non-EU controller/processor subject to Article 3(2) designates an EU representative in writing.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies to non-EU controllers or processors within Article 3(2) extra-territorial scope. N/A for EU-established entities.",
    "proofGuidance": "Designation of an EU representative in writing.",
    "nonProofTraps": ["Naming a general corporate contact or DPO instead of an Article 27 EU representative."],
    "remediationGuidance": "Designate a written Article 27 EU representative."
  },
  {
    "id": "representative_mandate",
    "description": "The EU representative is mandated to be addressed in addition to or instead of the controller/processor on GDPR compliance matters.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where an Article 27 EU representative is required.",
    "proofGuidance": "Mandate authorizing the EU representative as a contact point for authorities and individuals.",
    "nonProofTraps": ["Representative named without an explicit mandate to act as GDPR contact."],
    "remediationGuidance": "Mandate the EU representative as the contact point for supervisory authorities and data subjects."
  }
],
  },
  "gdpr.art30": {
    hypothesis:
      "Controllers and processors maintain written records of processing activities containing the Article 30 particulars applicable to their role, subject to the under-250-person exemption limits.",
    evidenceHints: ["records of processing", "record of processing activities", "ropa", "article 30", "processing activities"],
    proofStandard:
      "Proven by text committing controllers or processors to maintain written records of processing activities.",
    proofElements: [
  {
    "id": "record_maintenance",
    "description": "The party maintains written (including electronic) records of processing activities under its responsibility.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Commitment to maintain records of processing activities (ROPA).",
    "nonProofTraps": ["Maintaining a privacy notice without a internal processing activities record."],
    "remediationGuidance": "Commit to maintaining written records of processing activities."
  },
  {
    "id": "required_particulars_content",
    "description": "Records include role-appropriate Article 30 particulars (purposes, categories, recipients, transfers, retention, TOMs).",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Requirement that ROPA contains Article 30(1) or 30(2) particulars.",
    "nonProofTraps": ["An informal log missing core Article 30 particulars."],
    "remediationGuidance": "Ensure records of processing activities contain all required Article 30 particulars."
  }
],
  },

  // --- gdpr.transparency.special_categories_and_notices (1:1) ---
  "gdpr.art6.4": {
    hypothesis:
      "Before further processing for a new purpose not based on consent or law, the controller assesses compatibility by considering the link between purposes, collection context and relationship, data nature, possible consequences, and safeguards such as encryption or pseudonymisation.",
    evidenceHints: ["compatible further processing", "compatibility assessment", "new purpose", "link between purposes", "collection context", "pseudonymisation", "encryption", "safeguards"],
    proofStandard:
      "Proven by text committing to a purpose-compatibility assessment before further processing for a new purpose.",
    proofElements: [
  {
    "id": "compatibility_assessment",
    "description": "A purpose-compatibility assessment is conducted before further processing for a new purpose.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where the controller contemplates further processing for new purposes not based on consent or law.",
    "proofGuidance": "Requirement to assess purpose compatibility before further processing.",
    "nonProofTraps": ["Unilateral right to process data for any new business purpose without compatibility assessment."],
    "remediationGuidance": "Require a purpose-compatibility assessment prior to further processing for new purposes."
  },
  {
    "id": "safeguard_consideration",
    "description": "The compatibility assessment considers safeguards such as encryption or pseudonymisation.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where further processing for a new purpose occurs.",
    "proofGuidance": "Inclusion of safeguards (encryption/pseudonymisation) in compatibility evaluations.",
    "nonProofTraps": ["Vague promise of compatible processing with no safeguard obligations."],
    "remediationGuidance": "Incorporate safeguard evaluation into purpose-compatibility reviews."
  }
],
  },
  "gdpr.art8.1-2": {
    hypothesis:
      "For an information-society service offered directly to a child and relying on consent, the applicable national age threshold is observed; below that threshold, consent is obtained or authorised through the holder of parental responsibility, with reasonable efforts using available technology to verify that authorisation.",
    evidenceHints: ["child", "children", "parental consent", "parental responsibility", "age of consent", "information society service", "verify", "authorisation"],
    proofStandard:
      "Proven where child-directed information society services relying on consent are in scope and text addresses age thresholds, parental consent, and verification.",
    proofElements: [
  {
    "id": "parental_consent_mechanism",
    "description": "For children below the national age threshold, processing relies on consent given or authorised by the holder of parental responsibility.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where information society services relying on consent are offered directly to children.",
    "proofGuidance": "Requirement for verifiable parental/guardian consent for children below the age threshold.",
    "nonProofTraps": ["Generic terms of service with no age gate or parental consent mechanism."],
    "remediationGuidance": "Implement parental consent authorization for children below the national age threshold."
  },
  {
    "id": "verification_efforts",
    "description": "Reasonable efforts using available technology are made to verify that consent is given or authorised by the holder of parental responsibility.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where parental consent is required for children's data processing.",
    "proofGuidance": "Requirement to make reasonable technological efforts to verify parental authorization.",
    "nonProofTraps": ["Unverified checkbox claiming age over 13/16."],
    "remediationGuidance": "Use reasonable verification measures for parental consent."
  }
],
  },
  "gdpr.art9.1-3": {
    hypothesis:
      "Processing revealing racial or ethnic origin, political opinions, religion or beliefs, trade-union membership, genetic or biometric identification data, health data, or sex-life or sexual-orientation data is prohibited unless a specific Article 9(2) condition applies; health processing under Article 9(2)(h) also requires professional secrecy or an equivalent duty.",
    evidenceHints: ["special category", "special categories", "health data", "biometric", "genetic", "sensitive personal data", "article 9", "explicit consent", "professional secrecy"],
    proofStandard:
      "Proven where special-category data processing is in scope and text establishes a specific Article 9(2) condition.",
    proofElements: [
  {
    "id": "article9_2_condition",
    "description": "A specific Article 9(2) exception condition (e.g. explicit consent, employment law) is identified for special-category processing.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where special-category (sensitive) personal data is processed.",
    "proofGuidance": "Explicit identification of an Article 9(2) exception ground.",
    "nonProofTraps": ["Relying on a general Article 6 basis without meeting Article 9(2) requirements for sensitive data."],
    "remediationGuidance": "Specify the applicable Article 9(2) condition for special-category data processing."
  },
  {
    "id": "secrecy_safeguards",
    "description": "Health data processing under Article 9(2)(h) is subject to professional secrecy or equivalent confidentiality duties.",
    "required": false,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where health data is processed for medical or healthcare purposes under Article 9(2)(h).",
    "proofGuidance": "Requirement of professional secrecy or equivalent statutory secrecy for health data handlers.",
    "nonProofTraps": ["Health data handling with no professional secrecy or heightened confidentiality covenant."],
    "remediationGuidance": "Bind health data handlers to professional secrecy or equivalent duties."
  }
],
  },
  "gdpr.art10": {
    hypothesis:
      "Criminal-conviction, offence, and related security-measure data is processed on an Article 6 basis only under official control or where Union or Member State law authorises processing with appropriate safeguards; a comprehensive register is kept only under official control.",
    evidenceHints: ["criminal conviction", "criminal offence", "offence data", "security measures", "official control", "article 10", "safeguards"],
    proofStandard:
      "Proven where criminal-conviction or offence data processing is in scope and text reflects official control or specific legal authorisation with safeguards.",
    proofElements: [
  {
    "id": "official_control_or_law_basis",
    "description": "Criminal-conviction and offence data is processed only under official authority or specific law providing appropriate safeguards.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where criminal conviction or offence data is processed.",
    "proofGuidance": "Citation of official authority or specific statutory authorisation and safeguards for offence data.",
    "nonProofTraps": ["Standard background check clause with no statutory or official authority basis."],
    "remediationGuidance": "Ensure criminal-conviction data is processed under official control or specific legal authorization with safeguards."
  },
  {
    "id": "no_unauthorised_register",
    "description": "No comprehensive register of criminal convictions is maintained outside official authority control.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where criminal conviction data is processed.",
    "proofGuidance": "Restriction against maintaining an unauthorized register of criminal offences.",
    "nonProofTraps": ["Unrestricted compilation or registry of offence data."],
    "remediationGuidance": "Prohibit maintaining a comprehensive criminal conviction register outside official control."
  }
],
  },
  "gdpr.art11.1": {
    hypothesis:
      "The controller need not maintain or acquire identifying information solely to comply with GDPR where processing purposes do not require identification of a data subject.",
    evidenceHints: ["identification", "not required to identify", "anonymous", "pseudonymous", "do not maintain identifying", "article 11"],
    proofStandard:
      "Proven only by text recognising that identifying information need not be maintained or acquired solely for GDPR compliance where purposes do not require identification — not a bare pseudonymisation recital. Silence is not a gap unless the agreement invents an obligation to identify solely for compliance. Where processing clearly requires identification, treat as not applicable rather than contradicted.",
    proofElements: [
  {
    "id": "primary",
    "description": "Non-identification where purposes allow (Art 11(1))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art11.2": {
    hypothesis:
      "If the controller can demonstrate it cannot identify the data subject, it informs the individual where possible; Articles 15-20 do not apply unless the individual supplies additional information enabling identification, and Article 11 is not used to reject a request once adequate identifying information is provided.",
    evidenceHints: ["cannot identify", "additional information", "enable identification", "inform the data subject", "articles 15-20", "article 11"],
    proofStandard:
      "Proven only by text that (a) allows informing the individual when identification is demonstrably impossible AND (b) does not use non-identification as a permanent bar once adequate identifying information is supplied. A clause that permanently refuses Articles 15-20 rights without a path to provide identifying information contradicts Art 11(2). Silence where non-identification is not claimed is not a gap.",
    proofElements: [
  {
    "id": "primary",
    "description": "Rights where identification is unnecessary (Art 11(2))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art12.1-2": {
    hypothesis:
      "Articles 13-14 information and Articles 15-22 and 34 communications are provided concisely, transparently, intelligibly, accessibly, and in clear plain language — especially for children — and rights requests are facilitated without refusal solely because identity cannot be established unless that inability is demonstrated.",
    evidenceHints: ["transparent", "intelligible", "plain language", "accessible", "concise", "facilitate", "clear language", "children"],
    proofStandard:
      "Proven only by text committing to clear, plain, accessible communications for privacy information and rights/breach notices, plus facilitation of rights requests. A bare 'transparent processing' or GDPR recital without operative plain-language/facilitation commitments is insufficient. Refusal of rights solely for unverified identity doubts without demonstrated inability is a gap relative to Art 12(2).",
    proofElements: [
  {
    "id": "primary",
    "description": "Transparent communications and facilitation of rights (Art 12(1)-(2))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art12.4": {
    hypothesis:
      "If the controller does not act on a rights request, it informs the data subject without delay and within one month of the reasons and of the right to complain and seek a judicial remedy.",
    evidenceHints: ["refusal", "does not take action", "reasons", "one month", "right to lodge a complaint", "judicial remedy", "without delay"],
    proofStandard:
      "Proven only by text requiring reasoned notice within one month when a rights request is not acted on, including complaint and judicial-remedy information. A silent refusal or 'we may decline requests' without reasons and one-month timing is a gap. Supervisory-authority procedure is outside this particular.",
    proofElements: [
  {
    "id": "primary",
    "description": "Reasoned refusal notice (Art 12(4))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art12.7": {
    hypothesis:
      "Where standardised icons are used in an electronic privacy notice, they are presented in an easily visible, intelligible, and legibly coloured form and remain machine-readable electronically.",
    evidenceHints: ["privacy icons", "standardised icons", "machine-readable", "electronic notice", "legibly coloured", "icons"],
    proofStandard:
      "Proven only where standardised privacy icons are used AND text/materials show visible, intelligible, legibly coloured, machine-readable presentation. If icons are not used, treat as not applicable — Art 12(7) does not require icons. A vague 'may use icons' statement without presentation standards is partial when icons are actually deployed.",
    proofElements: [
  {
    "id": "primary",
    "description": "Standardised privacy icons (Art 12(7))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art12.5-6": {
    hypothesis:
      "Rights information and action are ordinarily free; a reasonable administrative-cost fee or refusal is allowed only when the controller proves a request is manifestly unfounded or excessive, particularly because it is repetitive; additional identity information may be requested only where reasonable doubts exist.",
    evidenceHints: ["free of charge", "manifestly unfounded", "excessive", "repetitive", "administrative fee", "reasonable doubts", "identity verification"],
    proofStandard:
      "Proven only by text that treats ordinary rights requests as free and limits fees/refusal to proven manifestly unfounded or excessive requests, with identity checks only on reasonable doubts. A blanket fee for all DSRs, or identity demands without doubt threshold, contradicts Art 12(5)-(6). Silence on fees where DSR handling is otherwise addressed is a partial gap.",
    proofElements: [
  {
    "id": "primary",
    "description": "Free requests, limited fee/refusal, and identity checks (Art 12(5)-(6))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art13.1-2": {
    hypothesis:
      "At collection from the data subject, the controller provides controller and DPO contact details; purposes and lawful basis; legitimate interests where used; recipients; intended third-country transfers and safeguards; retention period or criteria; applicable rights; consent withdrawal; complaint route; whether provision is required and consequences; and meaningful automated-decision information including logic, significance, and envisaged consequences.",
    evidenceHints: ["privacy notice", "at the time of collection", "purposes", "lawful basis", "recipients", "retention", "data subject rights", "transfers", "automated decision", "DPO"],
    proofStandard:
      "Proven only by text/notice content covering the Art 13(1)-(2) particulars applicable to the processing described — not a bare 'privacy notice will be provided' recital. Missing core particulars (purposes/basis, rights, retention, transfers where relevant) is a gap. A cross-reference to an external policy counts only if that policy's Art 13 content is confirmed; an unconfirmed pointer is a dependency, not full proof.",
    proofElements: [
  {
    "id": "primary",
    "description": "Direct-collection privacy information (Art 13(1)-(2))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art13.3-4": {
    hypothesis:
      "Before using directly collected data for a new purpose, the controller tells the data subject that purpose and all relevant further information, unless the individual already has the information.",
    evidenceHints: ["further processing", "new purpose", "prior to further processing", "already has the information", "additional information"],
    proofStandard:
      "Proven only by text committing to pre-processing notice of a new purpose and relevant further Art 13 information, subject to the 'already has the information' exception. A one-time initial notice with no new-purpose update mechanism is partial where further purposes are contemplated. If no further/new purposes are in scope, treat as not applicable.",
    proofElements: [
  {
    "id": "primary",
    "description": "Direct-data new-purpose notice (Art 13(3)-(4))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art14.1-2": {
    hypothesis:
      "For personal data obtained elsewhere, the controller provides the Article 14 notice: controller and DPO details; purposes and basis; data categories; recipients; transfer details; retention; legitimate interests; rights; complaint route; data source and whether public; and meaningful automated-decision logic, significance, and consequences.",
    evidenceHints: ["obtained from", "indirect collection", "source of the personal data", "categories of personal data", "privacy notice", "article 14", "third party source"],
    proofStandard:
      "Proven only where indirectly obtained data is in scope AND notice content covers applicable Art 14(1)-(2) particulars, including source and data categories. A direct-collection-only notice does not satisfy Art 14. A bare 'we may obtain data from third parties' statement without the notice particulars is insufficient. When only direct collection is described, absence alone leaves applicability unknown; N/A requires affirmative scope evidence excluding this rule.",
    proofElements: [
  {
    "id": "primary",
    "description": "Indirect-collection privacy information (Art 14(1)-(2))",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art14.3-5": {
    hypothesis:
      "The Article 14 notice is given within a reasonable period and no later than one month, at first communication, or before first disclosure, whichever applies; new-purpose notice is given before further processing; an exception applies only where its exact conditions are met, and where notice is impossible or disproportionate under Article 14(5)(b), appropriate protective measures include making the information publicly available.",
    evidenceHints: ["within one month", "first communication", "before disclosure", "reasonable period", "disproportionate effort", "publicly available", "article 14(5)"],
    proofStandard:
      "Proven only by text addressing Art 14 timing (one month / first communication / before disclosure) and limiting exceptions to exact Art 14(5) conditions with protective measures where 14(5)(b) is claimed. Silence on timing where indirect collection is described is a gap. A blanket 'notice may be omitted' without matching an Art 14(5) condition contradicts the rule.",
    proofElements: [
  {
    "id": "primary",
    "description": "Indirect-data notice timing and exceptions (Art 14(3)-(5))",
    "required": true,
    "kind": "mandatory"
  }
],
  },

  // --- gdpr.governance.dpo_codes_and_processor_extras (1:1) ---
  "gdpr.art29": {
    hypothesis:
      "A processor and any person acting under controller or processor authority who has access to personal data may process it only on controller instructions unless applicable law requires otherwise.",
    evidenceHints: ["only on instructions", "under the authority", "authorised persons", "controller instructions", "article 29", "unless required by law"],
    proofStandard:
      "Proven only by text obligating the processor and persons under its authority to process solely on controller instructions (unless law requires otherwise). Confidentiality alone without instructions-only processing is partial. A free right for personnel to process for their own purposes contradicts Art 29.",
    proofElements: [
  {
    "id": "primary",
    "description": "Processing under authority (Art 29)",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art37": {
    hypothesis:
      "A DPO is designated where private-sector core activities require regular and systematic large-scale monitoring or large-scale Article 9/10 processing; a group may share an accessible DPO; appointment may be staff or service contract reflecting professional expertise, and contact details are published.",
    evidenceHints: ["data protection officer", "DPO", "designate", "large-scale", "systematic monitoring", "professional qualities", "contact details"],
    proofStandard:
      "Proven only where an Art 37(1)(b)-(c) trigger is present AND text designates a DPO with expertise and published contact details (staff or service contract; group-shared DPO allowed if accessible). A bare optional 'may appoint a DPO' where large-scale monitoring or Art 9/10 processing is described is a gap. When no designation trigger is described, absence alone leaves applicability unknown; N/A requires affirmative scope evidence excluding this rule. Public-authority triggers and SA notification are outside this particular.",
    proofElements: [
  {
    "id": "primary",
    "description": "Private-sector DPO designation (Art 37)",
    "required": true,
    "kind": "mandatory"
  }
],
  },
  "gdpr.art38": {
    hypothesis:
      "The DPO is involved properly and in a timely manner; provided resources, access, and continuing expertise; protected from instructions and retaliation for DPO work; reachable by data subjects; bound by secrecy; and free from conflicts arising from other duties.",
    evidenceHints: ["involve the DPO", "independence", "no instructions", "dismissal", "resources", "conflict of interest", "secrecy", "directly accessible"],
    proofStandard:
      "Proven where a DPO is designated and text guarantees DPO independence, resources, and absence of conflict of interest.",
    proofElements: [
  {
    "id": "dpo_involvement_and_resources",
    "description": "The DPO is involved in all personal data protection issues in a timely manner and provided necessary resources.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where a DPO is appointed.",
    "proofGuidance": "Requirement to involve the DPO in data protection matters and furnish adequate resources.",
    "nonProofTraps": ["DPO designation without access to resources or decision-making."],
    "remediationGuidance": "Guarantee timely DPO involvement and adequate operational resources."
  },
  {
    "id": "dpo_independence_and_no_conflict",
    "description": "The DPO receives no instructions regarding task exercise, is protected from dismissal for performing DPO duties, and avoids conflicting duties.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where a DPO is appointed.",
    "proofGuidance": "Contractual guarantee of DPO independence and absence of conflict of interest.",
    "nonProofTraps": ["Assigning DPO role to IT/CISO/business head with inherent processing conflicts."],
    "remediationGuidance": "Ensure the DPO operates independently without conflict of interest."
  }
],
  },
  "gdpr.art39.1.a-c": {
    hypothesis:
      "The DPO at minimum informs and advises the organisation and staff, monitors GDPR and policy compliance including assignments, awareness, training and audits, and advises on and monitors DPIAs, performing tasks with regard to processing risk.",
    evidenceHints: ["inform and advise", "monitor compliance", "training", "awareness", "DPIA", "data protection impact assessment", "DPO tasks"],
    proofStandard:
      "Proven where a DPO is designated and text specifies internal advisory, compliance monitoring, and DPIA tasks.",
    proofElements: [
  {
    "id": "dpo_advisory_and_monitoring_tasks",
    "description": "The DPO informs and advises the controller/processor and employees, and monitors GDPR compliance.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where a DPO is appointed.",
    "proofGuidance": "Delineation of DPO advisory, awareness, training, and compliance monitoring tasks.",
    "nonProofTraps": ["Bare title 'DPO' with no defined monitoring or advisory responsibilities."],
    "remediationGuidance": "Define DPO tasks covering advice, awareness, training, and compliance monitoring."
  },
  {
    "id": "dpo_dpia_advice",
    "description": "The DPO provides advice where requested as regards data protection impact assessments and monitors DPIA performance.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where a DPO is appointed and DPIAs are conducted.",
    "proofGuidance": "DPO advisory role regarding DPIA conduct and monitoring.",
    "nonProofTraps": ["Conducting DPIAs while explicitly excluding DPO consultation."],
    "remediationGuidance": "Include DPO advice and monitoring in DPIA procedures."
  }
],
  },
  "gdpr.art40.3": {
    hypothesis:
      "A controller or processor not otherwise subject to GDPR that relies on an approved code of conduct to provide Article 46 transfer safeguards makes binding, enforceable commitments to apply the code and protect data-subject rights.",
    evidenceHints: ["code of conduct", "approved code", "binding and enforceable commitments", "article 40(3)", "article 46", "transfer safeguards"],
    proofStandard:
      "Proven where an approved code of conduct is used as an Article 46 transfer safeguard and binding commitments are made.",
    proofElements: [
  {
    "id": "code_of_conduct_commitment",
    "description": "The non-EU entity makes binding, enforceable commitments to apply an approved Article 40 code of conduct as a transfer safeguard.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where an approved Article 40 code of conduct is relied upon for cross-border data transfers.",
    "proofGuidance": "Binding contractual or legal commitment to abide by an approved code of conduct.",
    "nonProofTraps": ["Referencing an unapproved or voluntary code with no binding transfer commitment."],
    "remediationGuidance": "Enter into binding commitments to apply an approved Article 40 code of conduct."
  }
],
  },
  "gdpr.art42.2": {
    hypothesis:
      "A controller or processor not otherwise subject to GDPR that relies on certification to provide Article 46 transfer safeguards undertakes binding, enforceable commitments to apply the certification and protect data-subject rights.",
    evidenceHints: ["certification", "certified", "binding and enforceable commitments", "article 42(2)", "article 46", "transfer safeguards"],
    proofStandard:
      "Proven where an approved certification mechanism is used as an Article 46 transfer safeguard with binding commitments.",
    proofElements: [
  {
    "id": "certification_commitment",
    "description": "The non-EU entity makes binding, enforceable commitments to apply an approved Article 42 certification mechanism.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where an approved Article 42 certification is relied upon for cross-border data transfers.",
    "proofGuidance": "Binding contractual commitment to apply an approved certification mechanism.",
    "nonProofTraps": ["Displaying an unapproved commercial seal or ISO certificate without Article 42 binding commitments."],
    "remediationGuidance": "Make binding commitments to apply an approved Article 42 certification mechanism."
  }
],
  },

  // --- gdpr.chapter5.transfers (1:1) ---
  "gdpr.art44": {
    hypothesis:
      "A controller or processor transfers personal data to a third country or international organisation, including onward transfers, only where Chapter V conditions are met and the GDPR level of protection is not undermined.",
    evidenceHints: ["transfer", "third country", "international organisation", "onward transfer", "chapter V", "level of protection", "outside the EEA"],
    proofStandard:
      "Proven by text requiring all third-country and onward transfers to comply with Chapter V conditions so GDPR protection is not undermined.",
    proofElements: [
  {
    "id": "chapter_v_transfer_condition",
    "description": "Cross-border personal data transfers occur only in compliance with Chapter V conditions.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where personal data is transferred across borders outside the EEA/UK.",
    "proofGuidance": "General condition requiring Chapter V transfer mechanisms for cross-border processing.",
    "nonProofTraps": ["Unrestricted global data transfer right with no Chapter V compliance condition."],
    "remediationGuidance": "Condition all cross-border data transfers on compliance with Chapter V requirements."
  },
  {
    "id": "onward_transfer_protection",
    "description": "Onward transfers to third countries or international organisations maintain the same level of protection.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where cross-border data transfers occur.",
    "proofGuidance": "Clause extending Chapter V protection standards to onward data transfers.",
    "nonProofTraps": ["Allowing recipient to re-transfer data to unverified fourth parties."],
    "remediationGuidance": "Require onward transfers to adhere to Chapter V safeguards."
  }
],
  },
  "gdpr.art45.1": {
    hypothesis:
      "A transfer to a third country or international organisation relies on an adequacy decision only where the destination is covered by a valid Commission adequacy decision for the transfer in question.",
    evidenceHints: ["adequacy decision", "adequate level of protection", "commission decision", "adequate country", "article 45"],
    proofStandard:
      "Proven where cross-border transfers rely on a valid European Commission adequacy decision for the destination.",
    proofElements: [
  {
    "id": "valid_adequacy_decision",
    "description": "Transfers relying on Article 45 are made to a country, territory, or sector covered by a valid Commission adequacy decision.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where transfers rely on Article 45 adequacy decisions.",
    "proofGuidance": "Citation of an applicable and valid Commission adequacy decision.",
    "nonProofTraps": ["Claiming 'adequacy' for a non-adequate jurisdiction."],
    "remediationGuidance": "Verify that the destination country or sector is covered by a valid adequacy decision."
  }
],
  },
  "gdpr.art46": {
    hypothesis:
      "Absent an applicable adequacy decision, transfers occur only with appropriate safeguards, enforceable data-subject rights, and effective legal remedies — via a verified Article 46 mechanism such as a binding public instrument, binding corporate rules, standard clauses, approved code with binding commitments, certification with binding commitments, or an authorised contractual/administrative arrangement.",
    evidenceHints: ["appropriate safeguards", "standard contractual clauses", "SCCs", "binding corporate rules", "article 46", "enforceable rights", "effective legal remedies"],
    proofStandard:
      "Proven where transfers to non-adequate countries implement an Article 46 safeguard mechanism with enforceable rights and remedies.",
    proofElements: [
  {
    "id": "article46_safeguard_mechanism",
    "description": "Transfers without adequacy implement an Article 46 mechanism (SCCs, BCRs, approved code, or certification).",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where personal data is transferred to a third country lacking an adequacy decision.",
    "proofGuidance": "Execution or incorporation of standard contractual clauses (SCCs) or other Article 46 safeguards.",
    "nonProofTraps": ["Promise to use safeguards 'in the future' without attaching or incorporating a valid mechanism."],
    "remediationGuidance": "Incorporate Standard Contractual Clauses (SCCs) or another valid Article 46 transfer mechanism."
  },
  {
    "id": "enforceable_rights_and_remedies",
    "description": "The Article 46 transfer mechanism provides enforceable data subject rights and effective legal remedies.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where Article 46 transfer mechanisms are used.",
    "proofGuidance": "Confirmation that third-party beneficiary rights and effective remedies are preserved.",
    "nonProofTraps": ["Contract terms that disclaim or exclude data subjects' third-party rights under SCCs."],
    "remediationGuidance": "Preserve data subjects' third-party beneficiary rights and legal remedies under the transfer mechanism."
  }
],
  },
  "gdpr.art47": {
    hypothesis:
      "Binding corporate rules used as an Article 46 safeguard are legally binding on and enforceable against every relevant group member and employee, confer enforceable data-subject rights, and contain the mandatory Article 47(2) programme elements including structure, transfer details, principles, security, onward transfers, subject rights, EU-entity liability, complaints, audits, and authority cooperation.",
    evidenceHints: ["binding corporate rules", "BCRs", "group of undertakings", "legally binding", "article 47", "enforceable rights"],
    proofStandard:
      "Proven where Binding Corporate Rules are used for intra-group transfers and meet Article 47 structure and bindingness requirements.",
    proofElements: [
  {
    "id": "bcr_bindingness_and_scope",
    "description": "Binding Corporate Rules are legally binding and enforceable on all group entities and employees.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where Binding Corporate Rules (BCRs) are relied upon for intra-group transfers.",
    "proofGuidance": "Proof of legally binding BCR policies covering all group members.",
    "nonProofTraps": ["Non-binding group guidelines or unapproved internal policies."],
    "remediationGuidance": "Ensure Binding Corporate Rules are legally binding across all group entities."
  },
  {
    "id": "bcr_content_and_rights",
    "description": "BCRs contain mandatory Article 47(2) particulars including data subject rights, EU entity liability, and complaint mechanisms.",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where BCRs are used.",
    "proofGuidance": "Inclusion of mandatory Article 47(2) clauses in BCR documentation.",
    "nonProofTraps": ["BCRs missing EU-entity liability or complaint handling rules."],
    "remediationGuidance": "Include all mandatory Article 47(2) elements in the BCR documentation."
  }
],
  },
  "gdpr.art48": {
    hypothesis:
      "A non-EU court or administrative disclosure order is enforceable as a transfer basis only when grounded in an applicable international agreement, without prejudice to another valid Chapter V transfer ground.",
    evidenceHints: ["foreign court", "administrative authority", "disclosure order", "international agreement", "mutual legal assistance", "article 48", "government access"],
    proofStandard:
      "Proven by text stating that foreign court or administrative disclosure demands are recognized only under international agreements or valid Chapter V transfer grounds.",
    proofElements: [
  {
    "id": "foreign_order_transfer_limit",
    "description": "Non-EU court or administrative disclosure orders trigger transfers only pursuant to international agreements (MLATs) or valid Chapter V grounds.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Restriction against complying with foreign disclosure orders unless supported by an MLAT or Chapter V ground.",
    "nonProofTraps": ["Unconditional promise to comply with any foreign government subpoena or order."],
    "remediationGuidance": "Condition compliance with foreign disclosure requests on an international agreement or Chapter V ground."
  }
],
  },
  "gdpr.art49": {
    hypothesis:
      "An Article 49 derogation is used only when its exact conditions are met — including explicit informed consent, contract necessity, legal claims, vital interests, or limited public-register access — and the narrow compelling-legitimate-interest route requires a non-repetitive limited transfer, documented circumstances and risk assessment, suitable safeguards, and required data-subject notice.",
    evidenceHints: ["derogation", "explicit consent", "necessary for the performance of a contract", "legal claims", "vital interests", "compelling legitimate interests", "article 49", "occasional"],
    proofStandard:
      "Proven where specific, occasional transfer derogations under Article 49 are invoked with matching statutory conditions.",
    proofElements: [
  {
    "id": "derogation_condition_match",
    "description": "Transfers relying on Article 49 strictly satisfy specific derogation conditions (explicit consent, contract necessity, legal claims).",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where transfers rely on Article 49 derogations in the absence of an adequacy decision or Article 46 safeguards.",
    "proofGuidance": "Invocation of a specific Article 49 derogation ground.",
    "nonProofTraps": ["Systematic or large-scale transfers relying on 'contract necessity' derogation."],
    "remediationGuidance": "Restrict reliance on Article 49 derogations strictly to occasional, non-repetitive transfer scenarios."
  }
],
  },

  // --- gdpr.remedies.and_safeguards (1:1) ---
  "gdpr.art77.1": {
    hypothesis:
      "A data subject has the right to lodge a complaint with a supervisory authority, in particular in the Member State of habitual residence, place of work, or place of the alleged infringement.",
    evidenceHints: ["lodge a complaint", "supervisory authority", "right to complain", "data protection authority", "article 77"],
    proofStandard:
      "Proven by text preserving or disclosing the data subject's right to lodge a complaint with a supervisory authority.",
    proofElements: [
  {
    "id": "dpa_complaint_right",
    "description": "The data subject has the right to lodge a complaint with a supervisory authority.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Preservation or explicit disclosure of the right to complain to a data protection authority.",
    "nonProofTraps": ["Mandatory arbitration or pre-dispute clause purporting to bar DPA complaints."],
    "remediationGuidance": "Explicitly state the data subject's right to lodge a complaint with a supervisory authority."
  }
],
  },
  "gdpr.art79": {
    hypothesis:
      "A data subject has a right to an effective judicial remedy where they consider that controller or processor processing infringes GDPR, without prejudice to other remedies.",
    evidenceHints: ["judicial remedy", "court", "effective remedy", "article 79", "bring proceedings"],
    proofStandard:
      "Proven by text preserving the data subject's right to an effective judicial remedy against controllers or processors.",
    proofElements: [
  {
    "id": "court_remedy_preservation",
    "description": "Data subjects retain the right to an effective judicial remedy in court for GDPR infringements.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Preservation of court litigation rights for GDPR violations.",
    "nonProofTraps": ["Total liability or court remedy waiver imposed on data subjects."],
    "remediationGuidance": "Preserve the data subject's right to seek judicial remedies in court."
  }
],
  },
  "gdpr.art80.1": {
    hypothesis:
      "A data subject may mandate a qualifying not-for-profit body active in data protection to exercise applicable GDPR remedies and compensation rights on the individual's behalf, subject to Member State law for compensation representation.",
    evidenceHints: ["not-for-profit", "mandate", "represent", "on behalf of", "article 80", "representative body"],
    proofStandard:
      "Proven by text recognizing or not prohibiting the data subject's right to mandate a qualifying not-for-profit body to represent them.",
    proofElements: [
  {
    "id": "representative_body_mandate",
    "description": "Data subjects may mandate a qualifying not-for-profit body to lodge complaints or exercise rights on their behalf.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Preservation of the right to mandate non-profit representative bodies.",
    "nonProofTraps": ["Clause banning class action or representative body claims in data protection matters."],
    "remediationGuidance": "Do not restrict data subjects from mandating qualifying non-profit bodies to represent them."
  }
],
  },
  "gdpr.art82": {
    hypothesis:
      "A person suffering material or non-material damage from a GDPR infringement has a right to compensation; controllers are liable for infringing processing; processors are liable where they breach processor-specific duties or lawful controller instructions; exemption requires proof of no responsibility; and multiple responsible parties are jointly and severally liable subject to contribution rights.",
    evidenceHints: ["compensation", "liable", "liability", "material or non-material damage", "joint and several", "article 82", "indemnity"],
    proofStandard:
      "Proven by text preserving data subject compensation rights for material or non-material damage arising from GDPR breaches.",
    proofElements: [
  {
    "id": "compensation_right_preservation",
    "description": "Any person who suffers material or non-material damage as a result of an infringement has a right to receive compensation.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Preservation of statutory compensation rights for material/non-material damage.",
    "nonProofTraps": ["Excluding all non-material damage or capping statutory data protection compensation."],
    "remediationGuidance": "Preserve statutory compensation rights for material and non-material damage."
  },
  {
    "id": "controller_processor_liability_allocation",
    "description": "Controllers and processors are liable for damages in accordance with Article 82 rules.",
    "required": true,
    "kind": "mandatory",
    "proofGuidance": "Allocation of liability consistent with Article 82 (processor liable for instruction/processor-duty breaches).",
    "nonProofTraps": ["Processor disclaiming all liability for data breaches caused by its own defaults."],
    "remediationGuidance": "Align liability terms with Article 82 controller and processor responsibilities."
  }
],
  },
  "gdpr.art89.1": {
    hypothesis:
      "Public-interest archiving, scientific or historical research, and statistical processing use safeguards protecting data-subject rights, including data minimisation and pseudonymisation where purposes can still be fulfilled, and prefer non-identifying data where the purposes can be fulfilled that way.",
    evidenceHints: ["research", "statistics", "archiving", "scientific", "historical", "pseudonymisation", "data minimisation", "article 89", "safeguards"],
    proofStandard:
      "Proven where research, statistical, or archiving processing is conducted with technical/organisational safeguards (pseudonymisation, minimisation).",
    proofElements: [
  {
    "id": "research_stat_safeguards",
    "description": "Research, historical, or statistical processing is subject to technical and organisational safeguards (data minimisation, pseudonymisation).",
    "required": true,
    "kind": "conditional",
    "applicabilityGuidance": "Applies where personal data is processed for public interest archiving, scientific/historical research, or statistical purposes.",
    "proofGuidance": "Commitment to pseudonymisation and minimisation safeguards for research/statistical processing.",
    "nonProofTraps": ["Broad research licence with no minimisation or pseudonymisation requirements."],
    "remediationGuidance": "Implement pseudonymisation and minimisation safeguards for research or statistical processing."
  }
],
  },
};
