/**
 * Canonical requirement state for ASK — every important deal fact has
 * value + source + status + evidence. ASK inspects status, not empty keys.
 */

export type RequirementStatus =
  | "satisfied"
  | "missing"
  | "conflict"
  | "assumed"
  | "not_applicable";

export type RequirementSource =
  | "user"
  | "skill"
  | "playbook"
  | "template"
  | "default"
  | "mixed";

export type RequirementPriority = "critical" | "required" | "optional";

export interface CanonicalRequirement<T = unknown> {
  id: string;
  value: T | null;
  status: RequirementStatus;
  source: RequirementSource;
  priority: RequirementPriority;
  evidence: string[];
  aliases: string[];
  blocking: boolean;
  /** Human question used when status is missing/conflict. */
  question?: string;
  options?: string[];
  placeholder?: string;
  example?: string;
  reasonRequired?: string;
  /** Why this was assumed (safe default). */
  assumption?: boolean;
}

export interface RequirementConflict {
  id: string;
  requirementId: string;
  type:
    | "mandatory_requirement_conflict"
    | "user_vs_playbook"
    | "user_vs_template"
    | "skill_vs_playbook"
    | "ambiguous_user_instruction"
    | "incompatible_values";
  userValue?: unknown;
  skillValue?: unknown;
  playbookValue?: unknown;
  resolution: "ask_user" | "escalate" | "resolved";
  reason: string;
}

export interface DraftGap {
  requirementId: string;
  reason: string;
  blocking: boolean;
  suggestedQuestionContext?: string;
}

/** Flat map keyed by canonical requirement id. */
export type DraftRequirementsMap = Record<string, CanonicalRequirement>;

export interface DraftRequirementsState {
  byId: DraftRequirementsMap;
  conflicts: RequirementConflict[];
}

/**
 * Alias → canonical id. Resolve before ASK so sccModule and transferMechanism
 * cannot produce two questions.
 */
