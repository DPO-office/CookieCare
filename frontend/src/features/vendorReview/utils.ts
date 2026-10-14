import type { VendorFinding } from "./types";
import { VENDOR_INFO, VENDOR_RISK_SCORE, PRIVACY_SCORE, SECURITY_SCORE } from "./constants";

/** Derive a human-readable compliance status from finding counts. */
export function deriveComplianceStatus(
  highRiskCount: number,
  missingCount: number,
  warningCount: number,
): "High Risk" | "Needs Review" | "Partial" | "Compliant" {
  if (highRiskCount > 0) return "High Risk";
  if (missingCount >= 2)  return "Needs Review";
  if (warningCount >= 2)  return "Partial";
  return "Compliant";
}

/** Return Tailwind classes for a compliance status card. */
export function getComplianceStatusConfig(status: ReturnType<typeof deriveComplianceStatus>) {
  return {
    "High Risk":    { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100"     },
    "Needs Review": { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"   },
    "Partial":      { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"   },
    "Compliant":    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
  }[status];
}

/** Label for a numeric risk score. */
export function getRiskScoreLabel(score: number): string {
  if (score >= 70) return "Low risk profile";
  if (score >= 50) return "Review recommended";
  return "Elevated risk";
}

/** Label for a privacy score. */
export function getPrivacyScoreLabel(score: number): string {
  return score >= 70 ? "Generally compliant" : "Needs attention";
}

/** Label for a security score. */
export function getSecurityScoreLabel(score: number): string {
  return score >= 70 ? "Well documented" : "Gaps identified";
}

/** Build the plain-text summary string used for clipboard copy. */
export function buildAssessmentSummary(findings: VendorFinding[]): string {
  const passedCount   = findings.filter((f) => f.status === "passed").length;
  const warningCount  = findings.filter((f) => f.status === "warning").length;
  const missingCount  = findings.filter((f) => f.status === "missing").length;
  const highRiskCount = findings.filter((f) => f.status === "high-risk").length;
  const status = deriveComplianceStatus(highRiskCount, missingCount, warningCount);

  return [
    "Vendor Assessment Report",
    `Vendor: ${VENDOR_INFO.name}`,
    `Risk Score: ${VENDOR_RISK_SCORE}/100`,
    `Privacy: ${PRIVACY_SCORE}/100 · Security: ${SECURITY_SCORE}/100`,
    `Status: ${status}`,
    `Passed: ${passedCount} · Warnings: ${warningCount} · Missing: ${missingCount} · High Risk: ${highRiskCount}`,
  ].join("\n");
}

/** Filter findings by a given status key (or return all). */
export function filterFindings(
  findings: VendorFinding[],
  filter: "all" | VendorFinding["status"],
): VendorFinding[] {
  return filter === "all" ? findings : findings.filter((f) => f.status === filter);
}
