import type { AnalysisState } from "../models/analysis-state.js";
import type {
  Finding,
  FindingPerspective,
  FindingPolarity,
} from "../models/finding.js";

export function normalizePartyPerspective(
  value: string | null | undefined
): FindingPerspective {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "unspecified";
  if (/\b(mutual|both|each party|either party)\b/.test(normalized)) return "mutual";
  if (/\b(controller)\b/.test(normalized)) return "controller";
  if (/\b(processor)\b/.test(normalized)) return "processor";
  if (/\b(customer|client|buyer|purchaser)\b/.test(normalized)) return "customer";
  if (/\b(supplier|vendor|provider|seller)\b/.test(normalized)) return "supplier";
  return "unspecified";
}

export function defaultFindingPolarity(finding: Finding): FindingPolarity {
  if (finding.kind === "risk") {
    return finding.judgement?.nli === "contradicted"
      ? "control_present"
      : "risk_present";
  }
  if (finding.kind === "compliance") return "compliance_met";
  return "neutral_fact";
}

/**
 * Runtime compatibility boundary for older handlers and persisted sessions.
 * New producers should stamp both fields directly; this guarantees that every
 * finding consumed by LOCK/RENDER nevertheless has explicit semantics.
 */
export function normalizeFindingSemantics(
  findings: Finding[],
  state?: Pick<AnalysisState, "intent">
): Finding[] {
  const perspective = normalizePartyPerspective(state?.intent?.partyPerspective);
  return findings.map((finding) => ({
    ...finding,
    polarity: finding.polarity ?? defaultFindingPolarity(finding),
    partyPerspective: finding.partyPerspective ?? perspective,
  }));
}

export function isConfirmedRiskFinding(finding: Finding): boolean {
  return (
    finding.kind === "risk" &&
    finding.visibility !== "internal" &&
    !finding.relatedNotRequested &&
    finding.status === "present" &&
    (finding.polarity ?? defaultFindingPolarity(finding)) === "risk_present" &&
    (finding.verifiedByProposition !== true || finding.judgement?.nli === "entailed")
  );
}

export function isProtectiveFinding(finding: Finding): boolean {
  return (
    finding.kind === "risk" &&
    finding.visibility !== "internal" &&
    ((finding.polarity ?? defaultFindingPolarity(finding)) === "control_present" ||
      finding.judgement?.nli === "contradicted")
  );
}
