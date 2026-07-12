import type { ReactNode } from "react";
import { AnalysisAppState, SharedAnalysisStep } from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

export interface EthicsFinding {
  id: string;
  category: string;
  status: "passed" | "needs-improvement" | "warning" | "high-risk";
  description: string;
  recommendation: string;
}

export interface EthicsRecommendation {
  category: string;
  icon: ReactNode;
  accent: string;
  items: string[];
}
