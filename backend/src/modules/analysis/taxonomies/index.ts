/**
 * Versioned risk taxonomy — authored enumeration; never invented at runtime.
 * Commercial ids live here. GDPR-scoped ids live on the privacy skill and in
 * GDPR_RISK_CATEGORY; critique validates against state.mergedRiskCategories.
 */
export const RISK_TAXONOMY_VERSION = "1.1.0";

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

/** Privacy-skill DSR categories — documented here; authored on privacy-gdpr-dpa. */
export const GDPR_RISK_CATEGORY = [
  "dsr_generic_no_named_rights",
  "dsr_no_response_timeframe",
  "erasure_termination_only_gap",
  "portability_format_unaddressed",
  "automated_decision_gap",
  "recipient_notification_gap",
  "assistance_cost_or_consent_gate_risk",
] as const;

export type GdprRiskCategoryId = (typeof GDPR_RISK_CATEGORY)[number];

export function isRiskTaxonomyId(value: string): value is RiskTaxonomyId {
  return (RISK_TAXONOMY as readonly string[]).includes(value);
}

export function isGdprRiskCategory(value: string): value is GdprRiskCategoryId {
  return (GDPR_RISK_CATEGORY as readonly string[]).includes(value);
}
