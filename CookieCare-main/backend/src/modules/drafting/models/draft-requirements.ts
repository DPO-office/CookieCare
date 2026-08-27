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
  transfermechanism: "transferMechanism",
  ukidta: "transferMechanism",
  "uk idta": "transferMechanism",
  // categories
  categoriesofpersonaldata: "dataCategories",
  "categories of personal data": "dataCategories",
  personaldatacategories: "dataCategories",
  "personal data categories": "dataCategories",
  phicategories: "dataCategories",
  "phi categories": "dataCategories",
  processeddatatypes: "dataCategories",
  "processed data types": "dataCategories",
  datacategories: "dataCategories",
  // subjects
  datasubjectcategories: "dataSubjects",
  "data subject categories": "dataSubjects",
  datasubjects: "dataSubjects",
  // purpose
  purposeofprocessing: "processingPurpose",
  "purpose of processing": "processingPurpose",
  processingpurpose: "processingPurpose",
  // dates
  effectivedate: "effectiveDate",
  msadate: "principalAgreementDate",
  "msa date": "principalAgreementDate",
  dateofmsa: "principalAgreementDate",
  "date of msa": "principalAgreementDate",
  principalagreementdate: "principalAgreementDate",
  // parties / law
  governinglaw: "governingLaw",
  jurisdiction: "governingLaw",
  parties: "parties",
  partya: "parties",
  partyb: "parties",
  // nda / msa
  businesspurpose: "businessPurpose",
  confidentialitytermyears: "confidentialityTermYears",
  servicesdescription: "servicesDescription",
  // SLAs (optional catalog / extract)
  breachnotification: "breachNotification",
  subprocessornotice: "subprocessorNotice",
  "subprocessor notice": "subprocessorNotice",
  auditnotice: "auditNotice",
  deletionreturn: "deletionReturn",
};

/** Normalize a free-form field name to a canonical requirement id. */
export function canonicalizeFieldId(field: string): string {
  const trimmed = field.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const spaced = trimmed.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    REQUIREMENT_ALIASES[compact] ||
    REQUIREMENT_ALIASES[spaced] ||
    REQUIREMENT_ALIASES[trimmed.toLowerCase()] ||
    trimmed
  );
}
