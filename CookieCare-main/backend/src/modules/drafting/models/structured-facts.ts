export interface StructuredFacts {
  documentType?: string;
  governingLaw?: string;
  parties?: string[];
  partyA?: string;
  partyB?: string;
  roleA?: string;
  roleB?: string;
  industry?: string;
  language?: string;
  effectiveDate?: string;
  principalAgreementDate?: string;
  phiInvolved?: boolean;
  dataTransfer?: string;
  transferMechanism?: string;
  sccModule?: string;
  ukIdta?: boolean;
  processingPurpose?: string;
  dataCategories?: string;
  dataSubjects?: string;
  businessPurpose?: string;
  confidentialityTermYears?: string;
  servicesDescription?: string;
  breachNotification?: string;
  subprocessorNotice?: string;
  auditNotice?: string;
  deletionReturn?: string;
  /** Explicit exclusions from the user (clause/topic keys). */
  excludedRequirements?: string[];
  /** Free-form overlays from structured intake API */
  [key: string]: unknown;
}

/** Optional structured intake fields that pre-populate facts before PLAN. */
export interface StructuredIntakeOverlay {
  documentType?: string;
  governingLaw?: string;
  phiInvolved?: boolean;
  partyCount?: number;
  parties?: string[];
}
