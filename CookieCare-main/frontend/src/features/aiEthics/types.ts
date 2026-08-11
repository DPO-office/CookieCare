import type { ReactNode } from "react";
import {
  AnalysisAppState,
  SharedAnalysisStep,
  AIEthicsReviewResult,
  EthicsFinding,
  EthicsRecommendation,
  AIEthicsScoreBreakdown,
  AIEthicsDimension,
  StandardAlignment,
} from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

// Re-export result types from shared/types so internal feature imports continue to work
export type {
  AIEthicsReviewResult,
  EthicsFinding,
  EthicsRecommendation,
  AIEthicsScoreBreakdown,
  AIEthicsDimension,
  StandardAlignment,
};
