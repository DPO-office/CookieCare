/**
 * Report Adapters
 *
 * Normalises each module's result type into the shared EnterpriseReportData
 * format consumed by generateEnterpriseReport().
 */
import type { EnterpriseReportData, ReportFinding, ReportScoreItem } from "./reportTypes";
import type { DPAReviewResult }     from "../../features/dpaReviewer/types";
import type { VendorReviewResult }  from "../../features/vendorReview/types";
import type { AIEthicsReviewResult } from "../../features/aiEthics/types";

function nowFormatted(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ─── DPA Review ───────────────────────────────────────────────────────────────

export function adaptDPAResult(
  result: DPAReviewResult,
  fileName: string,
  generatedBy = "Lexify AI"
): EnterpriseReportData {
  const findings: ReportFinding[] = result.findings.map((f) => ({
    id:               f.id,
    title:            f.clause,
    severity:         (f.severity ?? (
      f.status === "missing"   ? "high"   :
      f.status === "warning"   ? "medium" : "low"
    )) as ReportFinding["severity"],
    status:           f.status,
    description:      f.description,
    recommendation:   f.recommendation,
    articleReference: f.article ?? f.articleReference,
  }));

  // Also include missing clauses as critical findings
  const missingFindings: ReportFinding[] = (result.missingClauses ?? []).map((mc, i) => ({
    id:             `mc-${i}`,
    title:          mc.clauseName,
    severity:       "critical" as const,
    status:         "missing",
    description:    mc.reason,
    recommendation: mc.recommendation,
    articleReference: mc.articleReference,
  }));

  const scoreBreakdown: ReportScoreItem[] = [
    { label: "Article 28 Compliance",    score: result.scoreBreakdown.article28Compliance    },
    { label: "Processor Obligations",    score: result.scoreBreakdown.processorObligations   },
    { label: "Security Measures",        score: result.scoreBreakdown.securityMeasures       },
    { label: "Data Subject Rights",      score: result.scoreBreakdown.dataSubjectRights      },
    { label: "International Transfers",  score: result.scoreBreakdown.internationalTransfers },
    { label: "Sub-processor Controls",   score: result.scoreBreakdown.subprocessorControls   },
  ];

  return {
    metadata: {
      reportTitle:    "DPA Review Report",
      assessmentType: "Data Processing Agreement Review",
      documentName:   fileName,
      generatedBy,
      generatedOn:    nowFormatted(),
    },
    overallScore:     result.overallScore,
    overallRisk:      result.riskLevel === "high" ? "high" :
                      result.riskLevel === "medium" ? "medium" : "low",
    executiveSummary: result.summary,
    strengths:        [],
    findings:         [...findings, ...missingFindings],
    recommendations:  result.recommendations,
    scoreBreakdown,
  };
}

// ─── Vendor Review ────────────────────────────────────────────────────────────

export function adaptVendorResult(
  result: VendorReviewResult,
  fileNames: string[],
  generatedBy = "Lexify AI"
): EnterpriseReportData {
  const findings: ReportFinding[] = result.findings.map((f) => ({
    id:             f.id,
    title:          f.title ?? f.category,
    severity:       f.severity ?? "low",
    status:         f.status,
    description:    f.description,
    recommendation: f.recommendation,
    evidence:       f.evidence,
  }));

  const scoreBreakdown: ReportScoreItem[] = [
    { label: "Privacy Posture",     score: result.scoreBreakdown.privacyPosture     },
    { label: "Security Posture",    score: result.scoreBreakdown.securityPosture    },
    { label: "GDPR Compliance",     score: result.scoreBreakdown.gdprCompliance     },
    { label: "CCPA Compliance",     score: result.scoreBreakdown.ccpaCompliance     },
    { label: "Contractual Risk",    score: result.scoreBreakdown.contractualRisk    },
    { label: "Vendor Transparency", score: result.scoreBreakdown.vendorTransparency },
  ];

  const additionalInfo = result.vendorInfo ? [
    ...(result.vendorInfo.name        ? [{ label: "Vendor Name",      value: result.vendorInfo.name        }] : []),
    ...(result.vendorInfo.industry    ? [{ label: "Industry",         value: result.vendorInfo.industry    }] : []),
    ...(result.vendorInfo.headquarters? [{ label: "Headquarters",     value: result.vendorInfo.headquarters}] : []),
    ...(result.vendorInfo.dataRegions ? [{ label: "Data Regions",     value: result.vendorInfo.dataRegions }] : []),
  ] : [];

  return {
    metadata: {
      reportTitle:    "Vendor Risk Assessment Report",
      assessmentType: "Vendor Privacy & Security Review",
      documentName:   fileNames.join(", ") || "Multiple documents",
      generatedBy,
      generatedOn:    nowFormatted(),
    },
    overallScore:     result.overallScore,
    overallRisk:      result.overallRisk,
    executiveSummary: result.summary,
    strengths:        result.strengths ?? [],
    findings,
    recommendations:  result.recommendations,
    scoreBreakdown,
    additionalInfo,
  };
}

// ─── AI Ethics ────────────────────────────────────────────────────────────────

export function adaptEthicsResult(
  result: AIEthicsReviewResult,
  fileNames: string[],
  generatedBy = "Lexify AI"
): EnterpriseReportData {
  const findings: ReportFinding[] = result.findings.map((f) => ({
    id:             f.id,
    title:          f.title ?? f.category,
    severity: (
      f.severity ?? (
        f.status === "high-risk"         ? "critical" :
        f.status === "warning"           ? "high"     :
        f.status === "needs-improvement" ? "medium"   : "low"
      )
    ) as ReportFinding["severity"],
    status:         f.status,
    description:    f.description,
    recommendation: f.recommendation,
    evidence:       f.evidence,
  }));

  // Use ethicsDimensions if available, otherwise fall back to scoreBreakdown keys
  const scoreBreakdown: ReportScoreItem[] =
    result.ethicsDimensions && result.ethicsDimensions.length > 0
      ? result.ethicsDimensions.map((d) => ({ label: d.dimension, score: d.score }))
      : Object.entries(result.scoreBreakdown ?? {}).map(([key, val]) => ({
          label: key.replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s) => s.toUpperCase())
                    .trim(),
          score: val as number,
        }));

  const additionalInfo =
    result.standardAlignment && result.standardAlignment.length > 0
      ? result.standardAlignment.map((s) => ({
          label: s.standard,
          value: s.alignment.charAt(0).toUpperCase() + s.alignment.slice(1) + " alignment",
        }))
      : [];

  return {
    metadata: {
      reportTitle:    "AI Ethics Assessment Report",
      assessmentType: "Responsible AI Governance Review",
      documentName:   fileNames.join(", ") || "AI System Documentation",
      generatedBy,
      generatedOn:    nowFormatted(),
    },
    overallScore:     result.overallScore,
    overallRisk:      result.overallRisk,
    executiveSummary: result.summary,
    strengths:        result.strengths ?? [],
    findings,
    recommendations:  result.recommendations ?? [],
    scoreBreakdown,
    additionalInfo,
  };
}

