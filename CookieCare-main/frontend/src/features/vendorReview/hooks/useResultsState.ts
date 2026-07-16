import { useState, useCallback } from "react";
import type { VendorFinding, VendorReviewResult } from "../types";
import { MOCK_FINDINGS, VENDOR_INFO, VENDOR_RISK_SCORE, PRIVACY_SCORE, SECURITY_SCORE } from "../constants";
import { buildAssessmentSummary, filterFindings } from "../utils";

interface UseResultsStateOptions {
  reviewResult: VendorReviewResult | null;
}

interface UseResultsStateReturn {
  activeTab: "findings" | "recommendations";
  setActiveTab: (tab: "findings" | "recommendations") => void;
  findingFilter: "all" | VendorFinding["status"];
  setFindingFilter: (filter: "all" | VendorFinding["status"]) => void;
  filteredFindings: VendorFinding[];
  allFindings: VendorFinding[];
  copiedSummary: boolean;
  handleCopy: () => void;
  passedCount: number;
  warningCount: number;
  missingCount: number;
  highRiskCount: number;
  overallScore: number;
  privacyScore: number;
  securityScore: number;
  vendorName: string;
  vendorIndustry: string;
  vendorHQ: string;
  vendorDataRegions: string;
  vendorServices: string;
  isRealData: boolean;
}

/**
 * Maps a real VendorFinding from the backend (which uses `title` as the
 * category-like label) to the shape the UI components expect.
 */
function normaliseFindings(findings: VendorFinding[]): VendorFinding[] {
  return findings.map((f) => ({
    ...f,
    // The UI uses `category` as the card header; fall back to `title` if needed
    category: f.category || f.title || "Finding",
    // The UI uses `tag` as the small badge; map from category or severity
    tag: f.tag ?? f.severity ?? f.category,
  }));
}

export function useResultsState({ reviewResult }: UseResultsStateOptions): UseResultsStateReturn {
  const [activeTab,     setActiveTab]     = useState<"findings" | "recommendations">("findings");
  const [findingFilter, setFindingFilter] = useState<"all" | VendorFinding["status"]>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);

  const isRealData = reviewResult !== null;

  // ── Resolve findings ─────────────────────────────────────────────────────
  const rawFindings: VendorFinding[] = isRealData
    ? normaliseFindings(reviewResult!.findings)
    : MOCK_FINDINGS;

  const passedCount   = rawFindings.filter((f) => f.status === "passed").length;
  const warningCount  = rawFindings.filter((f) => f.status === "warning").length;
  const missingCount  = rawFindings.filter((f) => f.status === "missing").length;
  const highRiskCount = rawFindings.filter((f) => f.status === "high-risk").length;

  const filteredFindings = filterFindings(rawFindings, findingFilter);

  // ── Resolve scores ────────────────────────────────────────────────────────
  const overallScore  = isRealData ? reviewResult!.overallScore : VENDOR_RISK_SCORE;
  // Derive privacy and security scores from scoreBreakdown if real data
  const privacyScore  = isRealData
    ? Math.round((reviewResult!.scoreBreakdown.privacyPosture + reviewResult!.scoreBreakdown.gdprCompliance) / 2)
    : PRIVACY_SCORE;
  const securityScore = isRealData
    ? reviewResult!.scoreBreakdown.securityPosture
    : SECURITY_SCORE;

  // ── Resolve vendor info ───────────────────────────────────────────────────
  const vi = isRealData ? reviewResult!.vendorInfo : undefined;
  const vendorName        = vi?.name         ?? VENDOR_INFO.name;
  const vendorIndustry    = vi?.industry     ?? VENDOR_INFO.industry;
  const vendorHQ          = vi?.headquarters ?? VENDOR_INFO.headquarters;
  const vendorDataRegions = vi?.dataRegions  ?? VENDOR_INFO.dataRegions;
  const vendorServices    = vi?.primaryServices ?? VENDOR_INFO.primaryServices;

  // ── Copy summary ──────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const summary = isRealData
      ? [
          "Vendor Assessment Report",
          `Vendor: ${vendorName}`,
          `Risk Score: ${overallScore}/100`,
          `Privacy: ${privacyScore}/100 · Security: ${securityScore}/100`,
          `Risk Level: ${reviewResult!.overallRisk.toUpperCase()}`,
          `Summary: ${reviewResult!.summary}`,
          `Passed: ${passedCount} · Warnings: ${warningCount} · Missing: ${missingCount} · High Risk: ${highRiskCount}`,
        ].join("\n")
      : buildAssessmentSummary(MOCK_FINDINGS);

    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  }, [isRealData, reviewResult, overallScore, privacyScore, securityScore,
      passedCount, warningCount, missingCount, highRiskCount, vendorName]);

  return {
    activeTab,
    setActiveTab,
    findingFilter,
    setFindingFilter,
    filteredFindings,
    allFindings: rawFindings,
    copiedSummary,
    handleCopy,
    passedCount,
    warningCount,
    missingCount,
    highRiskCount,
    overallScore,
    privacyScore,
    securityScore,
    vendorName,
    vendorIndustry,
    vendorHQ,
    vendorDataRegions,
    vendorServices,
    isRealData,
  };
}
