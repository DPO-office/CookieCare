export interface ComplianceEvent {
  event: string;
  analysisId: string;
  timestamp: string;
  checkId?: string;
  requirementId?: string;
  [key: string]: unknown;
}
export type ComplianceEventSink = (event: ComplianceEvent) => void;
