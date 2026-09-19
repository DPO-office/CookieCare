import { SEVERITY_BADGE_CLASSES } from "./constants";

export function severityBadgeClass(severity: string): string {
  return SEVERITY_BADGE_CLASSES[severity] ?? SEVERITY_BADGE_CLASSES.LOW;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** SCAN_ERROR results must not be shown as a successful zero-cookie audit. */
export function cookieScanHardErrorMessage(result: {
  scanSummary?: { riskLevel?: string; error?: string };
  complianceGaps?: Array<{ regulation?: string; issue?: string }>;
} | null | undefined): string | null {
  if (!result || result.scanSummary?.riskLevel !== "ERROR") return null;
  const gap = result.complianceGaps?.find((g) => g.regulation === "SCAN_ERROR");
  if (!gap) return null;
  return result.scanSummary.error || gap.issue || "Scan failed";
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
  return `LORA_Cookie_${clean}.${ext}`;
}
