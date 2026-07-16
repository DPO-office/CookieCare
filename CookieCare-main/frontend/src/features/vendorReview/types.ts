import type { ReactNode, ComponentType } from "react";
import { AnalysisAppState, SharedAnalysisStep } from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

export interface VendorFinding {
  id: string;
  category: string;
  status: "passed" | "warning" | "missing" | "high-risk";
  description: string;
  recommendation: string;
  tag?: string;
  // Real backend fields
  title?: string;
  severity?: "low" | "medium" | "high" | "critical";
  evidence?: string;
}

export interface ComplianceItem {
  label: string;
  status: "compliant" | "partial" | "missing" | "na";
  notes?: string;
}

export interface RecommendationSection {
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ReactNode;
  accent: string;
  items: string[];
}

export interface UploadedFileEntry {
  file: File;
  id: string;
}

export interface FeatureCard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  title: string;
  description: string;
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

/** Full structured result returned by the backend vendor_review job */
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
  compliance: ComplianceItem[];
  scoreBreakdown: VendorScoreBreakdown;
}