export const REQUIREMENT_ALIASES: Record<string, string> = {
  // transfers
  sccmodule: "transferMechanism",
  scc_module: "transferMechanism",
  "scc module": "transferMechanism",
  transferbasis: "transferMechanism",
  "transfer basis": "transferMechanism",
  internationaltransfermechanism: "transferMechanism",
  "international transfer mechanism": "transferMechanism",
  datatransfermechanism: "transferMechanism",
  "data transfer mechanism": "transferMechanism",
  transfermechanism: "transferMechanism",
  "transfer mechanism": "transferMechanism",
  ukidta: "transferMechanism",
  uk_idta: "transferMechanism",
  "uk idta": "transferMechanism",
  // categories
  categoriesofpersonaldata: "dataCategories",
  "categories of personal data": "dataCategories",
  personaldatacategories: "dataCategories",
  "personal data categories": "dataCategories",
  categoriesofdata: "dataCategories",
  typesofdata: "dataCategories",
  typesofpersonaldata: "dataCategories",
  phicategories: "dataCategories",
  "phi categories": "dataCategories",
  processeddatatypes: "dataCategories",
  "processed data types": "dataCategories",
  datacategories: "dataCategories",
  // subjects
  datasubjectcategories: "dataSubjects",
  "data subject categories": "dataSubjects",
  categoriesofdatasubjects: "dataSubjects",
  "categories of data subjects": "dataSubjects",
  datasubjects: "dataSubjects",
  "data subjects": "dataSubjects",
  // purpose
  purposeofprocessing: "processingPurpose",
  "purpose of processing": "processingPurpose",
  processingpurpose: "processingPurpose",
  "processing purpose": "processingPurpose",
  natureandpurposeofprocessing: "processingPurpose",
  scopeofprocessing: "processingPurpose",
  // dates
  effectivedate: "effectiveDate",
  "effective date": "effectiveDate",
  startdate: "effectiveDate",
  commencementdate: "effectiveDate",
  agreementdate: "effectiveDate",
  contractdate: "effectiveDate",
  signingdate: "effectiveDate",
  executiondate: "effectiveDate",
  dateofagreement: "effectiveDate",
  msadate: "principalAgreementDate",
  "msa date": "principalAgreementDate",
  dateofmsa: "principalAgreementDate",
  "date of msa": "principalAgreementDate",
  principalagreementdate: "principalAgreementDate",
  "principal agreement date": "principalAgreementDate",
  privacyregime: "privacyRegime",
  "privacy regime": "privacyRegime",
  privacylaw: "privacyRegime",
  "privacy law": "privacyRegime",
  dataprotectionlaw: "privacyRegime",
  "data protection law": "privacyRegime",
  applicableprivacylaw: "privacyRegime",
  complianceframework: "privacyRegime",
  // parties / law
  governinglaw: "governingLaw",
  "governing law": "governingLaw",
  governingjurisdiction: "governingLaw",
  "governing jurisdiction": "governingLaw",
  applicablelaw: "governingLaw",
  "applicable law": "governingLaw",
  choiceoflaw: "governingLaw",
  "choice of law": "governingLaw",
  venue: "governingLaw",
  lawandvenue: "governingLaw",
  governinglawandvenue: "governingLaw",
  "governing law and venue": "governingLaw",
  governinglawandjurisdiction: "governingLaw",
  "governing law and jurisdiction": "governingLaw",
  jurisdictionandgoverninglaw: "governingLaw",
  "jurisdiction and governing law": "governingLaw",
  governingcountry: "governingLaw",
  governingstate: "governingLaw",
  "governing state": "governingLaw",
  governingstateorjurisdiction: "governingLaw",
  governingstateorcountry: "governingLaw",
  statelaw: "governingLaw",
  "state law": "governingLaw",
  statelawandvenue: "governingLaw",
  whichstateslaw: "governingLaw",
  contractlaw: "governingLaw",
  jurisdiction: "governingLaw",
  legalvenue: "governingLaw",
  disputelaw: "governingLaw",
  disputevenue: "governingLaw",
  applicablejurisdiction: "governingLaw",
  law: "governingLaw",
  laws: "governingLaw",
  parties: "parties",
  contractingparties: "parties",
  partyname: "parties",
  partynames: "parties",
  partya: "partyA",
  party1: "partyA",
  partyone: "partyA",
  firstparty: "partyA",
  disclosingparty: "partyA",
  disclosingpartyname: "partyA",
  employer: "partyA",
  employername: "partyA",
  employercompany: "partyA",
  employercompanyname: "partyA",
  legalnameoftheemployer: "partyA",
  datacontroller: "partyA",
  "data controller": "partyA",
  controller: "partyA",
  controllername: "partyA",
  datacontrollername: "partyA",
  legalnameofthedatacontroller: "partyA",
  partyb: "partyB",
  party2: "partyB",
  partytwo: "partyB",
  secondparty: "partyB",
  receivingparty: "partyB",
  receivingpartyname: "partyB",
  dataprocessor: "partyB",
  "data processor": "partyB",
  processor: "partyB",
  processorname: "partyB",
  dataprocessorname: "partyB",
  legalnameofthedataprocessor: "partyB",
  employee: "partyB",
  employeename: "partyB",
  fullnameoftheemployee: "partyB",
  legalnameoftheemployee: "partyB",
  customer: "partyB",
  customername: "partyB",
  client: "partyB",
  clientname: "partyB",
  vendor: "partyB",
  vendorname: "partyB",
  serviceprovider: "partyB",
  serviceprovidername: "partyB",
  datafiduciarylegalname: "dataFiduciaryLegalName",
  "data fiduciary legal name": "dataFiduciaryLegalName",
  legalnameofthedatafiduciary: "dataFiduciaryLegalName",
  "legal name of the data fiduciary": "dataFiduciaryLegalName",
  datafiduciary: "dataFiduciaryLegalName",
  "data fiduciary": "dataFiduciaryLegalName",
  dataprocessorlegalname: "dataProcessorLegalName",
  "data processor legal name": "dataProcessorLegalName",
  datacontrollerlegalname: "dataControllerLegalName",
  "data controller legal name": "dataControllerLegalName",
  // CIN / registration numbers
  cin: "cin",
  organisationregistrationnumberorcinofthdataprocessor: "dataProcessorCin",
  organisationregistrationnumberorcinofthedatafiduciary: "dataFiduciaryCin",
  datafiduciarycin: "dataFiduciaryCin",
  dataprocessorcin: "dataProcessorCin",
  // addresses
  officialregisteredaddressofthedatafiduciary: "dataFiduciaryAddress",
  officialregisteredaddressofthedataprocessor: "dataProcessorAddress",
  datafiduciaryaddress: "dataFiduciaryAddress",
  dataprocessoraddress: "dataProcessorAddress",
  partyaaddress: "partyAAddress",
  partybaddress: "partyBAddress",
  partyaofficeaddress: "partyAAddress",
  partybofficeaddress: "partyBAddress",
  registeredaddressofpartya: "partyAAddress",
  registeredaddressofpartyb: "partyBAddress",
  party1address: "partyAAddress",
  party2address: "partyBAddress",
  clientaddress: "partyAAddress",
  contractoraddress: "partyBAddress",
  addressa: "partyAAddress",
  addressb: "partyBAddress",
  companyaaddress: "partyAAddress",
  companybaddress: "partyBAddress",
  disclosingpartyaddress: "partyAAddress",
  receivingpartyaddress: "partyBAddress",
  // signatories
  signatories: "signatories",
  authorizedsignatories: "signatories",
  // nda / msa
  businesspurpose: "businessPurpose",
  "business purpose": "businessPurpose",
  confidentialitytermyears: "confidentialityTermYears",
  confidentialityperiod: "confidentialityTermYears",
  confidentialityterm: "confidentialityTermYears",
  confidentialityduration: "confidentialityTermYears",
  posttermination: "confidentialityTermYears",
  postterminationperiod: "confidentialityTermYears",
  postterminationduration: "confidentialityTermYears",
  postterminationconfidentiality: "confidentialityTermYears",
  survival: "confidentialityTermYears",
  survivalperiod: "confidentialityTermYears",
  confidentialitysurvival: "confidentialityTermYears",
  ndaterm: "confidentialityTermYears",
  servicesdescription: "servicesDescription",
  // SLAs (optional catalog / extract)
  breachnotification: "breachNotification",
  breachnotificationperiod: "breachNotification",
  breachnotificationsla: "breachNotification",
  breachnoticehours: "breachNotification",
  breachwindow: "breachNotification",
  "breach notification": "breachNotification",
  subprocessornotice: "subprocessorNotice",
  subprocessornoticeperiod: "subprocessorNotice",
  "subprocessor notice": "subprocessorNotice",
  auditnotice: "auditNotice",
  auditnoticeperiod: "auditNotice",
  "audit notice": "auditNotice",
  deletionreturn: "deletionReturn",
  deletionorreturn: "deletionReturn",
  "deletion return": "deletionReturn",
  liabilitycap: "liabilityCap",
  limitationofliability: "liabilityCap",
};

/** Normalize a free-form field name to a canonical requirement id. */
export function canonicalizeFieldId(field: string): string {
  const trimmed = field.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const spaced = trimmed.toLowerCase().replace(/\s+/g, " ").trim();

  const directHit =
    REQUIREMENT_ALIASES[compact] ||
    REQUIREMENT_ALIASES[spaced] ||
    REQUIREMENT_ALIASES[trimmed.toLowerCase()];
  if (directHit) return directHit;

  // Try stripping common prefixes like "the", "applicable", "chosen", "selected", "nameof", "legalnameof"
  const stripped = compact.replace(
    /^(the|applicable|chosen|selected|target|intended|primary|required|proposed|legalnameofth|nameofth|legalnameof|nameof)/,
    ""
  );
  if (stripped && stripped !== compact && REQUIREMENT_ALIASES[stripped]) {
    return REQUIREMENT_ALIASES[stripped];
  }

  if (
    /^(?:governing.*(?:law|jurisdiction|venue|state|country)|(?:law|jurisdiction|venue|state).*governing|choice.*of.*law|applicable.*(?:law|jurisdiction)|legal.*venue|statelaw|whichstateslaw)/.test(
      compact
    )
  ) {
    return "governingLaw";
  }

  return trimmed;
}
