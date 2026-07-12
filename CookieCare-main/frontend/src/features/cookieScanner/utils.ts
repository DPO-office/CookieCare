import { SEVERITY_BADGE_CLASSES } from "./constants";

export function severityBadgeClass(severity: string): string {
  return SEVERITY_BADGE_CLASSES[severity] ?? SEVERITY_BADGE_CLASSES.LOW;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildReportContentString(result: {
  scanSummary: { url: string; overallScore: number };
  cookiesDetected: unknown[];
  complianceGaps: unknown[];
}): string {
  return `Cookie Compliance Audit Report\nURL: ${result.scanSummary.url}\nScore: ${result.scanSummary.overallScore}/100\n\nTrackers: ${result.cookiesDetected.length}\nCompliance Gaps: ${result.complianceGaps.length}`;
}

export function buildDownloadFilename(url: string, ext: string): string {
  const clean = url.replace(/https?:\/\/|www\./gi, "").replace(/[./\s]/gi, "_");
  return `Lexify_Cookie_${clean}.${ext}`;
}
