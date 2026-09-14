import type {
  AnalysisSkillConfig,
  ComplianceComposition,
  RegimeCheckType,
  SkillRegimeRule,
  SkillRegimeRuleAuthority,
} from "../../../runtime/catalog/types.js";
import { buildDataProtectionRightsMatrix } from "../_family-template.js";
import {
  deriveRequirementEvidence,
  deriveSelectionFromText,
} from "../../../runtime/catalog/rule-contract-helpers.js";
import { GDPR_RULE_INVESTIGATION } from "./rule-investigation.js";

interface ParsedGdprRuleId {
  article: number;
  paragraph?: string;
  letter?: string;
}

const GDPR_RULE_ID_PATTERN =
  /^gdpr\.art(\d+)(?:\.([0-9]+(?:-[0-9]+)?))?(?:\.([a-z]+(?:-[a-z]+)?))?$/;
const GDPR_LETTER_ORDINAL: Record<string, number> = Object.fromEntries(
  "abcdefghijklmnopqrstuvwxyz".split("").map((letter, index) => [letter, index + 1])
);

function parseGdprRuleId(ruleId: string): ParsedGdprRuleId | undefined {
  const match = GDPR_RULE_ID_PATTERN.exec(ruleId);
  if (!match) return undefined;
  return { article: Number(match[1]), paragraph: match[2], letter: match[3] };
}

function formatGdprCitationSegment(segment: string): string {
  if (!segment.includes("-")) return `(${segment})`;
  const [start, end] = segment.split("-");
  return `(${start})-(${end})`;
}

function deriveGdprAuthority(ruleId: string): SkillRegimeRuleAuthority | undefined {
  const parsed = parseGdprRuleId(ruleId);
  if (!parsed) return undefined;
  const paragraphStart = parsed.paragraph ? Number(parsed.paragraph.split("-")[0]) : 0;
  const letterStart = parsed.letter
    ? (GDPR_LETTER_ORDINAL[parsed.letter.split("-")[0]] ?? 0)
    : 0;
  const citation = `Article ${parsed.article}` +
    (parsed.paragraph && parsed.paragraph !== "chapeau" ? formatGdprCitationSegment(parsed.paragraph) : "") +
    (parsed.letter && parsed.letter !== "chapeau" ? formatGdprCitationSegment(parsed.letter) : "");
  return {
    instrument: "GDPR",
    citation,
    provisionPath: [
      String(parsed.article),
      ...(parsed.paragraph ? [parsed.paragraph] : []),
      ...(parsed.letter ? [parsed.letter] : []),
    ],
    order: parsed.article * 10000 + paragraphStart * 100 + letterStart,
    citationAliases: [citation.replace("Article", "Art"), citation.replace("Article", "Art.")],
  };
}

/** Named shortcuts only; atomic rules below remain the source of legal truth. */
const GDPR_COMPOSITIONS: ComplianceComposition[] = [
  {
    id: "gdpr.art28.mandatory_particulars",
    label: "Article 28(3) mandatory processing-agreement particulars",
    aliases: ["mandatory processing agreement particulars", "article 28(3) chapeau", "processing agreement particulars", "written processor terms"],
    description: "The Article 28(3) chapeau particulars plus the Article 28(9) writing requirement.",
    ruleIds: ["gdpr.art28.3.chapeau", "gdpr.art28.9"],
  },
  {
    id: "gdpr.art28.mandatory_clauses",
    label: "Article 28(3) mandatory processor clauses",
    aliases: ["mandatory article 28 clauses", "mandatory_article28_clauses", "mandatory_article_28_3_clauses", "processor obligations"],
    description: "The Article 28(3)(a)-(h) processor obligations plus Article 28(4) flow-down.",
    ruleIds: ["gdpr.art28.3.a", "gdpr.art28.3.b", "gdpr.art28.3.c", "gdpr.art28.3.d", "gdpr.art28.3.e", "gdpr.art28.3.f", "gdpr.art28.3.g", "gdpr.art28.3.h", "gdpr.art28.4"],
  },
  {
    id: "gdpr.dsr.rights",
    label: "Data subject rights (Art 12(3), 15-22)",
    aliases: ["data subject rights", "dsr rights", "articles 15-22", "article 15-22", "access erasure rectification portability", "rights requests"],
    description: "The response-timeframe rule plus the substantive data-subject rights in Articles 15-22.",
    ruleIds: ["gdpr.art12.3", "gdpr.art15", "gdpr.art16", "gdpr.art17", "gdpr.art18", "gdpr.art19", "gdpr.art20", "gdpr.art21", "gdpr.art22"],
  },
  {
    id: "gdpr.processor_dsr_assistance",
    label: "Processor assistance with data-subject rights requests",
    aliases: ["assist the controller", "assistance to the controller", "processor assistance with data subject requests", "processor assistance with data-subject requests", "data subject request assistance", "dsr assistance"],
    description: "Article 28(3)(e) processor assistance with requests under Chapter III.",
    ruleIds: ["gdpr.art28.3.e"],
  },
  {
    id: "gdpr.security_breach_accountability",
    label: "Security, breach, and accountability (Art 32-36)",
    aliases: ["security and breach", "breach notification", "dpia", "security of processing"],
    description: "Security, breach, DPIA, and prior-consultation obligations.",
    ruleIds: ["gdpr.art32", "gdpr.art33.1", "gdpr.art33.2", "gdpr.art33.3", "gdpr.art33.4", "gdpr.art33.5", "gdpr.art34", "gdpr.art35", "gdpr.art36"],
  },
  {
    id: "gdpr.principles_consent_accountability",
    label: "Principles, consent, and accountability (Art 5-7, 24-27, 30)",
    aliases: ["processing principles", "consent conditions", "controller accountability", "records of processing"],
    description: "Processing principles, lawful basis, consent, governance, and records of processing.",
    ruleIds: ["gdpr.art5.1", "gdpr.art5.2", "gdpr.art6.1", "gdpr.art7.1", "gdpr.art7.2", "gdpr.art7.3", "gdpr.art7.4", "gdpr.art24", "gdpr.art25", "gdpr.art26", "gdpr.art27", "gdpr.art30"],
  },
  {
    id: "gdpr.transparency_special_categories_notices",
    label: "Transparency, special categories, and notices (Art 6(4), 8-14)",
    aliases: ["privacy notice", "special category data", "children's consent", "article 13", "article 14"],
    description: "Purpose compatibility, child consent, special categories, and Article 12-14 notices.",
    ruleIds: ["gdpr.art6.4", "gdpr.art8.1-2", "gdpr.art9.1-3", "gdpr.art10", "gdpr.art11.1", "gdpr.art11.2", "gdpr.art12.1-2", "gdpr.art12.4", "gdpr.art12.7", "gdpr.art12.5-6", "gdpr.art13.1-2", "gdpr.art13.3-4", "gdpr.art14.1-2", "gdpr.art14.3-5"],
  },
  {
    id: "gdpr.governance_dpo_codes_processor_extras",
    label: "DPO, codes/certification, and processor extras (Art 29, 37-39, 40(3), 42(2))",
    aliases: ["data protection officer", "dpo", "code of conduct", "certification"],
    description: "Processing under authority, DPO duties, codes, and certification.",
    ruleIds: ["gdpr.art29", "gdpr.art37", "gdpr.art38", "gdpr.art39.1.a-c", "gdpr.art40.3", "gdpr.art42.2"],
  },
  {
    id: "gdpr.chapter5_transfers",
    label: "International transfers (Art 44-49)",
    aliases: ["international transfers", "chapter v", "chapter 5", "adequacy decision", "standard contractual clauses", "sccs", "binding corporate rules"],
    description: "Chapter V transfer mechanisms, safeguards, orders, and derogations.",
    ruleIds: ["gdpr.art44", "gdpr.art45.1", "gdpr.art46", "gdpr.art47", "gdpr.art48", "gdpr.art49"],
  },
  {
    id: "gdpr.remedies_and_safeguards",
    label: "Remedies and research safeguards (Art 77, 79-80, 82, 89)",
    aliases: ["right to complain", "judicial remedy", "compensation", "research safeguards"],
    description: "Complaint, judicial remedy, representation, compensation, and research safeguards.",
    ruleIds: ["gdpr.art77.1", "gdpr.art79", "gdpr.art80.1", "gdpr.art82", "gdpr.art89.1"],
  },
];

