import type { ComponentType } from "react";
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

export type {
  AIEthicsReviewResult,
  EthicsFinding,
  EthicsRecommendation,
  AIEthicsScoreBreakdown,
  AIEthicsDimension,
  StandardAlignment,
};

export type EthicsDimensionId =
  | "fairness"
  | "transparency"
  | "accountability"
  | "privacy"
  | "oversight"
  | "risk";

export interface EthicsResultDimension {
  id: EthicsDimensionId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  scoreKey: keyof AIEthicsScoreBreakdown | null;
  keywords: string[];
}
