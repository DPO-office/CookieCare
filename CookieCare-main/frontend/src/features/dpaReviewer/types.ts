import type { ReactNode } from "react";
import { AnalysisAppState, SharedAnalysisStep } from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

export interface Finding {
  id: string;
  clause: string;
  status: "compliant" | "warning" | "missing";
  description: string;
  recommendation: string;
  article?: string;
  // Additional fields returned from the backend (not used by legacy mock but present in real results)
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

/** Full structured result returned by the backend DPA review job */
export interface DPAReviewResult {
  overallScore: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  findings: Finding[];
  recommendations: DPARecommendation[];
  missingClauses: DPAMissingClause[];
  scoreBreakdown: DPAScoreBreakdown;
}

export interface Recommendation {
  category: string;
  icon: ReactNode;
  accent: string;
  items: string[];
}
