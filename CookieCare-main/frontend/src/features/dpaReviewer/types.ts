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
}

export interface Recommendation {
  category: string;
  icon: ReactNode;
  accent: string;
  items: string[];
}
