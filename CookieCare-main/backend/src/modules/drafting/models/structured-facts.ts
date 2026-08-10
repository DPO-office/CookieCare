export interface StructuredFacts {
  documentType?: string;
  governingLaw?: string;
  parties?: string[];
  partyA?: string;
  partyB?: string;
  industry?: string;
  language?: string;
  effectiveDate?: string;
  phiInvolved?: boolean;
  dataTransfer?: string;
  transferMechanism?: string;
  sccModule?: string;
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