const GDPR_RIGHTS_MATRIX = buildDataProtectionRightsMatrix("gdpr", [
  {
    rowId: "gdpr.right.access",
    localArticleOrSection: "15",
    label: "Access and copy",
    plainDescription:
      "A person can ask what personal data is held about them and receive a copy.",
  },
  {
    rowId: "gdpr.right.rectification",
    localArticleOrSection: "16",
    label: "Rectification and completion",
    plainDescription:
      "A person can ask for inaccurate or incomplete personal data to be corrected.",
  },
  {
    rowId: "gdpr.right.erasure",
    localArticleOrSection: "17",
    label: "Erasure (right to be forgotten)",
    plainDescription:
      "A person can ask for personal data to be erased when the legal conditions apply.",
  },
  {
    rowId: "gdpr.right.restriction",
    localArticleOrSection: "18",
    label: "Restriction of processing",
    plainDescription:
      "A person can ask for use of their personal data to be restricted in specified cases.",
  },
  {
    rowId: "gdpr.right.notification",
    localArticleOrSection: "19",
    label: "Recipient notification",
    plainDescription:
      "Recipients may need to be told when data is corrected, erased, or restricted.",
  },
  {
    rowId: "gdpr.right.portability",
    localArticleOrSection: "20",
    label: "Data portability",
    plainDescription:
      "A person can receive eligible data in a usable format and transfer it elsewhere.",
  },
  {
    rowId: "gdpr.right.object",
    localArticleOrSection: "21",
    label: "Objection, including direct marketing",
    plainDescription:
      "A person can object to certain processing, including direct marketing.",
  },
  {
    rowId: "gdpr.right.automated_decisions",
    localArticleOrSection: "22",
    label: "Automated individual decision-making",
    plainDescription:
      "A person has protections around qualifying solely automated decisions.",
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
  "gdpr.art33.2",
];

const LEGACY_REQUIREMENT_ID_BY_RULE: Record<string, string> = {
  "gdpr.art28.3.a": "art28_3_a_instructions",
  "gdpr.art28.3.b": "art28_3_b_confidentiality",
  "gdpr.art28.3.c": "art28_3_c_security",
  "gdpr.art28.3.d": "art28_3_d_subprocessors",
  "gdpr.art28.3.e": "art28_3_e_dsr_assistance",
  "gdpr.art28.3.f": "art28_3_f_security_assistance",
  "gdpr.art28.3.g": "art28_3_g_deletion_return",
  "gdpr.art28.3.h": "art28_3_h_audit",
  "gdpr.art28.4": "art28_4_subprocessor_flow_down",
};

const GDPR_RULE_VERIFICATION: Record<string, NonNullable<SkillRegimeRule["verification"]>> = {
  "gdpr.art5.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art5.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art6.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art6.4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art7.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art7.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art7.3": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art7.4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art8.1-2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art9.1-3": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art10": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art11.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art11.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art12.1-2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art12.3": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The contract states a specific numeric response deadline for data-subject requests functionally equivalent to without undue delay and within one month of receipt. Proof: Look for 'within one month', 'within 30 days', or an equivalent hard clock tied to data-subject / Chapter III requests. Vague diligence language alone is not enough. Non-proof: 'Promptly', 'reasonably', 'as soon as reasonably practicable', or 'without undue delay' with no numeric backstop. A general cooperation clause with no response deadline. Remediation: State a one-month (or 30-day) numeric response deadline for data-subject requests.",
      "Within the selected rule only, regarding Any complexity/volume extension is capped at two further months and conditioned on notice to the data subject within the first month stating the reasons for delay. Proof: Extension must be capped (≤ two further months) AND require notice within the original month stating reasons. An open-ended or unconditional extension is not full proof. Non-proof: An open-ended right to extend 'as needed' or 'where reasonably required' with no two-month cap. An extension with no duty to notify the data subject of the delay and reasons within the first month. Remediation: Cap any extension at two further months and require reasoned notice within the first month."
    ]
  },
  "gdpr.art12.4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art12.7": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art12.5-6": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art13.1-2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art13.3-4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art14.1-2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art14.3-5": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art15": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding A data subject can obtain confirmation that their personal data is being processed and a copy of that data. Proof: Operative right of access / confirmation-and-copy language, not a bare 'rights will be honored' list item. Non-proof: A generic 'data subject rights will be respected' statement with no confirmation or copy commitment. Access limited to a privacy notice URL with no copy of the subject's own data. Remediation: Grant confirmation of processing and a copy of the personal data on request.",
      "Within the selected rule only, regarding The response supplies substantially the Article 15(1) particulars (purposes, categories of data, recipients, retention period or criteria, other applicable rights, complaint route, source where not collected from the subject, and — where applicable — meaningful information about automated decision-making). Proof: Look for a commitment to provide Art 15(1)-style particulars, or an enumerated disclosure list covering those heads. Naming 'access' alone without particulars is incomplete. Non-proof: Naming 'right of access' in a rights list with no particulars commitment. A privacy-policy cross-reference that does not undertake to supply the Art 15(1) information on request. Remediation: Commit to providing the Article 15(1) information categories with the access response.",
      "Within the selected rule only, regarding Further copies may be charged only a reasonable administrative fee (first copy free / charge limited to manifestly unfounded or excessive requests). Proof: Fee language must preserve a free first copy or limit charges to reasonable administrative cost / manifestly unfounded or excessive requests. Non-proof: A right to charge for every copy with no free-first-copy or manifestly-unfounded framing. Remediation: Limit fees to reasonable administrative cost for further copies; keep the first copy free except for manifestly unfounded or excessive requests."
    ]
  },
  "gdpr.art16": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Inaccurate personal data must be rectified without undue delay upon request. Proof: An obligation on the controller/processor to correct inaccurate data, not merely a channel to 'submit a correction request'. Non-proof: A clause allowing the data subject only to submit a request, with no duty to act on it. Remediation: Obligate rectification of inaccurate personal data without undue delay.",
      "Within the selected rule only, regarding Incomplete personal data may be completed, including by means of a supplementary statement. Proof: Separate completion limb — supplementary statement or equivalent completion mechanism. Non-proof: Correction of inaccurate data alone, with no completion / supplementary-statement language. Remediation: Add a completion right, including by supplementary statement."
    ]
  },
  "gdpr.art17": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Personal data must be erased without undue delay on a data-subject erasure request or when an Article 17(1) ground applies — not only upon contract termination. Proof: Mid-term erasure-on-request (or Art 17(1) grounds) mechanism. Narrow Art 17(3) retention exceptions are consistent and do not defeat this. Non-proof: Deletion only 'upon termination of the Agreement' / 'at the end of the Term' with no mid-term erasure-request path. A generic 'we honor erasure rights' list item with no operative erase-on-request duty. Remediation: Add a mid-term erasure-on-request obligation tied to Article 17(1) grounds, independent of contract end.",
      "Within the selected rule only, regarding Where personal data has been made public, reasonable steps are taken to inform other controllers processing the data that the data subject has requested erasure of links, copies, or replications. Proof: Article 17(2) take-down / notify-other-controllers assistance when data was made public. Non-proof: A general subprocessor flow-down with no publication / other-controller notification on erasure. Remediation: Add Article 17(2) reasonable-steps notice to other controllers where data was made public."
    ]
  },
  "gdpr.art18": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding A distinct restriction remedy exists — data is marked/stored but not otherwise actively processed — separate from erasure and from continued normal processing. Proof: Restriction / marking language with limited permitted further processing (consent, legal claims, third-party rights, important public interest). Non-proof: Only 'delete or keep processing' with no separate restriction option. Silence on restriction. Remediation: Add a restriction-of-processing remedy distinct from erasure.",
      "Within the selected rule only, regarding Restriction is available for at least one Article 18(1) ground (contested accuracy, unlawful processing with erasure opposed, controller no longer needs the data but the data subject needs it for legal claims, or a pending objection). Proof: Tie the restriction right to one or more Art 18(1) triggers, not an undefined 'restriction' label alone. Non-proof: Using the word 'restriction' without any ground or operative effect on processing. Remediation: State the Article 18(1) grounds that trigger restriction.",
      "Within the selected rule only, regarding The data subject is informed before a restriction is lifted. Proof: Article 18(3) — inform before lifting the restriction. Non-proof: A restriction clause that is silent on notice before lifting. Remediation: Require notice to the data subject before lifting any restriction."
    ]
  },
  "gdpr.art19": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Recipients to whom personal data has been disclosed are notified of any rectification, erasure, or restriction, unless impossible or involving disproportionate effort. Proof: Notice duty specifically triggered by rectification / erasure / restriction — not a generic Art 28(4) subprocessor flow-down of confidentiality or security. Non-proof: Subprocessor flow-down of confidentiality/security with no rights-exercise recipient notice. Silence on notifying downstream recipients of rectification, erasure, or restriction. Remediation: Require notification to recipients when data is rectified, erased, or restricted.",
      "Within the selected rule only, regarding On request, the data subject is informed about those recipients. Proof: Article 19 second sentence — tell the data subject who the recipients were, on request. Non-proof: A general recipient-categories disclosure in a privacy notice with no on-request Article 19 duty. Remediation: Commit to informing the data subject of recipients on request after rectification, erasure, or restriction notices."
    ]
  },
  "gdpr.art20": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The data subject can receive the personal data they provided in a structured, commonly used, machine-readable format. Proof: Format commitment (structured / commonly used / machine-readable), not mere 'we will provide your data'. Non-proof: Generic 'provide your data upon request' with no format commitment. PDF-only or unstructured dump presented as portability. Remediation: Commit to a structured, commonly used, machine-readable export format.",
      "Within the selected rule only, regarding The data can be transmitted to another controller, including direct transmission where technically feasible. Proof: Transmission / direct-transfer limb — not only a self-service download. Non-proof: Export-to-self only, with no transmission-to-another-controller path. Remediation: Support transmission to another controller, including direct transmission where technically feasible."
    ]
  },
  "gdpr.art21": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The data subject can object to processing based on legitimate interests or public task; processing stops unless compelling legitimate grounds or legal-claims defense are demonstrated. Proof: Objection right distinct from erasure/restriction, tied to Art 6(1)(e)/(f)-style bases, with a limited continued-processing exception. Non-proof: A generic 'objection' list item with no operative effect on processing. Marketing opt-out alone presented as the entire Article 21 right. Remediation: Add an Article 21(1) objection right with the compelling-grounds / legal-claims override only.",
      "Within the selected rule only, regarding The data subject can object to direct-marketing processing (including related profiling) at any time, with no override. Proof: Separate, unconditional marketing objection / opt-out — no compelling-grounds override for marketing. Non-proof: Only a general legitimate-interest objection with no distinct marketing limb. A marketing preference centre that still allows the controller to continue marketing after objection. Remediation: Add an unconditional direct-marketing objection right, including related profiling."
    ]
  },
  "gdpr.art22": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Where solely automated decision-making producing legal or similarly significant effects is described, an Article 22(2) exception is identified (contract necessity, authorised by law with safeguards, or explicit consent). Proof: Name which Art 22(2) exception applies. A generic 'we comply with data protection law' statement is not enough. Non-proof: Describing scoring, screening, or eligibility automation with no Art 22(2) exception. A blanket compliance recital with no operative ADM safeguards. Remediation: Identify the Article 22(2) exception that authorises the automated decision-making.",
      "Within the selected rule only, regarding Where such automated decision-making applies, the data subject has at least the rights to human intervention, to express their point of view, and to contest the decision. Proof: Operative human-intervention / express-view / contest rights for in-scope ADM. Non-proof: ADM described with no human-review or contest mechanism. Remediation: Provide human intervention, a right to express a view, and a right to contest the decision."
    ]
  },
  "gdpr.art24": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art25": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art26": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art27": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art28.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art28.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art28.3.chapeau": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The contract identifies the subject matter of the processing (what is being processed and why the processor is engaged). Proof: Look for a scoping clause naming the services or an appendix/schedule labelled 'subject matter' or 'services'. Definition of the engagement, description of services, or an SOW reference counts. Non-proof: A generic 'the parties have entered into this agreement' recital. The title of the document alone. A pointer to Appendix X where Appendix X is missing from the upload. Remediation: Add a subject-matter clause naming the processing scope or attach the referenced Appendix/Schedule.",
      "Within the selected rule only, regarding The contract specifies the duration of the processing, either by a defined term (e.g., 'Term') or by tying it to the term of the main services agreement. Proof: A 'Term' definition + a clause aligning processing duration with the Term; or a fixed date range; or an 'in force during the Services' formulation. Non-proof: A definition of 'Term' that is never referenced by an operative processing clause. A termination-notice clause that presupposes duration but does not state it. Remediation: Add a duration clause or bind the processing duration to the main agreement's Term.",
      "Within the selected rule only, regarding The contract states the nature of the processing (the operations performed). Proof: Look for a list of processing operations (collection, storage, disclosure, deletion, hosting, analytics, etc.) — usually in an Appendix/Schedule table. Non-proof: A bare reference like 'as necessary for the Services' with no enumerated operations. Remediation: Enumerate the processing operations in the DPA or its schedule.",
      "Within the selected rule only, regarding The contract states the purpose of the processing. Proof: A stated purpose (delivering the Services, administering payroll, providing hosting, etc.). Non-proof: Purpose implied only from the counterparty's industry. Remediation: State the purpose of the processing in the contract.",
      "Within the selected rule only, regarding The contract lists the categories of personal data processed. Proof: An Appendix/Schedule table row labelled 'Categories of personal data' or an enumerated list (contact details, financial data, identifiers, etc.). Non-proof: A generic 'personal data' reference without categorisation. A pointer to an Appendix that the upload does not contain. Remediation: Add or attach the categories-of-personal-data list, aligned with the actual processing.",
      "Within the selected rule only, regarding The contract lists the categories of data subjects whose data is processed. Proof: An Appendix/Schedule row 'Categories of data subjects' (employees, customers, prospects, end users, etc.) or an equivalent enumeration. Non-proof: 'Individuals whose personal data is processed' — circular. An unreferenced Appendix. Remediation: Add or attach a categories-of-data-subjects list.",
      "Within the selected rule only, regarding The contract states what the controller must do in connection with the processing — e.g. give lawful documented instructions, ensure a legal basis, comply with data protection laws, or minimise personal data. Proof: Controller-side duties — not processor obligations dressed as controller language. Look for 'the Controller shall', 'Controller warrants', or equivalent controller obligations. Non-proof: A clause describing only the processor's duties (the common Art 28(3)(a)-(h) content) with no controller obligation. A generic mutual compliance recital that does not name a controller-specific duty. Remediation: Add controller obligations (lawful instructions, legal basis, compliance with data protection laws, or data minimisation).",
      "Within the selected rule only, regarding The contract states what the controller is entitled to do — e.g. give instructions, audit or inspect the processor's compliance, or exercise other controller rights over the processing. Proof: Controller-side rights or entitlements — audit/inspection powers, instruction rights, or similar controller prerogatives distinct from processor covenants. Non-proof: Processor audit obligations framed only as what the processor must permit, with no controller right to exercise them. A processor-only compliance clause with no controller entitlement named. Remediation: Add controller rights (instructions, audit/inspection, or other controller entitlements over the processing)."
    ]
  },
  "gdpr.art28.3.a": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor processes personal data only on documented instructions from the controller. Proof: A clause using 'only on documented instructions' / 'in accordance with the Controller's written instructions'. May sit in an operational-obligations section, a jurisdiction addendum, or the international-transfers section. Non-proof: 'As reasonably necessary to provide the Services' without an instruction-anchor. A general confidentiality clause. Remediation: Add the documented-instructions clause with the standard 28(3)(a) formulation.",
      "Within the selected rule only, regarding Instructions to make an international transfer are also processed only on documented instructions, unless required by law (with a notification obligation). Proof: The Article 28(3)(a) proviso: unless required by Union or Member State law, in which case the processor notifies the controller before processing (unless the law prohibits notification for important public-interest reasons). Non-proof: A separate international-transfer clause that names the mechanism (SCCs) but not the instruction-based control. Remediation: Add the proviso allowing law-mandated processing with a controller-notification obligation."
    ]
  },
  "gdpr.art28.3.b": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art28.3.c": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor is obligated to implement appropriate technical and organisational measures to protect personal data (a TOMs/security covenant, not a bare compliance aspiration). Proof: An operative obligation on the processor to implement technical and organisational measures appropriate to the risk — may reference Article 32 or 'appropriate security measures'. Non-proof: A generic 'comply with Data Protection Laws' statement with no security-measures obligation. A confidentiality clause with no technical/organisational security commitment. Remediation: Add an Article 28(3)(c) / Article 32 security-measures obligation on the processor.",
      "Within the selected rule only, regarding The security commitment is substantiated — by named measures (encryption, access controls, resilience, testing) or by an incorporated security exhibit/schedule whose content is confirmed in the reviewed materials. Proof: Substantive security content — enumerated controls, risk-appropriate measures, or a confirmed security exhibit/schedule. A bare pointer to 'the Information Security Exhibit' counts only if that exhibit is supplied and contains measures. Non-proof: A bare cross-reference to an Information Security Exhibit or security schedule that is not supplied or confirmed to contain measures. A one-line 'industry-standard security' promise with no measures, exhibit, or schedule. Remediation: Substantiate the security obligation with named measures or attach/incorporate a security exhibit with actual controls."
    ]
  },
  "gdpr.art28.3.d": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor must obtain the controller's prior general or specific written authorisation before engaging a subprocessor. Proof: Prior written authorisation — specific (per subprocessor) or general (list + changes). 'May engage subprocessors' or notice-only language is not enough. Non-proof: A clause that merely says the processor 'will notify' or 'may engage subprocessors' without prior authorisation. A published subprocessor list with no authorisation mechanism. Remediation: Require prior general or specific written authorisation before engaging any subprocessor.",
      "Within the selected rule only, regarding Where general authorisation applies, the controller receives advance notice of subprocessor changes and a meaningful opportunity to object. Proof: Change-notice + objection window — typically 30 days' notice and a right to object before the new subprocessor processes data. Required when general (not specific-only) authorisation is used. Non-proof: Notice of subprocessor changes with no objection right. A post-hoc notification after the subprocessor is already engaged. Remediation: Add advance notice and a meaningful objection opportunity for subprocessor changes under general authorisation.",
      "Within the selected rule only, regarding Each subprocessor is engaged under a written agreement imposing data-protection obligations on the subprocessor (equivalent engagement), not merely announced or listed. Proof: Written subprocessor agreement / DPA requirement — the processor must impose contractual data-protection terms on subprocessors, not merely disclose their names. Non-proof: A subprocessor list or registry with no written-agreement requirement. Processor liability for subprocessor acts without a written engagement obligation. Remediation: Require each subprocessor to be engaged under a written data-processing agreement."
    ]
  },
  "gdpr.art28.3.e": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor is obligated to assist the controller in responding to data-subject rights requests (access, rectification, erasure, portability, objection, etc.) made to the controller. Proof: An assistance covenant tied to Chapter III / data-subject rights — 'assist the Controller in responding to data subject requests', not a bare rights list. Non-proof: A generic 'data subject rights will be respected' statement with no processor assistance duty. A clause obligating the processor only to forward or redirect requests to the controller. Remediation: Add a processor assistance covenant for controller-facing data-subject rights requests.",
      "Within the selected rule only, regarding The assistance commitment includes operational mechanics — appropriate technical and organisational measures, information, or technical support the controller needs to fulfil requests — not merely notice or redirection. Proof: Substantive operational assistance — providing data, tools, or support needed to respond. Mere forwarding/redirection is partial, not full proof. Non-proof: Generic Chapter III assistance language without operational mechanics — e.g. 'assist with data subject rights' with no commitment to provide means, information, or technical support. A redirect-to-controller clause with no substantive assistance beyond notice. Listing Articles 15–22 without any operational assistance commitment. Remediation: Add operational DSR assistance mechanics (technical measures, information provision, or support tools) beyond mere redirection."
    ]
  },
  "gdpr.art28.3.f": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor assists the controller in ensuring compliance with Article 32 (security of processing). Proof: An explicit assistance-with-security clause, or an operational security clause (e.g. Section 6.4) referenced by the assistance provision. Non-proof: A generic 'commercially reasonable security measures' clause with no controller-assistance obligation. Remediation: Add an Article 32 assistance clause; cross-reference existing security controls.",
      "Within the selected rule only, regarding The processor assists with Articles 33-34 (personal-data-breach notification to the supervisory authority and to data subjects). Proof: A breach-notification clause naming assistance with controller's Article 33/34 duties, usually with a time window. Non-proof: A processor-only breach-notification clause without controller assistance framing. Remediation: Add breach-notification assistance with a defined time window.",
      "Within the selected rule only, regarding The processor assists with Articles 35-36 (DPIAs and prior consultation). Proof: A DPIA / prior-consultation assistance clause (often bundled with 33-34 assistance). Non-proof: A blanket 'assists with data protection obligations' clause with no DPIA scope. Remediation: Add DPIA / prior-consultation assistance, taking into account the nature of processing and information available."
    ]
  },
  "gdpr.art28.3.g": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The controller has a right to choose between deletion and return. Proof: A clause explicitly giving the controller the choice (e.g. 'at the Controller's option, delete or return'). Non-proof: A deletion-only clause with no return branch. A return-only clause with no deletion branch. Remediation: Reword the post-termination clause to grant the controller a choice.",
      "Within the selected rule only, regarding The processor is obligated to delete on request. Proof: A deletion obligation triggered at the end of services or on request. Non-proof: A permission to delete rather than an obligation. A discretion to retain 'for legitimate business purposes' with no boundary. Remediation: Convert the retention discretion into a deletion obligation.",
      "Within the selected rule only, regarding The processor is obligated to return on request. Proof: A return / export obligation triggered at the end of services or on request. Non-proof: A migration-services offer priced separately, without an obligation. Remediation: Add a return obligation (format specified where reasonable).",
      "Within the selected rule only, regarding The processor deletes existing copies unless Union or Member State law requires storage. Proof: The 28(3)(g) closing proviso — retention only where required by law, with the residual data still subject to processor obligations. Non-proof: Retention for 'business continuity' or 'audit' without a legal basis. Remediation: Add the closing proviso limiting retention to legally required cases."
    ],
    "aggregation": {
      "operator": "all",
      "children": [
        {
          "elementId": "G1"
        },
        {
          "operator": "any",
          "children": [
            {
              "elementId": "G2"
            },
            {
              "elementId": "G3"
            }
          ]
        },
        {
          "elementId": "G4"
        }
      ]
    }
  },
  "gdpr.art28.3.h": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor must make available information necessary to demonstrate compliance AND allow for and contribute to audits and inspections by the controller or its mandated auditor. Proof: Both limbs required — compliance information AND an actual audit/inspection right. Third-party certifications on request alone is partial. Non-proof: Third-party certifications/reports (SOC2, ISO 27001) on request with no independent audit/inspection right. An information-provision clause with no audit or inspection right. An audit right limited to reviewing a summary report that cannot demonstrate compliance. Remediation: Add both compliance-information access and a controller (or auditor) audit/inspection right with processor contribution.",
      "Within the selected rule only, regarding The processor must immediately inform the controller if, in its opinion, an instruction infringes GDPR or other data-protection provisions. Proof: Article 28(3) closing sentence — immediate warning of unlawful instructions. Distinct from the documented-instructions clause in 28(3)(a). Non-proof: A documented-instructions clause with no unlawful-instruction warning. A general compliance cooperation clause with no immediate-inform duty. Remediation: Add the immediate unlawful-instruction notification duty."
    ]
  },
  "gdpr.art28.4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding The processor must impose on each subprocessor the same data-protection obligations imposed on the processor by the DPA — specifically by reference to the processor's Article 28(3) obligations. Proof: Same-obligations covenant — 'impose the same data protection obligations', 'equivalent to those in this DPA', or reference to Article 28(3) obligations flowing down. Non-proof: A general statement that subprocessors must comply with data protection law. Processor liability for subprocessor acts without a same-obligations flow-down covenant. Remediation: Require subprocessors to be bound by the same Article 28(3) obligations as the processor.",
      "Within the selected rule only, regarding Flow-down is evidenced as an actual contractual imposition on subprocessors (by contract, DPA, or equivalent written instrument), not merely asserted via processor liability. Proof: Evidence that obligations are contractually imposed on subprocessors — written agreement, DPA, or explicit 'by contract' language. Liability alone does not prove flow-down. Non-proof: Processor remains liable for subprocessor conduct with no contractual flow-down language. A subprocessor list with no 'by written agreement' or 'by contract' imposition. Remediation: Evidence contractual flow-down — require subprocessors to enter written agreements imposing the same obligations."
    ]
  },
  "gdpr.art28.9": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art28.10": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art29": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art30": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art33.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art33.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding After becoming aware of a personal-data breach, the processor notifies the controller without undue delay. Proof: Operative processor-to-controller breach notification with a without-undue-delay standard or equivalent hard clock. Non-proof: A generic 'security incident' notice with no personal-data breach trigger. Vague 'promptly' or 'as soon as practicable' with no without-undue-delay framing for personal-data breaches. Remediation: Require the processor to notify the controller of personal-data breaches without undue delay.",
      "Within the selected rule only, regarding The processor assists the controller with the controller's breach-related obligations under Articles 33 and 34 (and related documentation under Article 33(5)). Proof: Assistance limb distinct from upward notification — help the controller meet supervisory notification, individual communication, and breach-documentation duties. Non-proof: Processor breach notification upward only, with no assistance for controller breach obligations. A generic cooperation clause unrelated to breach response assistance. Remediation: Obligate the processor to assist the controller with Articles 33-34 breach obligations."
    ]
  },
  "gdpr.art33.3": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art33.4": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art33.5": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art32": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Technical and organisational measures address ongoing confidentiality, integrity, availability, and resilience of processing systems and services. Proof: Article 32(1)(b) CIA/resilience limb — encryption, access controls, resilience, or equivalent measures, not a bare 'reasonable security' recital. Non-proof: A generic 'appropriate security' statement naming no confidentiality, integrity, availability, or resilience measures. Confidentiality-only language with no integrity, availability, or resilience commitment. Remediation: Implement measures ensuring confidentiality, integrity, availability, and resilience of processing systems.",
      "Within the selected rule only, regarding Security measures are appropriate to the risk — considering state of the art, implementation cost, processing nature/scope/context/purposes, and likely impact on individuals. Proof: Risk-appropriate TOMs limb — measures tied to risk context, not one-size-fits-all boilerplate. Non-proof: A fixed checklist of controls with no risk-appropriateness framing. Referencing an external standard with no obligation to implement risk-appropriate measures. Remediation: Tie security measures to processing risk, context, and likely individual impact."
    ]
  },
  "gdpr.art34": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art36": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art35": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": [
      "Within the selected rule only, regarding Where processing is likely to result in a high risk, a data protection impact assessment is performed before that processing begins. Proof: When-required limb — DPIA before likely-high-risk processing (systematic monitoring, special-category data at scale, automated decision-making with legal effects, etc.). Non-proof: A generic 'DPIA may be conducted' option with no before-processing trigger for high-risk processing. Silence on DPIA where high-risk processing is described. Remediation: Commit to performing a DPIA before likely-high-risk processing begins.",
      "Within the selected rule only, regarding The DPIA documents processing operations and purposes, necessity/proportionality assessment, risk assessment, and measures to address risks — including safeguards, security measures, and mechanisms demonstrating compliance. Proof: Documented content limb — not merely a promise to 'carry out a DPIA' with no documented assessment elements. Non-proof: A bare 'we will conduct a DPIA' commitment with no documented assessment content. Risk assessment language with no safeguards or compliance-evidence element. Remediation: Document DPIA content covering operations, necessity, risks, and mitigating measures."
    ]
  },
  "gdpr.art37": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art38": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art39.1.a-c": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art40.3": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art42.2": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art44": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art45.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art46": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art47": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art48": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art49": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art77.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art79": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art80.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art82": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  },
  "gdpr.art89.1": {
    "version": "1.1.0",
    "reviewStatus": "authored",
    "guidance": []
  }
};

