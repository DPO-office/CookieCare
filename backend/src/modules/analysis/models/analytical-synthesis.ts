export interface AnalyticalTheme {
  title: string;
  citedRequirementIds: string[];
  analysis: string;
}

export interface AnalyticalMaterialRisk {
  requirementId: string;
  whyItMatters: string;
}

/**
 * Counsel-level interpretation of locked findings. Must not change status,
 * invent gaps/evidence, or add recommendation kinds.
 */
export interface AnalyticalSynthesis {
  overallAssessment: string;
  keyThemes: AnalyticalTheme[];
  substantiveVsDrafting: string;
  materialRisks: AnalyticalMaterialRisk[];
  residualUncertainty: string;
  citedRequirementIds: string[];
  /** Deterministic count/rollup injected for the writer. */
  factRollup: string;
}
