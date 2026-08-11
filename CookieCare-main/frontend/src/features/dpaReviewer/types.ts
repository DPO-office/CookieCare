import type { ReactNode } from "react";
import {
  AnalysisAppState,
  SharedAnalysisStep,
  DPAReviewResult,
  DPAFinding,
  DPARecommendation,
  DPAMissingClause,
  DPAScoreBreakdown,
} from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

// Re-export result types from shared/types so internal feature imports continue to work
export type {
  DPAReviewResult,
  DPAFinding as Finding,
  DPARecommendation,
  DPAMissingClause,
  DPAScoreBreakdown,
};

export interface Recommendation {
  category: string;
  icon: ReactNode;
  accent: string;
  items: string[];
}
