import type { EthicsFinding, AIEthicsScoreBreakdown, EthicsDimensionId, EthicsResultDimension } from "../types";
import { RESULT_DIMENSIONS } from "../constants";

export type DimensionStatus = "strong" | "partial" | "critical";

export interface EthicsDimensionResult {
  dimension: EthicsResultDimension;
  score: number;
  status: DimensionStatus;
  statusLabel: string;
  findings: EthicsFinding[];
  passedCount: number;
  warningCount: number;
  missingCount: number;
}

function haystack(finding: EthicsFinding): string {
  return [finding.category, finding.title, finding.description, finding.evidence]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function statusFromScore(score: number): { status: DimensionStatus; statusLabel: string } {
  if (score >= 70) return { status: "strong", statusLabel: "Strong" };
  if (score >= 45) return { status: "partial", statusLabel: "Needs work" };
  return { status: "critical", statusLabel: "Missing" };
}

function scoreFromFindings(findings: EthicsFinding[]): number {
  if (findings.length === 0) return 50;
  const weights = findings.map((f) => {
    if (f.status === "passed") return 100;
    if (f.status === "needs-improvement") return 55;
    if (f.status === "warning") return f.severity === "high" || f.severity === "critical" ? 25 : 45;
    return 8;
  });
  return Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
}

export function buildEthicsDimensionResults(
  findings: EthicsFinding[],
  scoreBreakdown?: AIEthicsScoreBreakdown | null,
): EthicsDimensionResult[] {
  const buckets: Record<EthicsDimensionId, EthicsFinding[]> = {
    fairness: [],
    transparency: [],
    accountability: [],
    privacy: [],
    oversight: [],
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

  return RESULT_DIMENSIONS.map((dimension) => {
    const dimFindings = buckets[dimension.id];
    let score: number;

    if (dimension.id === "transparency" && scoreBreakdown) {
      score = Math.round((scoreBreakdown.transparency + scoreBreakdown.explainability) / 2);
    } else if (dimension.id === "accountability" && scoreBreakdown) {
      score = Math.round((scoreBreakdown.accountability + scoreBreakdown.aiGovernance) / 2);
    } else if (dimension.scoreKey && scoreBreakdown) {
      score = scoreBreakdown[dimension.scoreKey];
    } else {
      score = scoreFromFindings(dimFindings);
    }

    const { status, statusLabel } = statusFromScore(score);
    const warningCount = dimFindings.filter(
      (f) => f.status === "warning" || f.status === "needs-improvement",
    ).length;

    return {
      dimension,
      score,
      status,
      statusLabel,
      findings: dimFindings,
      passedCount: dimFindings.filter((f) => f.status === "passed").length,
      warningCount,
      missingCount: dimFindings.filter((f) => f.status === "high-risk").length,
    };
  });
}