// ─── Vulnerability Scanner ────────────────────────────────────────────────────

import type { ScanResult as VulnScanResult, AiSecurityReport } from "../../features/vulnerabilityScanner/types";

export function adaptVulnResult(
  result: VulnScanResult,
  url: string,
  generatedBy = "Lexify AI"
): EnterpriseReportData {
  const findings: ReportFinding[] = result.findings.map((f, i) => ({
    id:             `vuln-${i}`,
    title:          f.name,
    severity:       (f.severity === "HIGH" ? "high" : f.severity === "MEDIUM" ? "medium" : "low") as ReportFinding["severity"],
    status:         f.severity.toLowerCase(),
    description:    f.vector,
    recommendation: f.remediation,
  }));

  const priorityItems: string[] = result.aiReport?.priorityActions?.map(
    (a) => `[${a.priority}] ${a.title}: ${a.reason}`
  ) ?? [];

  const recommendations = priorityItems.length > 0 ? [{
    category: "Security Remediation Roadmap",
    priority: "high" as const,
    items:    priorityItems,
  }] : [];

  const scoreBreakdown: ReportScoreItem[] = [
    { label: "Security Score",    score: result.securityScore },
    { label: "Checks Passed",     score: result.passedChecks != null && result.totalChecks
        ? Math.round((result.passedChecks / result.totalChecks) * 100) : result.securityScore },
  ];

  const strengths: string[] = result.aiReport?.positiveFindings ?? [];

  const executiveSummary = result.aiReport?.executiveSummary?.join(" ") ??
    `Security audit completed for ${url}. Security score: ${result.securityScore}/100. Overall risk: ${result.overallRisk}.`;

  return {
    metadata: {
      reportTitle:    "Security Vulnerability Report",
      assessmentType: "Passive Security Audit",
      documentName:   url,
      generatedBy,
      generatedOn:    nowFormatted(),
    },
    overallScore:     result.securityScore,
    overallRisk:      (result.overallRisk === "HIGH" ? "high" : result.overallRisk === "MEDIUM" ? "medium" : "low") as import("./reportTypes").RiskLevel,
    executiveSummary,
    strengths,
    findings,
    recommendations,
    scoreBreakdown,
    additionalInfo: [
      { label: "Target URL",    value: url },
      { label: "Overall Risk",  value: result.overallRisk },
      { label: "Total Checks",  value: result.totalChecks?.toString() ?? "—" },
      { label: "Passed",        value: result.passedChecks?.toString() ?? "—" },
      { label: "Failed",        value: result.failedChecks?.toString() ?? "—" },
    ],
  };
}

