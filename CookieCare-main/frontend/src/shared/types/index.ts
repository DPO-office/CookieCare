export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Version {
  version: number;
  content: string;
  createdAt: string;
  author: string;
  comment: string;
}

export interface Signature {
  signerEmail: string;
  signedAt: string | null;
  signatureHash: string | null;
  status: "pending" | "signed";
}

export interface RedlineProposal {
  id: string;
  proposedByEmail: string;
  proposedAt: string;
  originalText: string;
  proposedText: string;
  comment: string;
  status: "pending" | "accepted" | "rejected";
}

export interface AuditLog {
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export interface RiskAnalysis {
  id: string;
  clause: string;
  severity: "low" | "medium" | "high";
  description: string;
  actionableInsight: string;
}

export interface ComplianceGap {
  regulation: string;
  complianceState: "compliant" | "gap";
  notes: string;
}

export interface DocumentAnalysis {
  summary: string;
  risks: RiskAnalysis[];
  complianceGaps: ComplianceGap[];
}

export interface LegalDocument {
  id: string;
  title: string;
  type: "NDA" | "DPA" | "SLA" | "Custom";
  creatorId: string;
  creatorEmail: string;
  content: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
  versions: Version[];
  signatures: Signature[];
  redlines: RedlineProposal[];
  sharedWith: string[];
  auditLogs: AuditLog[];
  analysis?: DocumentAnalysis | null;
}

// randtrust - Cookie Scanner Type Schema
export interface CookieDetected {
  name: string;
  category: "Functional" | "Analytics" | "Marketing" | "Essential";
  domain: string;
  retention: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface PrivacyComplianceGap {
  id: string;
  regulation: "GDPR" | "CCPA" | "DPDP";
  severity: "RED" | "YELLOW" | "GREEN";
  issue: string;
  remediation: string;
}

export interface CookieScanResult {
  scanSummary: {
    url: string;
    level: string;
    overallScore: number;
    scannedAt: string;
    hasConsentBanner: boolean;
    loadsBeforeConsent: boolean;
    totalCookiesCount: number;
  };
  cookiesDetected: CookieDetected[];
  complianceGaps: PrivacyComplianceGap[];
  enterpriseReport?: {
    consentComparison?: {
      preConsentCount: number;
      acceptCount: number;
      rejectCount: number;
      addedAfterAccept: ConsentComparisonCookie[];
      removedAfterReject: ConsentComparisonCookie[];
      marketingEnabledAfterAccept: ConsentComparisonCookie[];
      analyticsEnabledAfterAccept: ConsentComparisonCookie[];
      stillPresentAfterReject: ConsentComparisonCookie[];
      complianceSummary: string;
    };
    [key: string]: any;
  };
}

export interface ConsentComparisonCookie {
  name: string;
  category: string;
  domain: string;
  severity: string;
  partyType: string;
}

// randtrust - Vulnerability Scanner Type Schema
export interface VulnerabilityCheck {
  id: string;
  name: string;
  status: "SECURE" | "WARNING" | "CRITICAL";
  category: "SSL/TLS" | "Security Headers" | "Network Port" | "DNS Audit";
  details: string;
  remediation: string;
}

export interface VulnerabilityScanResult {
  url: string;
  scannedAt: string;
  overallHealth: number; // 0-100 score
  sslCertValid: boolean;
  tlsVersion: string;
  checks: VulnerabilityCheck[];
  remediationRoadmap: string;
}

// ··· Shared Analysis Lifecycle Types ·······································
// Used by dpaReviewer, vendorReview, and aiEthics features.

export type AnalysisAppState = "upload" | "analyzing" | "results";

export interface SharedAnalysisStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

// ··· DPA Review Result ·················································
// Moved here from features/dpaReviewer/types so that shared/report/reportAdapters
// can import it without creating a shared → feature dependency.

export interface DPAFinding {
  id: string;
  clause: string;
  status: "compliant" | "warning" | "missing";
  description: string;
  recommendation: string;
  article?: string;
  severity?: "low" | "medium" | "high";
  articleReference?: string;
}

export interface DPARecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  items: string[];
}

export interface DPAMissingClause {
  clauseName: string;
  articleReference?: string;
  reason: string;
  recommendation: string;
}

export interface DPAScoreBreakdown {
  article28Compliance: number;
  processorObligations: number;
  securityMeasures: number;
  dataSubjectRights: number;
  internationalTransfers: number;
  subprocessorControls: number;
}

export interface DPAReviewResult {
  overallScore: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  findings: DPAFinding[];
  recommendations: DPARecommendation[];
  missingClauses: DPAMissingClause[];
  scoreBreakdown: DPAScoreBreakdown;
}

// ··· Vendor Review Result ···············································
// Moved here from features/vendorReview/types.

export interface VendorFinding {
  id: string;
  category: string;
  status: "passed" | "warning" | "missing" | "high-risk";
  description: string;
  recommendation: string;
  tag?: string;
  title?: string;
  severity?: "low" | "medium" | "high" | "critical";
  evidence?: string;
}

export interface VendorCertification {
  name: string;
  status: "confirmed" | "claimed" | "expired" | "missing";
  details?: string;
}

export interface VendorScoreBreakdown {
  privacyPosture: number;
  securityPosture: number;
  gdprCompliance: number;
  ccpaCompliance: number;
  contractualRisk: number;
  vendorTransparency: number;
}

export interface VendorInfo {
  name?: string;
  industry?: string;
  headquarters?: string;
  dataRegions?: string;
  primaryServices?: string;
}

export interface VendorRecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  items: string[];
}

export interface VendorComplianceItem {
  label: string;
  status: "compliant" | "partial" | "missing" | "na";
  notes?: string;
}

export interface VendorReviewResult {
  overallScore: number;
  overallRisk: "low" | "medium" | "high" | "critical";
  summary: string;
  vendorInfo?: VendorInfo;
  findings: VendorFinding[];
  recommendations: VendorRecommendation[];
  strengths: string[];
  concerns: string[];
  certifications: VendorCertification[];
  compliance: VendorComplianceItem[];
  scoreBreakdown: VendorScoreBreakdown;
}

// ··· AI Ethics Review Result ············································
// Moved here from features/aiEthics/types.

export interface EthicsFinding {
  id: string;
  title?: string;
  category: string;
  severity?: "low" | "medium" | "high" | "critical";
  status: "passed" | "needs-improvement" | "warning" | "high-risk";
  description: string;
  evidence?: string;
  recommendation: string;
}

export interface EthicsRecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  items: string[];
}

export interface AIEthicsScoreBreakdown {
  aiGovernance: number;
  transparency: number;
  fairness: number;
  accountability: number;
  privacyProtection: number;
  humanOversight: number;
  explainability: number;
  riskManagement: number;
}

export interface AIEthicsDimension {
  dimension: string;
  score: number;
  status: "strong" | "adequate" | "weak" | "absent";
  notes?: string;
}

export interface StandardAlignment {
  standard: string;
  alignment: "strong" | "partial" | "weak" | "absent";
  gaps?: string[];
}

export interface AIEthicsReviewResult {
  overallScore: number;
  overallRisk: "low" | "medium" | "high" | "critical";
  summary: string;
  findings: EthicsFinding[];
  recommendations: EthicsRecommendation[];
  strengths: string[];
  concerns: string[];
  scoreBreakdown: AIEthicsScoreBreakdown;
  ethicsDimensions: AIEthicsDimension[];
  standardAlignment?: StandardAlignment[];
}
