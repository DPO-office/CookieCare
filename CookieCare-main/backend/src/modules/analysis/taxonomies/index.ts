/**
 * Versioned risk taxonomy — authored enumeration; never invented at runtime.
 */
export const RISK_TAXONOMY_VERSION = "1.0.0";

export const RISK_TAXONOMY = [
  "uncapped_liability",
  "unilateral_termination",
  "missing_carve_out",
  "ambiguous_definition",
  "one_sided_indemnity",
  "broad_indemnity",
  "missing_limitation_of_liability",
  "missing_indemnity",
  "unlimited_consequential_damages",
  "auto_renewal_trap",
  "weak_confidentiality",
  "unfavorable_governing_law",
  "assignment_without_consent",
  "other_known_risk",
] as const;

export type RiskTaxonomyId = (typeof RISK_TAXONOMY)[number];

export function isRiskTaxonomyId(value: string): value is RiskTaxonomyId {
  return (RISK_TAXONOMY as readonly string[]).includes(value);
}
