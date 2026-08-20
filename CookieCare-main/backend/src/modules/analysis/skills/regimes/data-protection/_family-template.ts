import type { RightsMatrixRow } from "../../types.js";

const PREFERRED_CLAUSE_TYPES = [
  "data_subject_request_handling",
  "processor_assistance_obligation",
  "data_protection",
];

const REGIME_DEFAULTS: Record<string, { regimeLabel: string; skillId: string }> = {
  gdpr: {
    regimeLabel: "GDPR",
    skillId: "regimes/data-protection/gdpr",
  },
  "uk-gdpr": {
    regimeLabel: "UK GDPR",
    skillId: "regimes/data-protection/uk-gdpr-idta",
  },
};

const AUTOMATED_DECISION_GATE = {
  contextRegex:
    "\\b(automated decision|solely automated|profil(?:e|ing)|algorithmic decision|human review|article 22)\\b",
  absentClaim:
    "The agreement contains no language showing that solely automated decision-making with legal or similarly significant effects is involved. If such processing is in scope, Article 22 exceptions and safeguards should be addressed.",
  absentGap:
    "Insufficient evidence to confirm that Article 22 applies; add safeguards only if qualifying automated decision-making is involved.",
  absentSeverity: "medium" as const,
  llmGuidance:
    "For this row, do not assert a confirmed automated-decision gap unless the clauses evidence solely automated decision-making, profiling, algorithmic decisions, or related safeguards. If none appears, state that applicability is unconfirmed and hedge any recommendation conditionally.",
};

function findingCategoryForMatrixRow(rowId: string): string {
  if (rowId.includes("access")) return "dsr_generic_no_named_rights";
  if (rowId.includes("erasure")) return "erasure_termination_only_gap";
  if (rowId.includes("portability")) return "portability_format_unaddressed";
  if (rowId.includes("automated")) return "automated_decision_gap";
  return "dsr_assistance_not_operational";
}

/**
 * Family template for data-protection regimes — next privacy-law skill should
 * call this instead of hand-rolling matrix row shape.
 */
export function buildDataProtectionRightsMatrix(
  regimeId: string,
  rightsMap: {
    rowId: string;
    localArticleOrSection: string;
    label: string;
    plainDescription?: string;
  }[]
): RightsMatrixRow[] {
  const defaults = REGIME_DEFAULTS[regimeId];
  return rightsMap.map((r) => ({
    rowId: r.rowId,
    article: r.localArticleOrSection,
    label: r.label,
    plainDescription: r.plainDescription,
    family: "data-protection",
    regimeId,
    findingCategory: findingCategoryForMatrixRow(r.rowId),
    preferredClauseTypes: PREFERRED_CLAUSE_TYPES,
    regimeLabel: defaults?.regimeLabel ?? regimeId,
    skillId: defaults?.skillId,
    ...(r.rowId.includes("automated") ? { applicabilityGate: AUTOMATED_DECISION_GATE } : {}),
  }));
}
