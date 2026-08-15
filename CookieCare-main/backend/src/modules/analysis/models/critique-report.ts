export interface CritiqueResult {
  itemId: string;
  status: "pass" | "fail" | "missing" | "ambiguous";
  evidenceQuote?: string;
  evidenceVerified: boolean;
  findingId?: string;
  workUnitId?: string;
  detail?: string;
}

export interface FixItem {
  workUnitId: string;
  instruction: string;
  sourceItemId: string;
}

export interface CritiqueReport {
  isGreen: boolean;
  iteration: number;
  results: CritiqueResult[];
  fixPlan: FixItem[];
  /** Intent classification itself was wrong → full replan. */
  skeletonMismatch: boolean;
  criticalFactSurfaced?: boolean;
}