function gdprRule(
  ruleId: string,
  label: string,
  ruleText: string,
  appliesToClauseTypes: string[],
  checkType: RegimeCheckType = "judgment",
  legalHook?: string,
  extras?: Partial<SkillRegimeRule>
): SkillRegimeRule {
  const investigation = GDPR_RULE_INVESTIGATION[ruleId];
  if (!investigation) {
    throw new Error(`GDPR rule ${ruleId} has no authored investigation profile`);
  }
  const baseSelection = deriveSelectionFromText(label, ruleText);
  return {
    ruleId,
    label,
    ruleText,
    checkType,
    findingCategory: findingCategoryForRule(ruleId, label),
    ruleScope: documentLevelRuleIds.has(ruleId) ? "per_document" : "per_clause",
    appliesToClauseTypes,
    ...(legalHook ? { legalHook } : {}),
    authority: deriveGdprAuthority(ruleId),
    selection: {
      ...baseSelection,
      aliases: [
        ...new Set([
          ...baseSelection.aliases,
          ...investigation.evidenceHints.map((hint) => hint.toLowerCase()),
        ]),
      ],
      concepts: [
        ...new Set([
          ...baseSelection.concepts,
          ...investigation.evidenceHints.flatMap((hint) =>
            deriveSelectionFromText(hint, hint).concepts
          ),
        ]),
      ].slice(0, 40),
    },
    applicability: PROCESSOR_RULE_IDS.includes(ruleId)
      ? { relationshipScopes: ["controller_to_processor"] }
      : {},
    investigation,
    verification: GDPR_RULE_VERIFICATION[ruleId],
    legacyRequirementId: LEGACY_REQUIREMENT_ID_BY_RULE[ruleId],
    ...extras,
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
  "gdpr.art33.1": "supervisory_authority_breach_notice_gap",
  "gdpr.art33.2": "processor_breach_escalation_gap",
  "gdpr.art33.3": "breach_notification_content_gap",
  "gdpr.art33.4": "phased_breach_notification_gap",
  "gdpr.art33.5": "breach_recordkeeping_gap",
  "gdpr.art34": "high_risk_breach_notice_gap",
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
    "EU GDPR Art 12(3). This is the EU rule; the supplied UK PDF is not a consolidated UK GDPR and cannot substantiate current UK deadline amendments.",
    {
      mechanicalScan: {
        kind: "numeric_pattern_expected",
        pattern:
          "\\b(\\d+)\\s*(hour|hours|day|days|week|weeks|month|months|business days?)\\b",
        vaguePattern:
          "\\b(promptly|reasonably|as soon as (reasonably )?practicable|without (undue )?delay|timely)\\b",
        presentClaim:
          "A numeric response timeframe ({match}) appears in the DSR/assistance clauses.",
        vagueClaim:
          'Art 12(3) requires a one-month (extendable) clock; the agreement only uses vague timing ("{match}").',
        absentClaim:
          "No response timeframe for data-subject requests was found in the extracted DSR/assistance clauses.",
        vagueGap:
          "No numeric Art 12(3) timeframe; 'promptly' / 'reasonably' alone is insufficient.",
        absentGap: "Art 12(3) one-month clock is unaddressed.",
        severityPresent: "low",
        severityVague: "high",
        severityAbsent: "high",
      },
      rendererHooks: {
        responseTimeframeSection: true,
        slaContrast: true,
        slaContrastLabel: "Article 12(3)",
        excludeClauseTypesFromSlaContrast: ["data_subject_request_handling"],
      },
    }
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
    "EU GDPR Art 28(3)(e). A general Chapter III commitment can be legally sufficient if it creates an operational assistance duty; naming Articles 15-22 is stronger drafting, not an express statutory requirement.",
    {
      rendererHooks: {
        particularsChecklist: true,
        architectureFallback:
          "The review considers the agreement's contractual mechanism for assisting with data-subject rights and the operational terms that support that mechanism.",
      },
      matrixLinkage: { matrixRowIds: GDPR_RIGHTS_MATRIX.map((row) => row.rowId) },
    }
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
    "gdpr.art33.1",
    "Supervisory-authority breach notification and 72-hour deadline",
    "After becoming aware of a personal-data breach, the controller must notify the competent supervisory authority without undue delay and, where feasible, within 72 hours; a late notification must explain the reasons for delay.",
    ["information_security", "security_dpia_assistance", "controller_accountability"],
    "pattern_then_llm_judgment",
    "EU GDPR Art 33(1)."
  ),
  gdprRule(
    "gdpr.art33.2",
    "Processor breach notification to controller",
    "After becoming aware of a personal-data breach, the processor must notify the controller without undue delay.",
    ["processor_assistance_obligation", "security_dpia_assistance", "processor_terms"],
    "pattern_then_llm_judgment",
    "EU GDPR Art 33(2)."
  ),
  gdprRule(
    "gdpr.art33.3",
    "Minimum supervisory-authority notification content",
    "The breach notification must describe the breach nature and affected categories/numbers, provide DPO or contact details, describe likely consequences, and describe measures taken or proposed including mitigation.",
    ["information_security", "security_dpia_assistance", "controller_accountability"],
    "judgment",
    "EU GDPR Art 33(3)."
  ),
  gdprRule(
    "gdpr.art33.4",
    "Phased breach-notification information",
    "Where all required information cannot be provided at once, it may be supplied in phases without undue further delay.",
    ["information_security", "security_dpia_assistance", "controller_accountability"],
    "judgment",
    "EU GDPR Art 33(4)."
  ),
  gdprRule(
    "gdpr.art33.5",
    "Breach documentation",
    "The controller must document every personal-data breach with the facts, effects, and remedial action taken, in a form sufficient to verify compliance with Articles 33 and 34.",
    ["controller_accountability", "information_security", "security_dpia_assistance"],
    "judgment",
    "EU GDPR Art 33(5)."
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

function linkChapterIiiRulesToMatrix(rules: SkillRegimeRule[]): SkillRegimeRule[] {
  const byArticle: Record<string, string> = {};
  for (const row of GDPR_RIGHTS_MATRIX) {
    byArticle[`gdpr.art${row.article}`] = row.rowId;
  }
  return rules.map((rule) => {
    const rowId = byArticle[rule.ruleId];
    if (!rowId || rule.matrixLinkage) return rule;
    return { ...rule, matrixLinkage: { matrixRowIds: [rowId] } };
  });
}

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
  rendererDefaults: {
    rightsReviewSubtitle: "data-subject rights",
  },
  clauseHeuristics: [
    {
      clauseType: "data_protection",
      patterns: ["\\bpersonal data\\b|\\bprocessing\\b"],
      priority: 50,
    },
    {
      clauseType: "data_subject_request_handling",
      patterns: ["\\bdata subject (request|right)"],
      priority: 50,
    },
    {
      clauseType: "processor_assistance_obligation",
      patterns: ["\\bassist(ance|s)? the controller\\b|\\bprocessor shall assist\\b"],
      priority: 50,
    },
    {
      clauseType: "security_dpia_assistance",
      patterns: ["\\bdpia\\b|\\bdata protection impact|\\bbreach notif"],
      priority: 50,
    },
    {
      clauseType: "deletion_on_termination",
      patterns: ["\\bdelet(e|ion)|return.*personal data|upon termination"],
      priority: 50,
    },
    {
      clauseType: "subprocessor_flow_down",
      patterns: ["\\bsub-?processor\\b|\\bsubprocessor\\b"],
      priority: 50,
    },
    {
      clauseType: "international_transfer_mechanism",
      patterns: ["\\bstandard contractual clause|\\binternational transfer|\\badequacy"],
      priority: 50,
    },
    {
      clauseType: "automated_decision_disclosure",
      patterns: ["\\bautomated decision|\\bprofil(e|ing)\\b"],
      priority: 50,
    },
  ],
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
      silencePattern: {
        triggerClauseTypes: [
          "processor_assistance_obligation",
          "data_subject_request_handling",
        ],
        triggerRegex:
          "\\bassist(?:ance|s|ing)?\\b[\\s\\S]{0,180}\\b(data subject|chapter iii|controller)\\b",
        satisfyRegex:
          "\\b(costs?|fees?|charges?|expenses?|rates?|no additional charge|at no charge)\\b",
        claim:
          "The agreement creates a data-subject-rights assistance duty but does not allocate the cost of providing that assistance.",
        severity: "medium",
      },
    },
    {
      category: "dsr_generic_no_named_rights",
      displayLabel: "Generic data-subject request language",
      guidance:
        "Data-subject request language is generic and does not name the applicable Chapter III rights.",
      heuristic: [
        {
          regex: "data subject (request|right)",
          excludeRegex:
            "\\b(access|erasure|rectification|portability|article 1[5-9]|article 2[0-2])\\b",
          claim:
            "Data-subject request language is generic and does not name Chapter III rights.",
          severity: "medium",
        },
      ],
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
  regimeRules: linkChapterIiiRulesToMatrix(GDPR_RULES),
  regimeRuleIds: GDPR_RULES.map((rule) => rule.ruleId),
  compositions: GDPR_COMPOSITIONS,
  rightsMatrixRows: GDPR_RIGHTS_MATRIX,
  metaRequirementBindings: [
    {
      match: { idIncludes: ["response_timeframe", "timeframes"] },
      capabilityIds: ["gdpr.art12.3", "dsr_no_response_timeframe"],
    },
    {
      match: { idIncludes: ["assistance_obligation", "processor_assistance"] },
      capabilityIds: [
        "gdpr.art28.3.e",
        "dsr_assistance_not_operational",
        ...GDPR_RIGHTS_MATRIX.map((row) => row.rowId),
      ],
    },
    {
      match: { idIncludes: ["gap_analysis", "compliance_gap"] },
      capabilityIds: DSR_RISK_IDS,
    },
  ],
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
          "gdpr.art33.1",
          "gdpr.art33.2",
          "gdpr.art33.3",
          "gdpr.art33.4",
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
      clauseTypes: [
        "processor_terms",
        "data_protection",
        "termination",
        "definitions",
        "records_of_processing",
      ],
      extractionTargets: [
        "subject_matter",
        "duration",
        "nature",
        "purpose",
        "personal_data_categories",
        "data_subject_categories",
        "controller_obligations_rights",
      ],
      evidenceScope: {
        relationshipScopes: ["controller_to_processor"],
      },
      requirementEvidence: {
        subject_matter: {
          hypothesis:
            "The contract sets out the subject matter of the processing.",
          evidenceHints: [
            "subject matter",
            "offer",
            "offers",
            "disclosures",
            "applies to the processing",
            "services",
            "business purpose",
            "statement of work",
          ],
          proofStandard:
            "Proven only by text stating what personal-data processing activity or " +
            "service this agreement covers (e.g. 'processing of Customer Personal Data " +
            "in connection with the Offerings'). An explicit, named cross-reference to " +
            "another document (an Offer, SOW, or Order Form) counts only if that " +
            "referenced document itself states the subject matter — a bare pointer with " +
            "no confirmation the target document contains it is a dependency, not proof. " +
            "General recitals about the parties' business relationship, or a bare " +
            "definition of 'Personal Data'/'Processing', do not establish subject matter " +
            "unless they also say what is being processed under this specific agreement.",
        },
        duration: {
          hypothesis: "The contract sets out the duration of the processing.",
          evidenceHints: [
            "duration",
            "term",
            "period",
            "termination",
            "in force",
            "set forth",
            "expiry",
            "end of services",
            "statement of work",
          ],
          proofStandard:
            "Proven only by text stating how long the processing continues — an " +
            "explicit term (e.g. 'for the duration of the Agreement'), a fixed period, " +
            "or an end condition tied to a specific event. Termination rights, notice " +
            "periods, or post-termination data-deletion timelines do NOT by themselves " +
            "establish duration unless they also state or clearly reference the term of " +
            "the underlying processing itself. A binding end-of-processing consequence " +
            "expressly tied to expiry, termination, or the end of services establishes " +
            "a material end boundary and is partial coverage when the complete active " +
            "processing term is not stated. A bare statement that 'this DPA remains " +
            "in effect' without saying what period that tracks against does not count.",
        },
        nature_purpose: {
          hypothesis:
            "The contract sets out the nature and purpose of the processing.",
          evidenceHints: [
            "nature",
            "purpose",
            "processing activities",
            "services",
            "business purpose",
            "schedule",
            "statement of work",
            "provision of",
          ],
          proofStandard:
            "Proven only when the text describes BOTH what activities are performed on " +
            "the data (nature — e.g. storage, hosting, transmission, analysis) AND why " +
            "(purpose — e.g. to provide the contracted Offerings to the Customer). Both " +
            "halves must be present: a clause stating only the purpose without " +
            "describing the kind of processing activity, or vice versa, is partial, not " +
            "present. A generic statement like 'Cisco will process data in accordance " +
            "with the Agreement' describes neither and does not count.",
        },
        data_categories: {
          hypothesis: "The contract sets out the types of personal data.",
          evidenceHints: [
            "categories of personal data",
            "types of personal data",
            "processing operations",
            "annex",
            "schedule",
            "statement of work",
          ],
          proofStandard:
            "Proven only by text that names or categorizes the type(s) of personal " +
            "data processed — e.g. contact details, account credentials, health data, " +
            "employee data. An explicit, named cross-reference to an Annex/Schedule/" +
            "Order Form counts only if that referenced document itself lists the " +
            "categories - a bare pointer such as 'as described in the Offer' without " +
            "confirming the Offer actually contains such a list is a dependency on an " +
            "unsupplied document, not proof of the requirement. A general definition " +
            "listing data that could qualify as personal or sensitive data does not " +
            "prove that those categories are actually processed under the services.",
        },
        data_subject_categories: {
          hypothesis: "The contract sets out the categories of data subjects.",
          evidenceHints: [
            "data subjects",
            "categories of data subjects",
            "employees",
            "customers",
            "end users",
            "annex",
            "schedule",
            "statement of work",
          ],
          proofStandard:
            "Proven only by text identifying WHO the data subjects are — e.g. " +
            "Customer's employees, customers, or end users — distinct from what data " +
            "is processed about them. A clause describing only the types of DATA does " +
            "not establish the types of PEOPLE the data is about. As with data " +
            "categories, an explicit named cross-reference to a document that itself " +
            "lists data-subject categories counts; an unconfirmed pointer does not.",
        },
        controller_obligations_rights: {
          hypothesis:
            "The contract sets out the controller's obligations and rights.",
          evidenceHints: [
            "obligations",
            "rights",
            "instructions",
            "lawful",
            "minimise",
            "minimize",
            "data protection laws",
          ],
          proofStandard:
            "Proven only by text stating what the CONTROLLER (not the processor) must " +
            "do or is entitled to do — e.g. the controller's duty to give lawful " +
            "instructions or ensure a legal basis for the processing, or its right to " +
            "audit/inspect the processor's compliance. A clause describing only the " +
            "PROCESSOR's duties (the more common Art 28(3)(a)-(h) content) does not " +
            "satisfy this particular unless it also names something the controller " +
            "itself must or may do.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Processing particulars (Art 28(3) chapeau)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "subject_matter",
              "duration",
              "nature_purpose",
              "data_categories",
              "data_subject_categories",
              "controller_obligations_rights",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.art28.3.mandatory_clauses",
      requirementIds: [
        "art28_3_a_instructions",
        "art28_3_b_confidentiality",
        "art28_3_c_security",
        "art28_3_d_subprocessors",
        "art28_3_e_dsr_assistance",
        "art28_3_f_security_assistance",
        "art28_3_g_deletion_return",
        "art28_3_h_audit",
        "art28_4_subprocessor_flow_down",
      ],
      requirementAliases: [
        "mandatory_article28_clauses",
        "mandatory_article_28_3_clauses",
      ],
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
        "confidentiality",
        "deletion_on_termination",
        "data_subject_request_handling",
        "processor_assistance_obligation",
        "security_dpia_assistance",
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
      evidenceScope: {
        relationshipScopes: ["controller_to_processor"],
      },
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art28_3_a_instructions: "gdpr.art28.3.a",
        art28_3_b_confidentiality: "gdpr.art28.3.b",
        art28_3_c_security: "gdpr.art28.3.c",
        art28_3_d_subprocessors: "gdpr.art28.3.d",
        art28_3_e_dsr_assistance: "gdpr.art28.3.e",
        art28_3_f_security_assistance: "gdpr.art28.3.f",
        art28_3_g_deletion_return: "gdpr.art28.3.g",
        art28_3_h_audit: "gdpr.art28.3.h",
        art28_4_subprocessor_flow_down: "gdpr.art28.4",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Mandatory Article 28(3) clauses",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art28_3",
              "art28_4",
              "mandatory_article28_clauses",
              "clause_adequacy",
            ],
          },
        ],
      },
    },
    {
      // Separate from `gdpr.dsr.rights_matrix` below: that package drives the
      // rendered rights-matrix table via `evaluate_matrix_row` (a distinct
      // code path that never reads `requirementEvidence`). THIS package is
      // what actually routes Art 12(3) and Art 15-22 through the Phase
      // 3-7 retrieval/verify/lock pipeline (`evaluate_package` reads
      // `input.requirementEvidence` — see `requirementEvidenceProfiles` in
      // compliance-observability.ts). Both packages may fire for the same
      // document; this one is the one that makes these rights "packages"
      // with locked, quote-verified findings instead of judgment-only ones.
      id: "gdpr.dsr.rights_verification",
      requirementIds: [
        "art12_3_response_timeframe",
        "art15_access",
        "art16_rectification",
        "art17_erasure",
        "art18_restriction",
        "art19_recipient_notification",
        "art20_portability",
        "art21_objection",
        "art22_automated_decisions",
      ],
      capabilityIds: [
        "gdpr.art12.3",
        "gdpr.art15",
        "gdpr.art16",
        "gdpr.art17",
        "gdpr.art18",
        "gdpr.art19",
        "gdpr.art20",
        "gdpr.art21",
        "gdpr.art22",
      ],
      clauseTypes: [
        "data_subject_request_handling",
        "data_subject_rights",
        "automated_decision_disclosure",
        "retention_and_deletion",
        "privacy_notice",
        "subprocessor_flow_down",
        "processor_assistance_obligation",
      ],
      extractionTargets: [
        "response_timeframe",
        "access",
        "rectification",
        "erasure",
        "restriction",
        "recipient_notification",
        "portability",
        "objection",
        "automated_decisions",
      ],
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art12_3_response_timeframe: "gdpr.art12.3",
        art15_access: "gdpr.art15",
        art16_rectification: "gdpr.art16",
        art17_erasure: "gdpr.art17",
        art18_restriction: "gdpr.art18",
        art19_recipient_notification: "gdpr.art19",
        art20_portability: "gdpr.art20",
        art21_objection: "gdpr.art21",
        art22_automated_decisions: "gdpr.art22",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "GDPR data subject rights verification (Art 12(3), 15-22)",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Data subject rights (Art 12(3), 15-22)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art12_3_response_timeframe",
              "art15_access",
              "art16_rectification",
              "art17_erasure",
              "art18_restriction",
              "art19_recipient_notification",
              "art20_portability",
              "art21_objection",
              "art22_automated_decisions",
            ],
          },
        ],
      },
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
      orchestration: {
        role: "matrix_owner",
        matrixDeferCapabilities: ["gdpr.art28.3.e"],
      },
      report: {
        reportType: "rights_matrix",
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "recommendations",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Rights and obligations matrix",
            sectionId: "requirements_matrix",
            artifactTypes: ["rights_matrix_table"],
            requirementTags: ["data_subject_rights"],
          },
        ],
      },
    },
    {
      id: "gdpr.security.breach_and_accountability",
      requirementIds: [
        "art32_security",
        "art33_1_authority_notice",
        "art33_2_processor_breach_notice",
        "art33_3_notification_content",
        "art33_4_phased_notification",
        "art33_5_breach_documentation",
        "art34_individual_notice",
        "art35_dpia",
        "art36_prior_consultation",
      ],
      capabilityIds: [
        "gdpr.art32",
        "gdpr.art33.1",
        "gdpr.art33.2",
        "gdpr.art33.3",
        "gdpr.art33.4",
        "gdpr.art33.5",
        "gdpr.art34",
        "gdpr.art35",
        "gdpr.art36",
      ],
      clauseTypes: [
        "information_security",
        "security_dpia_assistance",
        "processor_assistance_obligation",
        "data_subject_breach_notice",
        "data_protection_impact_assessment",
        "processor_terms",
      ],
      extractionTargets: [
        "security_measures",
        "authority_breach_notification",
        "processor_breach_notification",
        "breach_notification_content",
        "phased_breach_notification",
        "breach_documentation",
        "individual_breach_notice",
        "dpia",
        "prior_consultation",
      ],
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art32_security: "gdpr.art32",
        art33_1_authority_notice: "gdpr.art33.1",
        art33_2_processor_breach_notice: "gdpr.art33.2",
        art33_3_notification_content: "gdpr.art33.3",
        art33_4_phased_notification: "gdpr.art33.4",
        art33_5_breach_documentation: "gdpr.art33.5",
        art34_individual_notice: "gdpr.art34",
        art35_dpia: "gdpr.art35",
        art36_prior_consultation: "gdpr.art36",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "GDPR security, breach, and accountability verification (Art 32-36)",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Security and breach accountability (Art 32-36)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art32_security",
              "art33_2_processor_breach_notice",
              "art33_5_breach_documentation",
              "art34_individual_notice",
              "art35_dpia",
              "art36_prior_consultation",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.principles.consent_and_accountability",
      requirementIds: [
        "art5_1_principles",
        "art5_2_accountability",
        "art6_1_lawful_basis",
        "art7_consent_conditions",
        "art24_controller_responsibility",
        "art25_dp_by_design",
        "art26_joint_controllers",
        "art27_eu_representative",
        "art30_ropa",
      ],
      capabilityIds: [
        "gdpr.art5.1",
        "gdpr.art5.2",
        "gdpr.art6.1",
        "gdpr.art7.1",
        "gdpr.art7.2",
        "gdpr.art7.3",
        "gdpr.art7.4",
        "gdpr.art24",
        "gdpr.art25",
        "gdpr.art26",
        "gdpr.art27",
        "gdpr.art30",
      ],
      clauseTypes: [
        "data_protection",
        "lawful_basis",
        "consent_management",
        "controller_accountability",
        "privacy_by_design",
        "joint_controller_arrangement",
        "eu_representative",
        "records_of_processing",
        "retention_and_deletion",
        "information_security",
      ],
      extractionTargets: [
        "processing_principles",
        "accountability",
        "lawful_basis",
        "consent_conditions",
        "controller_policies",
        "privacy_by_design",
        "joint_controller_terms",
        "eu_representative",
        "records_of_processing",
      ],
      // Art 28(1)/(2) intentionally omitted — when Art 28 packages are in
      // scope they are absorbed as contextCapabilityIds (not separate
      // evaluate_package requirements). See analysis-package-graph tests.
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art5_1_principles: "gdpr.art5.1",
        art5_2_accountability: "gdpr.art5.2",
        art6_1_lawful_basis: "gdpr.art6.1",
        art7_consent_conditions: "gdpr.art7.1",
        art24_controller_responsibility: "gdpr.art24",
        art25_dp_by_design: "gdpr.art25",
        art26_joint_controllers: "gdpr.art26",
        art27_eu_representative: "gdpr.art27",
        art30_ropa: "gdpr.art30",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "GDPR principles, consent, and accountability verification",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Principles, consent, and accountability (Art 5-7, 24-27, 30)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art5_1_principles",
              "art5_2_accountability",
              "art6_1_lawful_basis",
              "art7_consent_conditions",
              "art24_controller_responsibility",
              "art25_dp_by_design",
              "art26_joint_controllers",
              "art27_eu_representative",
              "art30_ropa",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.transparency.special_categories_and_notices",
      requirementIds: [
        "art6_4_purpose_compatibility",
        "art8_child_consent",
        "art9_special_categories",
        "art10_criminal_data",
        "art11_1_non_identification",
        "art11_2_rights_without_identification",
        "art12_1_2_transparent_info",
        "art12_4_reasoned_refusal",
        "art12_7_privacy_icons",
        "art12_5_6_free_requests",
        "art13_1_2_direct_collection_notice",
        "art13_3_4_new_purpose_notice",
        "art14_1_2_indirect_collection_notice",
        "art14_3_5_timing_and_exceptions",
      ],
      capabilityIds: [
        "gdpr.art6.4",
        "gdpr.art8.1-2",
        "gdpr.art9.1-3",
        "gdpr.art10",
        "gdpr.art11.1",
        "gdpr.art11.2",
        "gdpr.art12.1-2",
        "gdpr.art12.4",
        "gdpr.art12.7",
        "gdpr.art12.5-6",
        "gdpr.art13.1-2",
        "gdpr.art13.3-4",
        "gdpr.art14.1-2",
        "gdpr.art14.3-5",
      ],
      clauseTypes: [
        "lawful_basis",
        "data_protection",
        "privacy_notice",
        "consent_management",
        "special_category_data",
        "criminal_offence_data",
        "confidentiality",
        "privacy_by_design",
        "retention_and_deletion",
        "data_subject_request_handling",
        "automated_decision_disclosure",
        "international_transfer_mechanism",
        "information_security",
      ],
      extractionTargets: [
        "purpose_compatibility",
        "child_consent",
        "special_category_data",
        "criminal_offence_data",
        "identification_necessity",
        "transparent_communications",
        "reasoned_refusal",
        "privacy_icons",
        "free_dsr_requests",
        "direct_collection_notice",
        "new_purpose_notice",
        "indirect_collection_notice",
        "notice_timing",
      ],
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art6_4_purpose_compatibility: "gdpr.art6.4",
        art8_child_consent: "gdpr.art8.1-2",
        art9_special_categories: "gdpr.art9.1-3",
        art10_criminal_data: "gdpr.art10",
        art11_1_non_identification: "gdpr.art11.1",
        art11_2_rights_without_identification: "gdpr.art11.2",
        art12_1_2_transparent_info: "gdpr.art12.1-2",
        art12_4_reasoned_refusal: "gdpr.art12.4",
        art12_7_privacy_icons: "gdpr.art12.7",
        art12_5_6_free_requests: "gdpr.art12.5-6",
        art13_1_2_direct_collection_notice: "gdpr.art13.1-2",
        art13_3_4_new_purpose_notice: "gdpr.art13.3-4",
        art14_1_2_indirect_collection_notice: "gdpr.art14.1-2",
        art14_3_5_timing_and_exceptions: "gdpr.art14.3-5",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label:
        "GDPR transparency, special categories, and notices verification (Art 6(4), 8-14)",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading:
              "Transparency, special categories, and notices (Art 6(4), 8-14)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art6_4_purpose_compatibility",
              "art8_child_consent",
              "art9_special_categories",
              "art10_criminal_data",
              "art11_1_non_identification",
              "art11_2_rights_without_identification",
              "art12_1_2_transparent_info",
              "art12_4_reasoned_refusal",
              "art12_7_privacy_icons",
              "art12_5_6_free_requests",
              "art13_1_2_direct_collection_notice",
              "art13_3_4_new_purpose_notice",
              "art14_1_2_indirect_collection_notice",
              "art14_3_5_timing_and_exceptions",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.governance.dpo_codes_and_processor_extras",
      requirementIds: [
        "art29_processing_under_authority",
        "art37_dpo_designation",
        "art38_dpo_position",
        "art39_1_dpo_tasks",
        "art40_3_code_transfer_commitments",
        "art42_2_certification_transfer_commitments",
      ],
      capabilityIds: [
        "gdpr.art29",
        "gdpr.art37",
        "gdpr.art38",
        "gdpr.art39.1.a-c",
        "gdpr.art40.3",
        "gdpr.art42.2",
      ],
      clauseTypes: [
        "processor_terms",
        "data_protection",
        "confidentiality",
        "data_protection_officer",
        "controller_accountability",
        "data_protection_impact_assessment",
        "international_transfer_mechanism",
        "data_subject_rights",
      ],
      extractionTargets: [
        "processing_under_authority",
        "dpo_designation",
        "dpo_independence",
        "dpo_tasks",
        "code_of_conduct_commitments",
        "certification_commitments",
      ],
      // Art 28(10) intentionally omitted — absorbed as Art 28 package
      // context when Art 28 packages are selected (see package-graph tests).
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art29_processing_under_authority: "gdpr.art29",
        art37_dpo_designation: "gdpr.art37",
        art38_dpo_position: "gdpr.art38",
        art39_1_dpo_tasks: "gdpr.art39.1.a-c",
        art40_3_code_transfer_commitments: "gdpr.art40.3",
        art42_2_certification_transfer_commitments: "gdpr.art42.2",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label:
        "GDPR governance: DPO, codes/certification transfer commitments, and processor extras",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading:
              "DPO, codes/certification, and processor extras (Art 29, 37-39, 40(3), 42(2))",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art29_processing_under_authority",
              "art37_dpo_designation",
              "art38_dpo_position",
              "art39_1_dpo_tasks",
              "art40_3_code_transfer_commitments",
              "art42_2_certification_transfer_commitments",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.chapter5.transfers",
      requirementIds: [
        "art44_general_transfer_principle",
        "art45_1_adequacy",
        "art46_appropriate_safeguards",
        "art47_binding_corporate_rules",
        "art48_foreign_disclosure_orders",
        "art49_transfer_derogations",
      ],
      capabilityIds: [
        "gdpr.art44",
        "gdpr.art45.1",
        "gdpr.art46",
        "gdpr.art47",
        "gdpr.art48",
        "gdpr.art49",
      ],
      clauseTypes: [
        "international_transfer_mechanism",
        "data_protection",
        "data_subject_rights",
        "government_access_request",
        "consent_management",
        "controller_accountability",
      ],
      extractionTargets: [
        "third_country_transfers",
        "adequacy_decision",
        "appropriate_safeguards",
        "binding_corporate_rules",
        "foreign_disclosure_orders",
        "transfer_derogations",
        "onward_transfers",
      ],
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art44_general_transfer_principle: "gdpr.art44",
        art45_1_adequacy: "gdpr.art45.1",
        art46_appropriate_safeguards: "gdpr.art46",
        art47_binding_corporate_rules: "gdpr.art47",
        art48_foreign_disclosure_orders: "gdpr.art48",
        art49_transfer_derogations: "gdpr.art49",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "GDPR Chapter V international transfers verification (Art 44-49)",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "International transfers (Art 44-49)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art44_general_transfer_principle",
              "art45_1_adequacy",
              "art46_appropriate_safeguards",
              "art47_binding_corporate_rules",
              "art48_foreign_disclosure_orders",
              "art49_transfer_derogations",
            ],
          },
        ],
      },
    },
    {
      id: "gdpr.remedies.and_safeguards",
      requirementIds: [
        "art77_1_complaint_right",
        "art79_judicial_remedy",
        "art80_1_mandated_representative",
        "art82_compensation_liability",
        "art89_1_research_safeguards",
      ],
      capabilityIds: [
        "gdpr.art77.1",
        "gdpr.art79",
        "gdpr.art80.1",
        "gdpr.art82",
        "gdpr.art89.1",
      ],
      clauseTypes: [
        "data_subject_rights",
        "judicial_remedies_and_compensation",
        "processor_terms",
        "research_and_statistics",
        "privacy_by_design",
        "privacy_notice",
      ],
      extractionTargets: [
        "complaint_right",
        "judicial_remedy",
        "mandated_representative",
        "compensation_liability",
        "research_safeguards",
        "pseudonymisation",
      ],
      requirementEvidence: deriveRequirementEvidence(GDPR_RULE_INVESTIGATION, {
        art77_1_complaint_right: "gdpr.art77.1",
        art79_judicial_remedy: "gdpr.art79",
        art80_1_mandated_representative: "gdpr.art80.1",
        art82_compensation_liability: "gdpr.art82",
        art89_1_research_safeguards: "gdpr.art89.1",
      }),
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requirementKinds: ["adequacy", "verification"],
      label: "GDPR remedies and research safeguards verification (Art 77, 79-80, 82, 89)",
      report: {
        sections: [
          "executive_summary",
          "requirements_matrix",
          "material_gaps",
          "missing_materials",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "Remedies and research safeguards (Art 77, 79-80, 82, 89)",
            sectionId: "requirements_matrix",
            requirementTags: [
              "art77_1_complaint_right",
              "art79_judicial_remedy",
              "art80_1_mandated_representative",
              "art82_compensation_liability",
              "art89_1_research_safeguards",
            ],
          },
        ],
      },
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
      matrixLinkageIds: GDPR_RIGHTS_MATRIX.map((row) => row.rowId),
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
