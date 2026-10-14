import type { ReactNode, ComponentType } from "react";
import {
  AnalysisAppState,
  SharedAnalysisStep,
  VendorReviewResult,
  VendorFinding,
  VendorCertification,
  VendorScoreBreakdown,
  VendorInfo,
  VendorRecommendation,
  VendorComplianceItem,
} from "../../shared/types";

export type AppState = AnalysisAppState;
export type AnalysisStep = SharedAnalysisStep;

// Re-export result types from shared/types so internal feature imports continue to work
export type {
  VendorReviewResult,
  VendorFinding,
  VendorCertification,
  VendorScoreBreakdown,
  VendorInfo,
  VendorRecommendation,
  VendorComplianceItem as ComplianceItem,
};

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

export type VendorDimensionId =
  | "privacy"
  | "security"
  | "compliance"
  | "residency"
  | "subprocessors"
  | "risk";

export interface VendorResultDimension {
  id: VendorDimensionId;
  title: string;
  description: string;
  icon: ComponentType<any>;
  scoreKey: keyof VendorScoreBreakdown | null;
  keywords: string[];
}
