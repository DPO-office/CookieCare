import type { ReactNode } from "react";
import { AnalysisAppState, SharedAnalysisStep } from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

// ─── Individual finding ───────────────────────────────────────────────────────

export interface EthicsFinding {
  id: string;
  title?: string;
  /** Used as display label; some legacy paths use "category" as the title */
  category: string;
  severity?: "low" | "medium" | "high" | "critical";
  status: "passed" | "needs-improvement" | "warning" | "high-risk";
  description: string;
  evidence?: string;
  recommendation: string;
}

// ─── Recommendation section ───────────────────────────────────────────────────

export interface EthicsRecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  /** Icon and accent are injected by the UI layer from constants */
  icon?: ReactNode;
  accent?: string;
  items: string[];
}

// ─── Score breakdown (8 axes) ─────────────────────────────────────────────────

export interface AIEthicsScoreBreakdown {
  aiGovernance:      number;
  transparency:      number;
  fairness:          number;
  accountability:    number;
  privacyProtection: number;
  humanOversight:    number;
  explainability:    number;
  riskManagement:    number;
}

// ─── Per-dimension evaluation ─────────────────────────────────────────────────

export interface AIEthicsDimension {
  dimension: string;
  score: number;
  status: "strong" | "adequate" | "weak" | "absent";
  notes?: string;
}

// ─── Standards alignment ──────────────────────────────────────────────────────

export interface StandardAlignment {
  standard: string;
  alignment: "strong" | "partial" | "weak" | "absent";
  gaps?: string[];
}

// ─── Full result returned by the backend ai_ethics_review job ─────────────────

export interface AIEthicsReviewResult {
  overallScore:      number;
  overallRisk:       "low" | "medium" | "high" | "critical";
  summary:           string;
  findings:          EthicsFinding[];
  recommendations:   EthicsRecommendation[];
  strengths:         string[];
  concerns:          string[];
  scoreBreakdown:    AIEthicsScoreBreakdown;
  ethicsDimensions:  AIEthicsDimension[];
  standardAlignment?: StandardAlignment[];
}
