/**
 * Shared types for the enterprise report generation system.
 * Used by DPA Review, Vendor Review, and AI Ethics Assessment modules.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ReportFinding {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  description: string;
  recommendation: string;
  evidence?: string;
  articleReference?: string;
}

export interface ReportRecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  items: string[];
}

export interface ReportScoreItem {
  label: string;
  score: number;
}

export interface ReportStrength {
  text: string;
}

export interface ReportMetadata {
  reportTitle: string;
  assessmentType: string;
  documentName: string;
  generatedBy: string;
  generatedOn: string;
}

export interface EnterpriseReportData {
  metadata: ReportMetadata;
  overallScore: number;
  overallRisk: RiskLevel;
  executiveSummary: string;
  strengths: string[];
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  scoreBreakdown: ReportScoreItem[];
  /** Optional additional info rows for the report info section */
  additionalInfo?: { label: string; value: string }[];
  /** Enterprise consent comparison data (cookie scanner only) */
  consentComparison?: {
    preConsentCount: number;
    acceptCount: number;
    rejectCount: number;
    addedAfterAccept: { name: string; category: string; domain: string; severity: string; partyType: string }[];
    removedAfterReject: { name: string; category: string; domain: string; severity: string; partyType: string }[];
    marketingEnabledAfterAccept: { name: string; category: string; domain: string; severity: string; partyType: string }[];
    analyticsEnabledAfterAccept: { name: string; category: string; domain: string; severity: string; partyType: string }[];
    stillPresentAfterReject: { name: string; category: string; domain: string; severity: string; partyType: string }[];
    complianceSummary: string;
  };
}
