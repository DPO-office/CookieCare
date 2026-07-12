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
}

export interface ComplianceItem {
  label: string;
  status: "compliant" | "partial" | "missing" | "na";
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
