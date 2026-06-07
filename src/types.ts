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

// PrivSecAI - Cookie Scanner Type Schema
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
}

// PrivSecAI - Vulnerability Scanner Type Schema
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

