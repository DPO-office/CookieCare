import type {
  AnalysisSkillConfig,
  RegimeCheckType,
  SkillRegimeRule,
} from "../../../types.js";
import { buildDataProtectionRightsMatrix } from "../_family-template.js";

const GDPR_RIGHTS_MATRIX = buildDataProtectionRightsMatrix("gdpr", [
  { rowId: "gdpr.right.access", localArticleOrSection: "15", label: "Access and copy" },
  {
    rowId: "gdpr.right.rectification",
    localArticleOrSection: "16",
    label: "Rectification and completion",
  },
  {
    rowId: "gdpr.right.erasure",
    localArticleOrSection: "17",
    label: "Erasure (right to be forgotten)",
  },
  {
    rowId: "gdpr.right.restriction",
    localArticleOrSection: "18",
    label: "Restriction of processing",
  },
  {
    rowId: "gdpr.right.notification",
    localArticleOrSection: "19",
    label: "Recipient notification",
  },
  {
    rowId: "gdpr.right.portability",
    localArticleOrSection: "20",
    label: "Data portability",
  },
  {
    rowId: "gdpr.right.object",
    localArticleOrSection: "21",
    label: "Objection, including direct marketing",
  },
  {
    rowId: "gdpr.right.automated_decisions",
    localArticleOrSection: "22",
    label: "Automated individual decision-making",
  },
]);

const DSR_RISK_IDS = [
  "dsr_assistance_not_operational",
  "dsr_no_response_timeframe",
  "erasure_termination_only_gap",
  "portability_format_unaddressed",
  "automated_decision_gap",
  "recipient_notification_gap",
  "assistance_cost_or_consent_gate_risk",
  "cost_allocation_silent",
];

const PROCESSOR_RULE_IDS = [
  "gdpr.art28.1",
  "gdpr.art28.2",
  "gdpr.art28.3.chapeau",
  "gdpr.art28.3.a",
  "gdpr.art28.3.b",
  "gdpr.art28.3.c",
  "gdpr.art28.3.d",
  "gdpr.art28.3.e",
  "gdpr.art28.3.f",
  "gdpr.art28.3.g",
  "gdpr.art28.3.h",
  "gdpr.art28.4",
  "gdpr.art28.9",
  "gdpr.art28.10",
  "gdpr.art29",
];

function gdprRule(
  ruleId: string,
  label: string,
  ruleText: string,
  appliesToClauseTypes: string[],
  checkType: RegimeCheckType = "judgment",
  legalHook?: string
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType,
    findingCategory: findingCategoryForRule(ruleId, label),
    ruleScope: documentLevelRuleIds.has(ruleId) ? "per_document" : "per_clause",
    appliesToClauseTypes,
    ...(legalHook ? { legalHook } : {}),
  };
}

const documentLevelRuleIds = new Set([
  "gdpr.art5.1",
  "gdpr.art5.2",
  "gdpr.art6.4",
  "gdpr.art24",
  // This obligation is assessed across the assistance mechanism as a whole.
  // Per-clause evaluation produces duplicate and contradictory user findings.
  "gdpr.art28.3.e",
]);

/** Prefer authored skill riskCategories when they already name the gap. */
const explicitFindingCategories: Record<string, string> = {
  "gdpr.art5.1": "principles_or_accountability_gap",
  "gdpr.art5.2": "principles_or_accountability_gap",
  "gdpr.art6.4": "lawful_basis_or_purpose_gap",
  "gdpr.art24": "principles_or_accountability_gap",
  "gdpr.art12.3": "dsr_no_response_timeframe",
  "gdpr.art15": "gdpr.art15.access_gap",
  "gdpr.art16": "gdpr.art16.rectification_gap",
  "gdpr.art17": "gdpr.art17.erasure_gap",
  "gdpr.art18": "gdpr.art18.restriction_gap",
  "gdpr.art19": "recipient_notification_gap",
  "gdpr.art20": "portability_format_unaddressed",
  "gdpr.art21": "gdpr.art21.objection_gap",
  "gdpr.art22": "automated_decision_gap",
  "gdpr.art28.3.e": "dsr_assistance_not_operational",
};

