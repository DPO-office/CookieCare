export interface CritiqueResult {
  itemId: string;
  status: "pass" | "fail" | "missing" | "ambiguous";
  evidenceQuote?: string;
  evidenceVerified: boolean;
}

export interface FixItem {
  workUnitId: string;
  instruction: string;
  sourceChecklistItemId: string;
}

export interface CritiqueReport {
  isGreen: boolean;
  iteration: number;
  results: CritiqueResult[];
  fixPlan: FixItem[];
  skeletonMismatch: boolean;
  criticalFactSurfaced?: boolean;
}
