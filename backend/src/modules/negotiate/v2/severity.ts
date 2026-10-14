/**
 * Deterministic L / N / P severity model (V2 Stage 6).
 *
 * Three SEPARATE axes — never collapsed:
 *   L  legal/privacy severity  → the RED/YELLOW/GREEN band (auditable decision list)
 *   N  commercial negotiability → how likely the counterparty moves
 *   P  negotiation priority     → attention budget = rank(L, impact, N)
 *
 * The LLM only supplies boolean FACTORS; the mapping below is pure code, so
 * severity is reproducible and comparable across clauses. No model-emitted
 * severity numbers are trusted.
 */
import { SeverityFactors, SeverityBand, Negotiability, FindingTier } from "./types.js";

/** L — auditable decision list. Monotone: a risk factor never lowers L. */
export function computeLegalSeverity(f: SeverityFactors): SeverityBand {
  // GREEN dominates: market-standard / out-of-scope / cosmetic language is not a risk.
  if (f.marketStandardLanguage || f.outOfScopeForDocType || f.purelyCosmetic) return "GREEN";
  // RED anchors: the high-severity conditions. Absence is RED only when the
  // missing term is regulatorily mandated (a missing minor clause is YELLOW).
  if (
    f.uncappedOrBroadExposure ||
    f.internationalTransferRisk ||
    (f.absenceOfRequiredTerm && f.regulatoryMandatedTerm) ||
    f.irreversibleOrHardToRemedy ||
    (f.regulatoryMandatedTerm && f.specialCategoryData)
  ) {
    return "RED";
  }
  // Everything else that was flagged is a negotiable imbalance.
  return "YELLOW";
}

/** N — negotiability. Independent of L. */
export function computeNegotiability(f: SeverityFactors): Negotiability {
  if (f.marketStandardLanguage || f.outOfScopeForDocType) return "low";
  // Uncapped exposure / non-adequate transfers are severe but a counterparty
  // often resists moving on them → lower negotiability than a simple imbalance.
  if (f.uncappedOrBroadExposure || f.internationalTransferRisk) return "medium";
  // One-sided-but-ordinary imbalances (notice windows, deadlines) move easily.
  if (f.unilateralOrOneSidedRight || f.absenceOfRequiredTerm) return "high";
  return "medium";
}

const L_BASE: Record<SeverityBand, number> = { RED: 100, YELLOW: 60, GREEN: 15 };
const N_ADJ: Record<Negotiability, number> = { high: 8, medium: 3, low: -5 };

/**
 * P — priority score 0..100. Ranks by L first (dominant), nudged by
 * negotiability. Business impact is approximated by the RED/absence anchors.
 */
export function computePriority(L: SeverityBand, N: Negotiability, f: SeverityFactors): number {
  let p = L_BASE[L] + N_ADJ[N];
  if (f.absenceOfRequiredTerm && f.regulatoryMandatedTerm) p += 4; // structural regulatory gap
  return Math.max(0, Math.min(100, Math.round(p)));
}

export const PRIMARY_PRIORITY_THRESHOLD = 45;

/** GREEN is always minor (no redline); otherwise tier by priority. */
export function computeTier(L: SeverityBand, priority: number): FindingTier {
  if (L === "GREEN") return "minor";
  return priority >= PRIMARY_PRIORITY_THRESHOLD ? "primary" : "minor";
}

export interface LNP {
  L: SeverityBand;
  N: Negotiability;
  priority: number;
  tier: FindingTier;
}

export function computeLNP(f: SeverityFactors): LNP {
  const L = computeLegalSeverity(f);
  const N = computeNegotiability(f);
  const priority = computePriority(L, N, f);
  const tier = computeTier(L, priority);
  return { L, N, priority, tier };
}