function findingCategoryForRule(ruleId: string, label: string): string {
  const explicit = explicitFindingCategories[ruleId];
  if (explicit) return explicit;
  const labelSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${ruleId}.${labelSlug || "compliance"}_gap`;
}

const GDPR_RULES: SkillRegimeRule[] = [
  gdprRule(
    "gdpr.art5.1",
    "Processing principles",
    "Personal data must be processed lawfully, fairly and transparently; collected for specified, explicit and legitimate purposes; adequate, relevant and limited to what is necessary; accurate and kept up to date; retained no longer than necessary; and secured against unauthorised or unlawful processing and accidental loss, destruction or damage.",
    ["data_protection", "lawful_basis", "retention_and_deletion", "information_security"],
    "judgment",
    "EU GDPR Art 5(1). The supplied UK amendment instrument does not alter these operational principles."
  ),
  gdprRule(
    "gdpr.art5.2",
    "Controller accountability",
    "The controller is responsible for compliance with the Article 5(1) principles and must be able to demonstrate that compliance.",
    ["data_protection", "controller_accountability"],
    "judgment",
    "EU GDPR Art 5(2)."
  ),
  gdprRule(
    "gdpr.art6.1",
    "Lawful basis for processing",
    "A controller must identify and satisfy at least one Article 6(1) lawful basis for each processing purpose: consent, contract necessity, legal obligation, vital interests, public task, or legitimate interests. Legitimate interests requires necessity and a balancing assessment, with particular care where the data subject is a child.",
    ["lawful_basis", "data_protection"],
    "judgment",
    "EU GDPR Art 6(1). Public-task and legal-obligation bases depend on applicable law."
  ),
  gdprRule(
    "gdpr.art6.4",
    "Compatible further processing",
    "Before further processing for a new purpose not based on consent or law, the controller must assess compatibility by considering the link between purposes, collection context and relationship, data nature, possible consequences, and safeguards such as encryption or pseudonymisation.",
    ["lawful_basis", "data_protection", "privacy_notice"],
    "judgment",
    "EU GDPR Art 6(4)."
  ),
  gdprRule(
    "gdpr.art7.1",
    "Proof of consent",
    "Where processing relies on consent, the controller must be able to demonstrate that the data subject consented.",
    ["consent_management", "lawful_basis"],
    "judgment",
    "EU GDPR Art 7(1)."
  ),
  gdprRule(
    "gdpr.art7.2",
    "Clear and distinguishable consent request",
    "A written consent request presented with other matters must be clearly distinguishable, intelligible, easily accessible, and written in clear and plain language; non-compliant parts are not binding.",
    ["consent_management", "privacy_notice"],
    "judgment",
    "EU GDPR Art 7(2)."
  ),
  gdprRule(
    "gdpr.art7.3",
    "Withdrawal of consent",
    "The data subject must be informed before consenting that consent may be withdrawn at any time, without affecting prior lawful processing, and withdrawal must be as easy as giving consent.",
    ["consent_management", "data_subject_request_handling"],
    "judgment",
    "EU GDPR Art 7(3)."
  ),
  gdprRule(
    "gdpr.art7.4",
    "Freely given consent and conditionality",
    "When assessing whether consent is freely given, take utmost account of whether a contract or service is made conditional on consent to processing that is unnecessary for that contract.",
    ["consent_management", "lawful_basis"],
    "judgment",
    "EU GDPR Art 7(4)."
  ),
  gdprRule(
    "gdpr.art8.1-2",
    "Children's consent for information-society services",
    "For an information-society service offered directly to a child and relying on consent, verify the applicable national age threshold. Below that threshold, obtain or authorise consent through the holder of parental responsibility and make reasonable efforts, using available technology, to verify that authorisation.",
    ["consent_management", "privacy_notice"],
    "judgment",
    "EU GDPR Art 8(1)-(2). EU Member States may set the threshold between 13 and 16; do not assume one age without the applicable jurisdiction."
  ),
  gdprRule(
    "gdpr.art9.1-3",
    "Special-category data",
    "Processing revealing racial or ethnic origin, political opinions, religion or beliefs, trade-union membership, genetic or biometric identification data, health data, or sex-life or sexual-orientation data is prohibited unless a specific Article 9(2) condition applies. Health processing under Article 9(2)(h) also requires professional secrecy or an equivalent duty.",
    ["special_category_data", "lawful_basis", "confidentiality"],
    "judgment",
    "EU GDPR Art 9(1)-(3). UK S.I. 2023/1417 removes obsolete EU-rights wording from UK Art 9(2)(g) and (j) only; it does not create a new private-sector exception."
  ),
  gdprRule(
    "gdpr.art10",
    "Criminal conviction and offence data",
    "Criminal-conviction, offence, and related security-measure data may be processed on an Article 6 basis only under official control or where Union or Member State law authorises processing with appropriate safeguards; a comprehensive register may be kept only under official control.",
    ["criminal_offence_data", "lawful_basis", "information_security"],
    "judgment",
    "EU GDPR Art 10."
  ),
  gdprRule(
    "gdpr.art11.1",
    "Non-identification where purposes allow",
    "A controller need not maintain or acquire identifying information solely to comply with GDPR where processing purposes do not require identification of a data subject.",
    ["data_protection", "privacy_by_design", "retention_and_deletion"],
    "judgment",
    "EU GDPR Art 11(1)."
  ),
  gdprRule(
    "gdpr.art11.2",
    "Rights where identification is unnecessary",
    "If the controller can demonstrate it cannot identify the data subject, it must inform the individual where possible. Articles 15-20 do not apply unless the individual supplies additional information enabling identification; the controller must not use Article 11 to reject a request once adequate identifying information is provided.",
    ["data_subject_request_handling", "data_protection"],
    "judgment",
    "EU GDPR Art 11(2)."
  ),
  gdprRule(
    "gdpr.art12.1-2",
    "Transparent communications and facilitation of rights",
    "Provide Articles 13-14 information and Articles 15-22 and 34 communications concisely, transparently, intelligibly, accessibly, and in clear plain language, especially for children. Facilitate rights requests and do not refuse solely because identity cannot be established unless that inability is demonstrated.",
    ["privacy_notice", "data_subject_request_handling"],
    "judgment",
    "EU GDPR Art 12(1)-(2)."
  ),
  gdprRule(
    "gdpr.art12.3",
    "One-month response timeframe and extension notice",
    "Provide action information without undue delay and within one month after receiving a request. A complexity/volume extension of up to two further months requires notice within the first month stating the delay and reasons; respond electronically where appropriate when the request was electronic.",
    ["data_subject_request_handling", "processor_assistance_obligation", "data_protection"],
    "pattern_then_llm_judgment",
    "EU GDPR Art 12(3). This is the EU rule; the supplied UK PDF is not a consolidated UK GDPR and cannot substantiate current UK deadline amendments."
  ),
  gdprRule(
    "gdpr.art12.4",
    "Reasoned refusal notice",
    "If the controller does not act on a rights request, it must inform the data subject without delay and within one month of the reasons and of the right to complain and seek a judicial remedy.",
    ["data_subject_request_handling"],
    "judgment",
    "EU GDPR Art 12(4). References to supervisory-authority procedure are not evaluated by this skill."
  ),
  gdprRule(
    "gdpr.art12.7",
    "Standardised privacy icons",
    "Where standardised icons are used in an electronic privacy notice, ensure they are presented in an easily visible, intelligible, and legibly coloured form and remain machine-readable electronically.",
    ["privacy_notice"],
    "judgment",
    "EU GDPR Art 12(7)."
  ),
  gdprRule(
    "gdpr.art12.5-6",
    "Free requests, limited fee/refusal, and identity checks",
    "Rights information and action must ordinarily be free. A reasonable administrative-cost fee or refusal is allowed only when the controller proves a request is manifestly unfounded or excessive, particularly because it is repetitive. Additional identity information may be requested only where reasonable doubts exist.",
    ["data_subject_request_handling"],
    "judgment",
    "EU GDPR Art 12(5)-(6)."
  ),
  gdprRule(
    "gdpr.art13.1-2",
    "Direct-collection privacy information",
    "At collection, provide the controller and DPO contact details; purposes and lawful basis; legitimate interests where used; recipients; intended third-country transfers and safeguards; retention period or criteria; applicable rights; consent withdrawal; complaint route; whether provision is required and consequences; and meaningful automated-decision information including logic, significance, and envisaged consequences.",
    ["privacy_notice", "automated_decision_disclosure", "international_transfer_mechanism"],
    "judgment",
    "EU GDPR Art 13(1)-(2)."
  ),
  gdprRule(
    "gdpr.art13.3-4",
    "Direct-data new-purpose notice",
    "Before using directly collected data for a new purpose, tell the data subject that purpose and all relevant further information, unless the individual already has the information.",
    ["privacy_notice", "lawful_basis"],
    "judgment",
    "EU GDPR Art 13(3)-(4)."
  ),
  gdprRule(
    "gdpr.art14.1-2",
    "Indirect-collection privacy information",
    "For data obtained elsewhere, provide the Article 14 notice: controller and DPO details; purposes and basis; data categories; recipients; transfer details; retention; legitimate interests; rights; complaint route; data source and whether public; and meaningful automated-decision logic, significance, and consequences.",
    ["privacy_notice", "automated_decision_disclosure", "international_transfer_mechanism"],
    "judgment",
    "EU GDPR Art 14(1)-(2)."
  ),
  gdprRule(
    "gdpr.art14.3-5",
    "Indirect-data notice timing and exceptions",
    "Give the Article 14 notice within a reasonable period and no later than one month, at first communication, or before first disclosure, whichever applies. Give new-purpose notice before further processing. Apply an exception only where its exact conditions are met; where notice is impossible or disproportionate under Article 14(5)(b), use appropriate protective measures including making the information publicly available.",
    ["privacy_notice", "lawful_basis"],
    "judgment",
    "EU GDPR Art 14(3)-(5)."
  ),
  gdprRule(
    "gdpr.art15",
    "Right of access and copy",
    "On request, confirm whether data is processed and provide access plus purposes, categories, recipients, retention, rights, complaint information, source, and meaningful automated-decision logic/significance/consequences. Disclose transfer safeguards where relevant and provide a copy; charge only a reasonable administrative fee for further copies and protect others' rights and freedoms.",
    ["data_subject_request_handling", "data_subject_rights", "automated_decision_disclosure"],
    "judgment",
    "EU GDPR Art 15."
  ),
  gdprRule(
    "gdpr.art16",
    "Right to rectification",
    "Rectify inaccurate personal data without undue delay and permit completion of incomplete data, including by supplementary statement where appropriate.",
    ["data_subject_request_handling", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 16."
  ),
  gdprRule(
    "gdpr.art17",
    "Right to erasure",
    "Erase data without undue delay when an Article 17(1) ground applies, including expired necessity, withdrawn consent without another basis, successful objection, unlawful processing, legal erasure duty, or child-service collection. For public data, take reasonable steps to notify downstream controllers. Apply Article 17(3) exceptions only where necessary and document the applicable exception.",
    ["data_subject_request_handling", "data_subject_rights", "retention_and_deletion"],
    "judgment",
    "EU GDPR Art 17."
  ),
  gdprRule(
    "gdpr.art18",
    "Right to restriction",
    "Restrict processing when accuracy is contested, processing is unlawful but erasure is opposed, the controller no longer needs the data but the individual needs it for legal claims, or an objection is pending. While restricted, process only under an Article 18(2) condition and notify the individual before lifting the restriction.",
    ["data_subject_request_handling", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 18."
  ),
  gdprRule(
    "gdpr.art19",
    "Recipient notification after rights action",
    "Communicate each rectification, erasure, or restriction to every recipient unless impossible or disproportionate, and identify those recipients to the data subject on request.",
    ["data_subject_request_handling", "data_subject_rights", "subprocessor_flow_down"],
    "judgment",
    "EU GDPR Art 19."
  ),
  gdprRule(
    "gdpr.art20",
    "Right to data portability",
    "Where processing is automated and based on consent or contract, provide data supplied by the individual in a structured, commonly used, machine-readable format and permit transmission to another controller, including direct transmission where technically feasible. Do not adversely affect others' rights and do not apply the right to public-task processing.",
    ["data_subject_request_handling", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 20."
  ),
  gdprRule(
    "gdpr.art21",
    "Right to object",
    "For public-task or legitimate-interest processing, stop after objection unless compelling overriding grounds or legal claims are demonstrated. Stop direct-marketing processing, including related profiling, whenever the individual objects. Present this right clearly and separately by first communication and support automated objection for information-society services.",
    ["data_subject_request_handling", "data_subject_rights", "privacy_notice"],
    "judgment",
    "EU GDPR Art 21."
  ),
  gdprRule(
    "gdpr.art22",
    "Automated individual decisions",
    "Do not subject an individual to a solely automated decision producing legal or similarly significant effects unless an Article 22(2) exception applies. Contract-necessity and explicit-consent cases require at least human intervention, an opportunity to express a view, and a contest mechanism. Special-category data requires explicit consent or substantial-public-interest law plus safeguards.",
    ["automated_decision_disclosure", "data_subject_rights", "data_subject_request_handling"],
    "judgment",
    "EU GDPR Art 22. Current UK automated-decision rules cannot be derived from the supplied four-page UK amendment instrument."
  ),
  gdprRule(
    "gdpr.art24",
    "Controller responsibility and policies",
    "Implement and periodically update proportionate technical and organisational measures that reflect processing nature, scope, context, purposes, and risks and can demonstrate GDPR compliance; use appropriate data-protection policies where proportionate.",
    ["controller_accountability", "data_protection"],
    "judgment",
    "EU GDPR Art 24(1)-(2)."
  ),
  gdprRule(
    "gdpr.art25",
    "Data protection by design and by default",
    "At design time and during processing, implement state-of-the-art, cost- and risk-appropriate measures that embed the principles and rights. By default process only data necessary for each purpose, limiting amount, extent, retention, and accessibility, and do not make data accessible to an indefinite number of people without intervention.",
    ["privacy_by_design", "controller_accountability", "data_protection"],
    "judgment",
    "EU GDPR Art 25(1)-(2)."
  ),
  gdprRule(
    "gdpr.art26",
    "Joint-controller arrangement",
    "Joint controllers must transparently allocate GDPR responsibilities, especially rights handling and Articles 13-14 notices, reflect actual roles and relationships, make the arrangement's essence available to individuals, and preserve the individual's ability to exercise rights against each controller.",
    ["joint_controller_arrangement", "data_subject_request_handling", "privacy_notice"],
    "judgment",
    "EU GDPR Art 26."
  ),
  gdprRule(
    "gdpr.art27",
    "EU representative",
    "A non-EU controller or processor within Article 3(2) must designate a written EU representative unless the narrow occasional, low-risk, non-large-scale-special-category exception applies. The representative must be established where relevant individuals are located and mandated as the entity's GDPR contact, without displacing controller or processor liability.",
    ["eu_representative", "controller_accountability"],
    "judgment",
    "EU GDPR Art 27. This rule is EU-specific; the supplied UK PDF does not establish the current UK representative rule."
  ),
  gdprRule(
    "gdpr.art28.1",
    "Processor due diligence",
    "A controller may use only processors providing sufficient guarantees that appropriate technical and organisational measures will protect data-subject rights and meet GDPR requirements.",
    ["processor_terms", "data_protection", "information_security"],
    "judgment",
    "EU GDPR Art 28(1)."
  ),
  gdprRule(
    "gdpr.art28.2",
    "Prior subprocessor authorisation",
    "The processor must obtain the controller's specific or general prior written authorisation before appointing a subprocessor; under general authorisation it must give advance notice of additions or replacements so the controller can object.",
    ["subprocessor_flow_down", "processor_terms"],
    "judgment",
    "EU GDPR Art 28(2)."
  ),
  gdprRule(
    "gdpr.art28.3.chapeau",
    "Mandatory processing agreement particulars",
    "Processing must be governed by a binding contract or legal act in writing that states subject matter, duration, nature, purpose, personal-data types, data-subject categories, and the controller's obligations and rights.",
    ["processor_terms", "data_protection"],
    "mechanical",
    "EU GDPR Art 28(3) and 28(9)."
  ),
  gdprRule(
    "gdpr.art28.3.a",
    "Documented instructions-only processing",
    "The processor must process personal data, including transfers, only on documented controller instructions unless applicable law requires processing; where permitted, it must notify the controller of that legal requirement before processing.",
    ["processor_terms", "data_protection", "international_transfer_mechanism"],
    "judgment",
    "EU GDPR Art 28(3)(a)."
  ),
  gdprRule(
    "gdpr.art28.3.b",
    "Confidentiality of authorised persons",
    "The processor must ensure persons authorised to process personal data are contractually committed to confidentiality or subject to an appropriate statutory confidentiality duty.",
    ["processor_terms", "confidentiality"],
    "judgment",
    "EU GDPR Art 28(3)(b)."
  ),
  gdprRule(
    "gdpr.art28.3.c",
    "Processor security measures",
    "The processor must take all measures required by Article 32, including risk-appropriate security and controls ensuring authorised persons act only on instructions.",
    ["processor_terms", "information_security", "security_dpia_assistance"],
    "judgment",
    "EU GDPR Art 28(3)(c)."
  ),
  gdprRule(
    "gdpr.art28.3.d",
    "Subprocessor conditions and flow-down",
    "The processor must comply with Article 28(2) and (4): obtain required authorisation, impose the same data-protection obligations on each subprocessor by contract, and remain fully liable to the controller for subprocessor performance.",
    ["processor_terms", "subprocessor_flow_down"],
    "judgment",
    "EU GDPR Art 28(3)(d) and 28(4)."
  ),
  gdprRule(
    "gdpr.art28.3.e",
    "Processor assistance with data-subject rights",
    "Taking account of the nature of processing, the processor must assist the controller through appropriate technical and organisational measures, insofar as possible, to fulfil Chapter III data-subject-rights requests.",
    ["data_subject_request_handling", "processor_assistance_obligation", "processor_terms"],
    "judgment",
    "EU GDPR Art 28(3)(e). A general Chapter III commitment can be legally sufficient if it creates an operational assistance duty; naming Articles 15-22 is stronger drafting, not an express statutory requirement."
  ),
  gdprRule(
    "gdpr.art28.3.f",
    "Processor assistance with security, breach, DPIA, and consultation duties",
    "Taking account of processing nature and available information, the processor must assist the controller with applicable Articles 32-36 obligations, including security, breach response, DPIAs, and any legally required prior consultation.",
    ["processor_assistance_obligation", "security_dpia_assistance", "processor_terms"],
    "judgment",
    "EU GDPR Art 28(3)(f). This skill evaluates the private assistance promise, not supervisory-authority procedure."
  ),
  gdprRule(
    "gdpr.art28.3.g",
    "Return or deletion after services",
    "At the controller's choice, the processor must delete or return all personal data after services end, delete existing copies, and retain data only where applicable law requires storage.",
    ["retention_and_deletion", "deletion_on_termination", "processor_terms"],
    "judgment",
    "EU GDPR Art 28(3)(g)."
  ),
  gdprRule(
    "gdpr.art28.3.h",
    "Compliance evidence, audits, and unlawful-instruction warning",
    "The processor must provide all information needed to demonstrate Article 28 compliance, allow and contribute to controller or mandated-auditor audits and inspections, and immediately tell the controller if an instruction infringes GDPR or other applicable data-protection law.",
    ["processor_terms", "audit_and_compliance_evidence"],
    "judgment",
    "EU GDPR Art 28(3)(h)."
  ),
  gdprRule(
    "gdpr.art28.4",
    "Subprocessor equivalent obligations and processor liability",
    "A processor engaging another processor must impose by contract the same data-protection obligations, including sufficient guarantees and appropriate measures, and remains fully liable to the controller for that subprocessor's performance.",
    ["subprocessor_flow_down", "processor_terms"],
    "judgment",
    "EU GDPR Art 28(4)."
  ),
  gdprRule(
    "gdpr.art28.9",
    "Written processor terms",
    "The Article 28 processing contract or legal act must be in writing, including electronic form.",
    ["processor_terms"],
    "mechanical",
    "EU GDPR Art 28(9)."
  ),
  gdprRule(
    "gdpr.art28.10",
    "Processor acting as controller",
    "A processor that determines processing purposes and means contrary to GDPR is treated as a controller for that processing and assumes controller obligations.",
    ["processor_terms", "data_protection"],
    "judgment",
    "EU GDPR Art 28(10)."
  ),
  gdprRule(
    "gdpr.art29",
    "Processing under authority",
    "A processor and any person acting under controller or processor authority who has access to personal data may process it only on controller instructions unless applicable law requires otherwise.",
    ["processor_terms", "data_protection", "confidentiality"],
    "judgment",
    "EU GDPR Art 29."
  ),
  gdprRule(
    "gdpr.art30",
    "Records of processing activities",
    "Controllers and processors must keep written, including electronic, records containing the Article 30 particulars applicable to their role. The under-250-person exemption is unavailable where processing is likely to risk rights, is not occasional, or includes Article 9 or 10 data.",
    ["records_of_processing", "controller_accountability", "processor_terms"],
    "judgment",
    "EU GDPR Art 30(1)-(3) and (5). Obligations to provide records to a supervisory authority are outside this skill's requested scope."
  ),
  gdprRule(
    "gdpr.art33.2",
    "Processor breach notification to controller",
    "After becoming aware of a personal-data breach, the processor must notify the controller without undue delay.",
    ["processor_assistance_obligation", "security_dpia_assistance", "processor_terms"],
    "pattern_then_llm_judgment",
    "EU GDPR Art 33(2). Supervisory-authority notification under Art 33(1) is excluded from this skill."
  ),
  gdprRule(
    "gdpr.art33.5",
    "Breach documentation",
    "The controller must document every personal-data breach with the facts, effects, and remedial action taken, in a form sufficient to verify compliance with Articles 33 and 34.",
    ["controller_accountability", "information_security", "security_dpia_assistance"],
    "judgment",
    "EU GDPR Art 33(5). Supervisory-authority notification content under Art 33(3)-(4) is excluded."
  ),
  gdprRule(
    "gdpr.art32",
    "Security of processing",
    "Controller and processor must implement security appropriate to risk, considering state of the art, cost, context, purposes, and likely impact. Measures may include pseudonymisation/encryption, ongoing confidentiality/integrity/availability/resilience, timely restoration, regular testing, and controls ensuring authorised persons process only on instructions.",
    ["information_security", "security_dpia_assistance", "processor_terms"],
    "judgment",
    "EU GDPR Art 32(1)-(2) and (4)."
  ),
  gdprRule(
    "gdpr.art34",
    "High-risk breach communication to individuals",
    "When a personal-data breach is likely to create high risk, communicate it to affected individuals without undue delay in clear plain language, describing its nature, DPO/contact point, likely consequences, and mitigation. Apply an exception only for effective protection such as encryption, eliminated high risk, or disproportionate effort accompanied by an equally effective public communication.",
    ["data_subject_breach_notice", "information_security", "privacy_notice"],
    "judgment",
    "EU GDPR Art 34(1)-(3). Supervisory-authority directions under Art 34(4) are excluded."
  ),
  gdprRule(
    "gdpr.art36",
    "Prior consultation for unmitigated high risk",
    "Where a DPIA indicates that processing would result in high risk in the absence of measures taken by the controller to mitigate the risk, the controller must consult the supervisory authority before processing and provide the information required to support that consultation.",
    ["data_protection_impact_assessment", "security_dpia_assistance", "controller_accountability"],
    "judgment",
    "EU GDPR Art 36(1) and (3). Supervisory-authority procedure under Art 36(2) and Member-State exemptions under Art 36(4)-(5) are excluded."
  ),
  gdprRule(
    "gdpr.art35",
    "Data protection impact assessment",
    "Before likely-high-risk processing, the controller must perform a DPIA, seek DPO advice where designated, document processing and purposes, assess necessity/proportionality and risks, identify safeguards and compliance evidence, seek data-subject views where appropriate, and review the assessment when risk changes.",
    ["data_protection_impact_assessment", "security_dpia_assistance", "controller_accountability"],
    "judgment",
    "EU GDPR Art 35(1)-(3), (7), (9), and (11). Supervisory-authority lists and public-law exceptions are excluded."
  ),
  gdprRule(
    "gdpr.art37",
    "Private-sector DPO designation",
    "Designate a DPO where private-sector core activities require regular and systematic large-scale monitoring or large-scale Article 9/10 processing. A group may share an accessible DPO; appointment may be staff or service contract, must reflect professional expertise, and contact details must be published.",
    ["data_protection_officer", "controller_accountability", "processor_terms"],
    "judgment",
    "EU GDPR Art 37(1)(b)-(c), (2), and (4)-(7). Public-authority triggers and supervisory-authority notification are excluded."
  ),
  gdprRule(
    "gdpr.art38",
    "DPO position and independence",
    "Involve the DPO properly and timely; provide resources, access, and continuing expertise; prohibit instructions and retaliation for DPO work; enable direct data-subject contact; preserve secrecy; and prevent conflicts from other duties.",
    ["data_protection_officer", "controller_accountability"],
    "judgment",
    "EU GDPR Art 38."
  ),
  gdprRule(
    "gdpr.art39.1.a-c",
    "DPO internal tasks",
    "The DPO must at minimum inform and advise the organisation and staff, monitor GDPR and policy compliance including assignments, awareness, training and audits, and advise on and monitor DPIAs, performing tasks with regard to processing risk.",
    ["data_protection_officer", "data_protection_impact_assessment", "controller_accountability"],
    "judgment",
    "EU GDPR Art 39(1)(a)-(c) and (2). Supervisory-authority cooperation and contact tasks are excluded."
  ),
  gdprRule(
    "gdpr.art40.3",
    "Binding code commitments for transfers",
    "A controller or processor not otherwise subject to GDPR that relies on an approved code of conduct to provide Article 46 transfer safeguards must make binding, enforceable commitments to apply the code and protect data-subject rights.",
    ["international_transfer_mechanism", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 40(3). Code-authoring and monitoring-body machinery in Arts 40(1)-(2) and 41 are excluded."
  ),
  gdprRule(
    "gdpr.art42.2",
    "Binding certification commitments for transfers",
    "A controller or processor not otherwise subject to GDPR that relies on certification to provide Article 46 transfer safeguards must undertake binding, enforceable commitments to apply the certification and protect data-subject rights.",
    ["international_transfer_mechanism", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 42(2). Certification issuance and registry machinery in Arts 42(1) and (3)-(5) and Art 43 are excluded."
  ),
  gdprRule(
    "gdpr.art44",
    "General transfer principle",
    "A controller or processor may transfer personal data to a third country or international organisation, including onward transfers, only where Chapter V conditions are met and the GDPR level of protection is not undermined.",
    ["international_transfer_mechanism", "data_protection"],
    "judgment",
    "EU GDPR Art 44."
  ),
  gdprRule(
    "gdpr.art45.1",
    "Adequacy-based transfers",
    "A transfer to a third country or international organisation may rely on an adequacy decision only where the destination is covered by a valid Commission adequacy decision for the transfer in question.",
    ["international_transfer_mechanism", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 45(1). Commission adequacy assessment and monitoring under Art 45(2)-(9) are excluded."
  ),
  gdprRule(
    "gdpr.art46",
    "Appropriate safeguards for transfers",
    "Absent an applicable adequacy decision, transfer only with appropriate safeguards, enforceable data-subject rights, and effective legal remedies. Verify the claimed Article 46 mechanism, such as a binding public instrument, binding corporate rules, standard clauses, approved code with binding commitments, certification with binding commitments, or an authorised contractual/administrative arrangement.",
    ["international_transfer_mechanism", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 46. This skill evaluates the private transfer safeguard, not supervisory-authority approval procedure."
  ),
  gdprRule(
    "gdpr.art47",
    "Binding corporate rules",
    "Binding corporate rules used as an Article 46 safeguard must be legally binding on and enforceable against every relevant group member and employee, confer enforceable data-subject rights, and contain the mandatory Article 47(2) programme elements including structure, transfer details, principles, security, onward transfers, subject rights, EU-entity liability, complaints, audits, and authority cooperation.",
    ["international_transfer_mechanism", "data_subject_rights", "controller_accountability"],
    "judgment",
    "EU GDPR Art 47(1)-(2). Supervisory-authority approval procedure under Art 47(3) is excluded."
  ),
  gdprRule(
    "gdpr.art48",
    "Foreign disclosure orders",
    "A non-EU court or administrative disclosure order is enforceable as a transfer basis only when grounded in an applicable international agreement, without prejudice to another valid Chapter V transfer ground.",
    ["international_transfer_mechanism", "government_access_request"],
    "judgment",
    "EU GDPR Art 48."
  ),
  gdprRule(
    "gdpr.art49",
    "Transfer derogations and exceptional transfers",
    "Use an Article 49 derogation only when its exact conditions are met, including explicit informed consent, contract necessity, legal claims, vital interests, or limited public-register access. The narrow compelling-legitimate-interest route requires a non-repetitive limited transfer, documented circumstances and risk assessment, suitable safeguards, and required data-subject notice.",
    ["international_transfer_mechanism", "consent_management", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 49(1)-(2) and (6). Public-authority notice requirements and authority-defined limits are excluded."
  ),
  gdprRule(
    "gdpr.art77.1",
    "Right to lodge a complaint",
    "A data subject has the right to lodge a complaint with a supervisory authority, in particular in the Member State of habitual residence, place of work, or place of the alleged infringement.",
    ["data_subject_rights", "judicial_remedies_and_compensation"],
    "judgment",
    "EU GDPR Art 77(1). Supervisory-authority handling duties under Art 77(2) and Art 78 are excluded."
  ),
  gdprRule(
    "gdpr.art79",
    "Judicial remedy against controller or processor",
    "A data subject has a right to an effective judicial remedy where they consider that controller or processor processing infringes GDPR, without prejudice to other remedies.",
    ["judicial_remedies_and_compensation", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 79. The court-forum machinery is not used as a contract-compliance check."
  ),
  gdprRule(
    "gdpr.art80.1",
    "Mandated representative for rights enforcement",
    "A data subject may mandate a qualifying not-for-profit body active in data protection to exercise applicable GDPR remedies and compensation rights on the individual's behalf, subject to Member State law for compensation representation.",
    ["judicial_remedies_and_compensation", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 80(1). Supervisory-authority complaint procedure and the Member State option in Art 80(2) are outside this skill."
  ),
  gdprRule(
    "gdpr.art82",
    "Compensation and controller/processor liability",
    "A person suffering material or non-material damage from a GDPR infringement has a right to compensation. Controllers are liable for infringing processing; processors are liable where they breach processor-specific duties or lawful controller instructions. Exemption requires proof of no responsibility, and multiple responsible parties are jointly and severally liable subject to contribution rights.",
    ["judicial_remedies_and_compensation", "data_subject_rights", "processor_terms"],
    "judgment",
    "EU GDPR Art 82(1)-(5)."
  ),
  gdprRule(
    "gdpr.art89.1",
    "Research, statistics, and archiving safeguards",
    "Public-interest archiving, scientific or historical research, and statistical processing must use safeguards protecting data-subject rights, including data minimisation and pseudonymisation where purposes can still be fulfilled, and should use non-identifying data where the purposes can be fulfilled that way.",
    ["research_and_statistics", "privacy_by_design", "data_subject_rights"],
    "judgment",
    "EU GDPR Art 89(1). National derogations in Art 89(2)-(4) are excluded."
  ),
];

/**
 * EU GDPR operational skill. It deliberately excludes Chapters VI-VII and
 * provisions directed to Member States, supervisory authorities, the EDPB,
 * courts, or EU institutions. The supplied "GDPR UK.pdf" is only S.I.
 * 2023/1417, not the consolidated UK GDPR, so UK-only rules are not asserted.
 */
export const gdprRegimeSkill: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/gdpr",
  axis: "regime",
  family: "data-protection",
  label: "EU GDPR private-entity obligations and data-subject rights",
  version: "2.0.1",
  appliesToDocTypes: ["dpa"],
  triggerPhrases: [
    "gdpr",
    "eu gdpr",
    "general data protection regulation",
    "controller obligations",
    "processor obligations",
    "article 28",
    "data subject",
    "personal data",
    "international transfer",
    "breach notification",
    "data subject rights",
    "articles 15",
    "erasure",
    "portability",
    "privacy notice",
    "lawful basis",
    "consent",
    "special category data",
    "records of processing",
    "data protection impact assessment",
    "data protection officer",
    "security of processing",
  ],
  promptLibraryIds: ["privacy", "privacy-gdpr-dpa", "gdpr"],
  clauseTypes: [
    "data_protection",
    "lawful_basis",
    "consent_management",
    "special_category_data",
    "criminal_offence_data",
    "privacy_notice",
    "data_subject_rights",
    "data_subject_request_handling",
    "retention_and_deletion",
    "information_security",
    "controller_accountability",
    "privacy_by_design",
    "joint_controller_arrangement",
    "eu_representative",
    "processor_terms",
    "processor_assistance_obligation",
    "security_dpia_assistance",
    "deletion_on_termination",
    "subprocessor_flow_down",
    "audit_and_compliance_evidence",
    "records_of_processing",
    "data_subject_breach_notice",
    "data_protection_impact_assessment",
    "data_protection_officer",
    "international_transfer_mechanism",
    "government_access_request",
    "automated_decision_disclosure",
    "judicial_remedies_and_compensation",
    "research_and_statistics",
    "confidentiality",
  ],
  clauseTypeDefinitions: {
    lawful_basis: "The Article 6 basis and purpose assigned to each processing activity.",
    consent_management: "Consent capture, proof, parental authorisation, and withdrawal controls.",
    special_category_data: "Article 9 data categories, processing condition, and secrecy safeguards.",
    criminal_offence_data: "Article 10 criminal-conviction and offence data controls.",
    privacy_notice: "Articles 12-14 transparency information and delivery timing.",
    data_subject_rights: "Substantive rights, conditions, exceptions, and fulfilment controls.",
    data_subject_request_handling:
      "Intake, identity checks, deadlines, decisions, and communications for rights requests.",
    retention_and_deletion: "Retention limits, erasure workflows, and deletion or return requirements.",
    information_security: "Article 32 risk-based technical and organisational security measures.",
    controller_accountability: "Governance measures and evidence demonstrating controller compliance.",
    privacy_by_design: "Data protection by design and necessity-limited default settings.",
    joint_controller_arrangement: "Transparent allocation of joint-controller responsibilities.",
    eu_representative: "Written designation and mandate of an Article 27 EU representative.",
    processor_terms: "Binding Article 28 controller-processor terms and mandatory particulars.",
    processor_assistance_obligation:
      "Processor assistance with rights, security, breach, DPIA, and related controller duties.",
    audit_and_compliance_evidence: "Processor evidence, audit, inspection, and instruction-warning duties.",
    records_of_processing: "Article 30 controller or processor processing records.",
    data_subject_breach_notice: "Article 34 high-risk breach communication to affected individuals.",
    data_protection_impact_assessment: "Article 35 high-risk assessment, safeguards, and review.",
    data_protection_officer: "Private-sector DPO designation, independence, resources, and internal tasks.",
    government_access_request: "Foreign court or administrative disclosure demand and transfer basis.",
    automated_decision_disclosure:
      "Transparency, human review, and contest safeguards for significant automated decisions.",
    judicial_remedies_and_compensation:
      "Data-subject judicial remedy, representation, compensation, and liability rights.",
    research_and_statistics: "Article 89 safeguards for research, statistics, and archiving.",
  },
  clauseRetrieval: {
    processor_terms: {
      headings: [
        "Processing of Personal Data",
        "Data Processing",
        "Processor Obligations",
        "Processing Instructions",
        "Details of Processing",
        "Description of Processing",
      ],
      aliases: [
        "processing terms",
        "processor obligations",
        "processing particulars",
        "processor shall",
        "documented instructions",
      ],
      anchorTerms: [
        "subject matter",
        "duration",
        "nature and purpose",
        "categories of personal data",
        "types of personal data",
        "categories of data subjects",
        "controller's obligations",
      ],
    },
    subprocessor_flow_down: {
      headings: [
        "Subprocessors",
        "Sub-processors",
        "Subcontractors",
        "Appointment of Subprocessors",
      ],
      aliases: [
        "subprocessor",
        "sub-processor",
        "sub processor",
        "subcontractor",
        "downstream processor",
        "prior written authorisation",
        "prior written authorization",
        "right to object",
      ],
      anchorTerms: [
        "prior written",
        "authorisation",
        "authorization",
        "flow-down",
        "flow down",
        "same data protection obligations",
        "right to object",
      ],
    },
    information_security: {
      headings: [
        "Security",
        "Information Security",
        "Technical and Organisational Measures",
        "Technical and Organizational Measures",
        "Security of Processing",
      ],
      aliases: [
        "technical and organisational measures",
        "technical and organizational measures",
        "security measures",
        "encryption",
        "confidentiality integrity availability",
      ],
      anchorTerms: [
        "encryption",
        "pseudonymisation",
        "pseudonymization",
        "resilience",
        "restore",
        "testing",
        "article 32",
      ],
    },
    retention_and_deletion: {
      headings: [
        "Retention",
        "Deletion",
        "Return or Deletion",
        "Return and Deletion",
        "Termination of Processing",
      ],
      aliases: [
        "delete or return",
        "deletion of personal data",
        "return all personal data",
        "return or delete",
        "upon termination",
      ],
      anchorTerms: [
        "delete",
        "return",
        "existing copies",
        "after the end of the provision",
        "retention",
      ],
    },
    deletion_on_termination: {
      headings: [
        "Return or Deletion",
        "Return and Deletion",
        "Deletion on Termination",
        "End of Services",
      ],
      aliases: [
        "delete or return",
        "deletion of personal data",
        "return all personal data",
        "upon termination",
      ],
      anchorTerms: [
        "controller's choice",
        "delete existing copies",
        "end of the provision of services",
      ],
    },
    data_subject_request_handling: {
      headings: [
        "Data Subject Requests",
        "Data Subject Rights",
        "Rights of Data Subjects",
        "Data Subject Access",
      ],
      aliases: [
        "data subject request",
        "data subject rights",
        "assist the controller",
        "fulfilment of the controller",
        "chapter iii",
      ],
      anchorTerms: [
        "access",
        "rectification",
        "erasure",
        "restriction",
        "portability",
        "objection",
        "one month",
        "without undue delay",
      ],
    },
    processor_assistance_obligation: {
      headings: [
        "Assistance",
        "Processor Assistance",
        "Assistance to the Controller",
        "Data Subject Requests",
      ],
      aliases: [
        "assist the controller",
        "assistance",
        "fulfilment of the controller",
        "processor shall assist",
      ],
      anchorTerms: [
        "technical and organisational measures",
        "insofar as possible",
        "data-subject",
        "articles 32-36",
        "breach",
        "dpia",
      ],
    },
    audit_and_compliance_evidence: {
      headings: [
        "Audit",
        "Audits",
        "Audit Rights",
        "Compliance Evidence",
        "Demonstration of Compliance",
      ],
      aliases: [
        "make available all information",
        "audit",
        "inspection",
        "demonstrate compliance",
        "mandated auditor",
      ],
      anchorTerms: [
        "inspections",
        "contribute to audits",
        "infringes",
        "unlawful instruction",
      ],
    },
    data_protection: {
      headings: [
        "Data Protection",
        "Personal Data",
        "Processing of Personal Data",
      ],
      aliases: ["personal data", "processing", "data protection"],
      anchorTerms: ["controller", "processor", "personal data"],
    },
  },
  expectedClauses: [
    {
      clauseType: "processor_terms",
      severityIfMissing: "high",
      findingCategory: "processor_terms_incomplete",
      ruleId: "gdpr.art28.3.chapeau",
      textSynonyms: [
        "subject matter and duration",
        "nature and purpose",
        "types of personal data",
        "categories of data subjects",
        "processor shall",
      ],
    },
    {
      clauseType: "processor_assistance_obligation",
      severityIfMissing: "high",
      findingCategory: "dsr_assistance_not_operational",
      ruleId: "gdpr.art28.3.e",
      textSynonyms: ["assist the controller", "assistance", "fulfilment of the controller"],
    },
    {
      clauseType: "information_security",
      severityIfMissing: "high",
      findingCategory: "security_measures_not_risk_based",
      ruleId: "gdpr.art32",
      textSynonyms: [
        "technical and organisational measures",
        "security measures",
        "encryption",
        "confidentiality integrity availability",
      ],
    },
    {
      clauseType: "subprocessor_flow_down",
      severityIfMissing: "high",
      findingCategory: "subprocessor_authorisation_or_flowdown_gap",
      ruleId: "gdpr.art28.2",
      textSynonyms: ["subprocessor", "sub-processor", "prior written authorisation", "right to object"],
    },
    {
      clauseType: "deletion_on_termination",
      severityIfMissing: "high",
      findingCategory: "processor_return_deletion_gap",
      ruleId: "gdpr.art28.3.g",
      textSynonyms: ["delete or return", "deletion of personal data", "return all personal data"],
    },
    {
      clauseType: "audit_and_compliance_evidence",
      severityIfMissing: "medium",
      findingCategory: "processor_audit_evidence_gap",
      ruleId: "gdpr.art28.3.h",
      textSynonyms: ["make available all information", "audit", "inspection", "demonstrate compliance"],
    },
  ],
  riskCategories: [
    {
      category: "principles_or_accountability_gap",
      displayLabel: "Processing principles or accountability gap",
      guidance:
        "Processing terms or practices do not establish the Article 5 principles or demonstrable controller accountability.",
    },
    {
      category: "lawful_basis_or_purpose_gap",
      displayLabel: "Lawful-basis or purpose-limitation gap",
      guidance:
        "A processing purpose lacks a supported Article 6 basis, or incompatible further use is not assessed.",
    },
    {
      category: "invalid_or_unmanageable_consent",
      displayLabel: "Invalid or unmanageable consent",
      guidance:
        "Consent is not demonstrable, clear, freely given, specific, informed, or as easy to withdraw as to give.",
    },
    {
      category: "sensitive_data_condition_gap",
      displayLabel: "Sensitive-data condition or safeguard gap",
      guidance:
        "Special-category or criminal-offence data lacks the required legal condition or safeguards.",
    },
    {
      category: "privacy_notice_incomplete_or_late",
      displayLabel: "Incomplete or late privacy notice",
      guidance:
        "Articles 13-14 information is incomplete, unclear, or delivered after the applicable deadline.",
    },
    {
      category: "dsr_assistance_not_operational",
      displayLabel: "Data-subject-rights assistance is not operational (Art 28(3)(e))",
      guidance:
        "Rights assistance is vague, conditional, or lacks an operational duty to support applicable Chapter III requests.",
    },
    {
      category: "dsr_no_response_timeframe",
      displayLabel: "No defined response timeframe (Art 12(3))",
      guidance:
        "No numeric response timeframe tied to Art 12(3); 'promptly' or 'reasonably' alone is a gap.",
    },
    {
      category: "erasure_termination_only_gap",
      displayLabel: "Erasure limited to contract termination (Art 17)",
      guidance: "Deletion is only on termination; no mid-term Art 17 erasure path.",
    },
    {
      category: "portability_format_unaddressed",
      displayLabel: "Data-portability format is unaddressed (Art 20)",
      guidance: "No structured / machine-readable export commitment for Art 20.",
    },
    {
      category: "automated_decision_gap",
      displayLabel: "Automated-decision safeguards are not evidenced (Art 22)",
      guidance: "Art 22 automated decision-making is unaddressed.",
    },
    {
      category: "recipient_notification_gap",
      displayLabel: "Recipient-notification process is unaddressed (Art 19)",
      guidance: "Art 19 notification to recipients / subprocessor flow-down is unaddressed.",
    },
    {
      category: "assistance_cost_or_consent_gate_risk",
      displayLabel: "Assistance gated by consent or cost conditions",
      guidance:
        "Processor assistance is gated by cost, consent, or discretionary conditions that may prevent timely controller compliance.",
    },
    {
      category: "cost_allocation_silent",
      displayLabel: "Silent on cost of Art 28(3)(e) assistance",
      guidance:
        "Check whether the DPA states assistance is provided at no charge or only for reasonable documented cost. Silence can lead to disputes that cascade into Art 12(3) timing breaches.",
    },
    {
      category: "processor_terms_incomplete",
      displayLabel: "Incomplete mandatory processor terms (Art 28)",
      guidance:
        "The processing agreement omits mandatory Article 28 particulars or one or more processor obligations.",
    },
    {
      category: "subprocessor_authorisation_or_flowdown_gap",
      displayLabel: "Subprocessor authorisation or flow-down gap",
      guidance:
        "Subprocessor appointment lacks prior authorisation, change notice and objection rights, equivalent obligations, or processor liability.",
    },
    {
      category: "processor_return_deletion_gap",
      displayLabel: "Processor return-or-deletion gap (Art 28(3)(g))",
      guidance:
        "The processor does not give the controller the Article 28(3)(g) return-or-delete choice or uses an overbroad retention exception.",
    },
    {
      category: "processor_audit_evidence_gap",
      displayLabel: "Processor audit or compliance-evidence gap (Art 28(3)(h))",
      guidance:
        "The processor does not provide compliance information, audits or inspections, or unlawful-instruction warnings required by Article 28(3)(h).",
    },
    {
      category: "security_measures_not_risk_based",
      displayLabel: "Security measures are not risk-based (Art 32)",
      guidance:
        "Security language is generic or omits a risk-based Article 32 standard, resilience, restoration, testing, or instruction controls.",
    },
    {
      category: "high_risk_breach_notice_gap",
      displayLabel: "High-risk breach communication gap (Art 34)",
      guidance:
        "No adequate workflow or content exists for Article 34 communication to individuals after a likely high-risk breach.",
    },
    {
      category: "processor_breach_escalation_gap",
      displayLabel: "Processor breach-escalation gap (Art 33(2))",
      guidance:
        "The processor lacks a without-undue-delay obligation to notify the controller after becoming aware of a personal-data breach.",
    },
    {
      category: "breach_recordkeeping_gap",
      displayLabel: "Breach-recordkeeping gap (Art 33(5))",
      guidance:
        "There is no requirement or process to document breach facts, effects, and remedial action as required by Article 33(5).",
    },
    {
      category: "complaint_right_restriction",
      displayLabel: "Restriction on the right to complain (Art 77)",
      guidance:
        "Terms or practices improperly restrict the data subject's Article 77(1) right to lodge a supervisory-authority complaint.",
    },
    {
      category: "dpia_or_dpo_governance_gap",
      displayLabel: "DPIA or DPO governance gap",
      guidance:
        "Likely-high-risk processing lacks an adequate DPIA process, or mandatory DPO designation and independence controls are absent.",
    },
    {
      category: "transfer_mechanism_or_derogation_gap",
      displayLabel: "International-transfer mechanism or derogation gap",
      guidance:
        "A restricted transfer lacks a valid Chapter V mechanism, enforceable safeguards, or the exact conditions for an Article 49 derogation.",
    },
    {
      category: "joint_controller_or_representative_gap",
      displayLabel: "Joint-controller or EU-representative gap",
      guidance:
        "Joint-controller allocation or a required EU representative designation is absent or does not preserve data-subject access and rights.",
    },
    {
      category: "remedy_or_compensation_restriction",
      displayLabel: "Restriction on remedy or compensation rights",
      guidance:
        "Terms improperly restrict the individual's Article 79, 80, or 82 remedy, representation, or compensation rights.",
    },
    {
      category: "research_safeguards_gap",
      displayLabel: "Research, statistics, or archiving safeguards gap",
      guidance:
        "Research, statistical, or archiving processing lacks Article 89 data-minimisation, pseudonymisation, or non-identifying alternatives.",
    },
    { category: "other_known_risk", displayLabel: "Other material contractual risk", guidance: "Other material contractual risk." },
  ],
  regimeRules: GDPR_RULES,
  regimeRuleIds: GDPR_RULES.map((rule) => rule.ruleId),
  rightsMatrixRows: GDPR_RIGHTS_MATRIX,
  instructionFocusMap: [
    {
      triggerPhrases: [
        "15-22",
        "15–22",
        "15 to 22",
        "articles 15",
        "article 15",
        "arts 15",
        "art 15",
        "chapter iii",
        "data subject rights",
        "data subject request",
        "dsr",
        "access",
        "erasure",
        "rectification",
        "portability",
        "right to object",
        "automated decision",
        "assistance",
        "timeframe",
        "timeframes",
        "response time",
      ],
      focus: {
        ruleIds: ["gdpr.art28.3.e", "gdpr.art12.3"],
        matrixRowIds: GDPR_RIGHTS_MATRIX.map((r) => r.rowId),
        riskCategoryIds: DSR_RISK_IDS,
      },
    },
    {
      triggerPhrases: [
        "article 28",
        "article 28 processor",
        "article 28 terms",
        "processor obligations",
        "processor terms",
        "subprocessor authorisation",
      ],
      focus: {
        ruleIds: PROCESSOR_RULE_IDS,
        riskCategoryIds: [
          "processor_terms_incomplete",
          "subprocessor_authorisation_or_flowdown_gap",
          "processor_return_deletion_gap",
          "processor_audit_evidence_gap",
          "dsr_assistance_not_operational",
          "security_measures_not_risk_based",
        ],
      },
    },
    {
      triggerPhrases: ["privacy notice", "article 13", "article 14", "transparency"],
      focus: {
        ruleIds: [
          "gdpr.art12.1-2",
          "gdpr.art13.1-2",
          "gdpr.art13.3-4",
          "gdpr.art14.1-2",
          "gdpr.art14.3-5",
        ],
        riskCategoryIds: ["privacy_notice_incomplete_or_late"],
      },
    },
    {
      triggerPhrases: ["consent", "child consent", "children's data", "parental consent"],
      focus: {
        ruleIds: [
          "gdpr.art7.1",
          "gdpr.art7.2",
          "gdpr.art7.3",
          "gdpr.art7.4",
          "gdpr.art8.1-2",
        ],
        riskCategoryIds: ["invalid_or_unmanageable_consent"],
      },
    },
    {
      triggerPhrases: [
        "security of processing",
        "article 32",
        "breach notification",
        "breach communication",
        "personal data breach",
        "dpia",
      ],
      focus: {
        ruleIds: [
          "gdpr.art32",
          "gdpr.art33.2",
          "gdpr.art33.5",
          "gdpr.art34",
          "gdpr.art35",
          "gdpr.art36",
        ],
        riskCategoryIds: [
          "security_measures_not_risk_based",
          "processor_breach_escalation_gap",
          "breach_recordkeeping_gap",
          "high_risk_breach_notice_gap",
          "dpia_or_dpo_governance_gap",
        ],
      },
    },
    {
      triggerPhrases: [
        "international transfer",
        "chapter v",
        "article 45",
        "article 46",
        "article 47",
        "article 49",
        "binding corporate rules",
        "bcr",
      ],
      focus: {
        ruleIds: [
          "gdpr.art40.3",
          "gdpr.art42.2",
          "gdpr.art44",
          "gdpr.art45.1",
          "gdpr.art46",
          "gdpr.art47",
          "gdpr.art48",
          "gdpr.art49",
        ],
        riskCategoryIds: ["transfer_mechanism_or_derogation_gap"],
      },
    },
  ],
  evidencePackages: [
    {
      id: "gdpr.art28.particulars",
      requirementIds: [
        "subject_matter",
        "duration",
        "nature_purpose",
        "data_categories",
        "data_subject_categories",
        "controller_obligations_rights",
      ],
      capabilityIds: ["gdpr.art28.3.chapeau", "gdpr.art28.9"],
      clauseTypes: ["processor_terms", "data_protection"],
      extractionTargets: [
        "subject_matter",
        "duration",
        "nature",
        "purpose",
        "personal_data_categories",
        "data_subject_categories",
        "controller_obligations_rights",
      ],
      sourceMode: "authored",
      packageVersion: "1.0.0",
    },
    {
      id: "gdpr.art28.3.mandatory_clauses",
      requirementIds: ["mandatory_article28_clauses"],
      capabilityIds: [
        "gdpr.art28.3.a",
        "gdpr.art28.3.b",
        "gdpr.art28.3.c",
        "gdpr.art28.3.d",
        "gdpr.art28.3.e",
        "gdpr.art28.3.f",
        "gdpr.art28.3.g",
        "gdpr.art28.3.h",
        "gdpr.art28.4",
      ],
      clauseTypes: [
        "processor_terms",
        "subprocessor_flow_down",
        "information_security",
        "retention_and_deletion",
        "audit_and_compliance_evidence",
      ],
      extractionTargets: [
        "instructions_only_processing",
        "confidentiality",
        "security_measures",
        "subprocessor_flow_down",
        "dsr_assistance",
        "breach_security_assistance",
        "return_or_deletion",
        "audit_rights",
      ],
      sourceMode: "authored",
      packageVersion: "1.0.0",
    },
    {
      id: "gdpr.dsr.rights_matrix",
      requirementIds: ["data_subject_rights"],
      capabilityIds: [...GDPR_RIGHTS_MATRIX.map((row) => row.rowId), "gdpr.art28.3.e"],
      clauseTypes: ["data_subject_request_handling", "processor_assistance_obligation"],
      extractionTargets: [
        "access",
        "rectification",
        "erasure",
        "restriction",
        "portability",
        "objection",
        "response_timeframe",
        "processor_assistance",
      ],
      sourceMode: "authored",
      packageVersion: "1.0.0",
    },
  ],
  relatedChecks: [
    {
      primary: "data_subject_request_handling",
      related: [
        "dsr_no_response_timeframe",
        "erasure_termination_only_gap",
        "portability_format_unaddressed",
        "assistance_cost_or_consent_gate_risk",
        "cost_allocation_silent",
      ],
      note: "DSR assistance is typically reviewed with response timeframes, mid-term erasure, and portability format.",
    },
    {
      primary: "international_transfer_mechanism",
      related: ["government_access_request", "transfer_mechanism_or_derogation_gap"],
      note: "Transfer-mechanism review should also test foreign disclosure demands and onward transfers.",
    },
    {
      primary: "information_security",
      related: [
        "processor_breach_escalation_gap",
        "breach_recordkeeping_gap",
        "data_subject_breach_notice",
        "data_protection_impact_assessment",
      ],
      note: "Security review should also consider processor breach escalation, breach records, high-risk individual notification, and DPIA controls.",
    },
  ],
  defaultOperation: "compliance_check",
};
