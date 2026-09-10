import type { VendorFinding, VendorScoreBreakdown } from "../types";
import { RESULT_DIMENSIONS, type VendorDimensionId, type VendorResultDimension } from "../constants";

export type DimensionStatus = "strong" | "partial" | "critical";

export interface VendorDimensionResult {
  dimension: VendorResultDimension;
  score: number;
  status: DimensionStatus;
  statusLabel: string;
  findings: VendorFinding[];
  passedCount: number;
  warningCount: number;
  missingCount: number;
}

function haystack(finding: VendorFinding): string {
  return [finding.category, finding.title, finding.tag, finding.description, finding.evidence]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function categorizeVendorFindings(
  findings: VendorFinding[],
): Record<VendorDimensionId, VendorFinding[]> {
  const buckets: Record<VendorDimensionId, VendorFinding[]> = {
    privacy: [],
    security: [],
    compliance: [],
    residency: [],
    subprocessors: [],
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

function scoreFromFindings(findings: VendorFinding[]): number {
  if (findings.length === 0) return 50;
  const weights = findings.map((f) => {
    if (f.status === "passed") return 100;
    if (f.status === "warning") return f.severity === "high" || f.severity === "critical" ? 25 : 45;
    if (f.status === "high-risk") return 5;
    return 10;
  });
  return Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
}

export function buildVendorDimensionResults(
  findings: VendorFinding[],
  scoreBreakdown?: VendorScoreBreakdown | null,
): VendorDimensionResult[] {
  const buckets = categorizeVendorFindings(findings);

  return RESULT_DIMENSIONS.map((dimension) => {
    const dimFindings = buckets[dimension.id];
    let score: number;

    if (dimension.id === "compliance" && scoreBreakdown) {
      score = Math.round((scoreBreakdown.gdprCompliance + scoreBreakdown.ccpaCompliance) / 2);
    } else if (dimension.scoreKey && scoreBreakdown) {
      score = scoreBreakdown[dimension.scoreKey];
    } else {
      score = scoreFromFindings(dimFindings);
    }

    const { status, statusLabel } = statusFromScore(score);
    const missingCount = dimFindings.filter(
      (f) => f.status === "missing" || f.status === "high-risk",
    ).length;

    return {
      dimension,
      score,
      status,
      statusLabel,
      findings: dimFindings,
      passedCount: dimFindings.filter((f) => f.status === "passed").length,
      warningCount: dimFindings.filter((f) => f.status === "warning").length,
      missingCount,
    };
  });
}