// ─── Cookie Scanner ───────────────────────────────────────────────────────────

import type { CookieScanResult } from "../../shared/types";

export function adaptCookieResult(
  result: CookieScanResult,
  generatedBy = "Lexify AI"
): EnterpriseReportData {
  const findings: ReportFinding[] = result.complianceGaps.map((g, i) => ({
    id:             g.id ?? `gap-${i}`,
    title:          `${g.regulation} — ${g.issue}`,
    severity:       (g.severity === "RED" ? "high" : g.severity === "YELLOW" ? "medium" : "low") as ReportFinding["severity"],
    status:         g.severity.toLowerCase(),
    description:    g.issue,
    recommendation: g.remediation,
  }));

  const scoreBreakdown: ReportScoreItem[] = [
    { label: "Compliance Score",      score: result.scanSummary.overallScore },
    { label: "Consent Banner",        score: result.scanSummary.hasConsentBanner ? 100 : 0 },
    { label: "Pre-consent Safety",    score: result.scanSummary.loadsBeforeConsent ? 0 : 100 },
    { label: "GDPR Coverage",         score: result.complianceGaps.filter(g => g.regulation === "GDPR" && g.severity !== "RED").length > 0 ? 70 : 100 },
    { label: "CCPA Coverage",         score: result.complianceGaps.filter(g => g.regulation === "CCPA" && g.severity !== "RED").length > 0 ? 70 : 100 },
  ];

  const strengths: string[] = [
    ...(result.scanSummary.hasConsentBanner ? ["Consent banner detected — GDPR Article 7 requirement met"] : []),
    ...(!result.scanSummary.loadsBeforeConsent ? ["Cookies do not load before user consent — compliant behaviour"] : []),
    ...(result.complianceGaps.filter(g => g.severity === "GREEN").map(g => `${g.regulation}: ${g.issue}`)),
  ];

  const executiveSummary =
    `Cookie compliance audit completed for ${result.scanSummary.url}. ` +
    `${result.cookiesDetected.length} cookies were detected across the site. ` +
    `${result.complianceGaps.filter(g => g.severity === "RED").length} critical compliance gaps identified. ` +
    (result.scanSummary.hasConsentBanner ? "A consent banner was found. " : "No consent banner detected — this is a critical GDPR gap. ") +
    (result.scanSummary.loadsBeforeConsent ? "Trackers load before consent approval, which violates privacy regulations." : "Cookie loading behaviour is compliant with consent requirements.");

  const cc = result.enterpriseReport?.consentComparison;

  return {
    metadata: {
      reportTitle:    "Cookie & Privacy Compliance Report",
      assessmentType: "Cookie Compliance Audit",
      documentName:   result.scanSummary.url,
      generatedBy,
      generatedOn:    nowFormatted(),
    },
    overallScore:    result.scanSummary.overallScore,
    overallRisk:     (result.scanSummary.overallScore >= 70 ? "low" : result.scanSummary.overallScore >= 40 ? "medium" : "high") as import("./reportTypes").RiskLevel,
    executiveSummary,
    strengths,
    findings,
    recommendations: findings.length > 0 ? [{
      category: "Privacy Compliance Remediation",
      priority: "high" as const,
      items:    findings.map(f => f.recommendation),
    }] : [],
    scoreBreakdown,
    additionalInfo: [
      { label: "Target URL",         value: result.scanSummary.url },
      { label: "Risk Level",         value: result.scanSummary.level },
      { label: "Total Cookies",      value: `${result.scanSummary.totalCookiesCount}` },
      { label: "Consent Banner",     value: result.scanSummary.hasConsentBanner ? "Yes" : "No" },
      { label: "Pre-consent Load",   value: result.scanSummary.loadsBeforeConsent ? "Yes (gap)" : "No (compliant)" },
    ],
    consentComparison: cc ?? undefined,
  };
}
