import type { Finding, DPAScoreBreakdown } from "../types";
import {
  RESULT_DIMENSIONS,
  type DPADimensionId,
  type DPAResultDimension,
} from "../constants";

export type DimensionStatus = "strong" | "partial" | "critical";

export interface DimensionResult {
  dimension: DPAResultDimension;
  score: number;
  status: DimensionStatus;
  statusLabel: string;
  findings: Finding[];
  compliantCount: number;
  warningCount: number;
  missingCount: number;
}

function haystack(finding: Finding): string {
  return [
    finding.clause,
    finding.article,
    finding.articleReference,
    finding.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Assign each finding to the best-matching dimension (first keyword hit by dimension priority). */
export function categorizeFindings(findings: Finding[]): Record<DPADimensionId, Finding[]> {
  const buckets: Record<DPADimensionId, Finding[]> = {
    gdpr: [],
    processor: [],
    rights: [],
    security: [],
    transfers: [],
    risk: [],
  };

  const claimed = new Set<string>();

  for (const dim of RESULT_DIMENSIONS) {
    for (const finding of findings) {
      if (claimed.has(finding.id)) continue;
      const text = haystack(finding);
      if (dim.keywords.some((kw) => text.includes(kw))) {
        buckets[dim.id].push(finding);
        claimed.add(finding.id);
      }
    }
  }

  // Unmatched findings → Risk Assessment (catch-all for gaps)
  for (const finding of findings) {
    if (!claimed.has(finding.id)) {
      buckets.risk.push(finding);
      claimed.add(finding.id);
    }
  }

  return buckets;
}

function statusFromScore(score: number): { status: DimensionStatus; statusLabel: string } {
  if (score >= 70) return { status: "strong", statusLabel: "Strong" };
  if (score >= 45) return { status: "partial", statusLabel: "Needs work" };
  return { status: "critical", statusLabel: "Missing" };
}

function scoreFromFindings(findings: Finding[]): number {
  if (findings.length === 0) return 50;
  const weights = findings.map((f) => {
    if (f.status === "compliant") return 100;
    if (f.status === "warning") return f.severity === "high" ? 25 : 45;
    return 10; // missing
  });
  return Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
}

export function buildDimensionResults(
  findings: Finding[],
  scoreBreakdown?: DPAScoreBreakdown | null,
): DimensionResult[] {
  const buckets = categorizeFindings(findings);

  // Average of breakdown scores for Risk Assessment when no dedicated key
  const breakdownValues = scoreBreakdown
    ? [
        scoreBreakdown.article28Compliance,
        scoreBreakdown.processorObligations,
        scoreBreakdown.securityMeasures,
        scoreBreakdown.dataSubjectRights,
        scoreBreakdown.internationalTransfers,
        scoreBreakdown.subprocessorControls,
      ]
    : [];
  const avgBreakdown =
    breakdownValues.length > 0
      ? Math.round(breakdownValues.reduce((a, b) => a + b, 0) / breakdownValues.length)
      : null;

  return RESULT_DIMENSIONS.map((dimension) => {
    const dimFindings = buckets[dimension.id];
    let score: number;

    if (dimension.scoreKey && scoreBreakdown) {
      score = scoreBreakdown[dimension.scoreKey];
      // Blend sub-processor score into Processor Obligations for a fuller picture
      if (dimension.id === "processor" && scoreBreakdown.subprocessorControls != null) {
        score = Math.round((score + scoreBreakdown.subprocessorControls) / 2);
      }
    } else if (dimension.id === "risk" && avgBreakdown != null) {
      // Risk leans toward gap severity
      const gapPenalty =
        dimFindings.filter((f) => f.status === "missing").length * 12 +
        dimFindings.filter((f) => f.status === "warning").length * 6;
      score = Math.max(0, Math.min(100, avgBreakdown - gapPenalty));
    } else {
      score = scoreFromFindings(dimFindings);
    }

    const { status, statusLabel } = statusFromScore(score);

    return {
      dimension,
      score,
      status,
      statusLabel,
      findings: dimFindings,
      compliantCount: dimFindings.filter((f) => f.status === "compliant").length,
      warningCount: dimFindings.filter((f) => f.status === "warning").length,
      missingCount: dimFindings.filter((f) => f.status === "missing").length,
    };
  });
}
