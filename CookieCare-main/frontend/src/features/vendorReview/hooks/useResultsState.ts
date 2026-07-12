import { useState, useCallback } from "react";
import type { VendorFinding } from "../types";
import { MOCK_FINDINGS } from "../constants";
import { buildAssessmentSummary, filterFindings } from "../utils";

interface UseResultsStateReturn {
  activeTab: "findings" | "recommendations";
  setActiveTab: (tab: "findings" | "recommendations") => void;
  findingFilter: "all" | VendorFinding["status"];
  setFindingFilter: (filter: "all" | VendorFinding["status"]) => void;
  filteredFindings: VendorFinding[];
  copiedSummary: boolean;
  handleCopy: () => void;
  passedCount: number;
  warningCount: number;
  missingCount: number;
  highRiskCount: number;
}

export function useResultsState(): UseResultsStateReturn {
  const [activeTab, setActiveTab] = useState<"findings" | "recommendations">("findings");
  const [findingFilter, setFindingFilter] = useState<"all" | VendorFinding["status"]>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);

  const passedCount   = MOCK_FINDINGS.filter((f) => f.status === "passed").length;
  const warningCount  = MOCK_FINDINGS.filter((f) => f.status === "warning").length;
  const missingCount  = MOCK_FINDINGS.filter((f) => f.status === "missing").length;
  const highRiskCount = MOCK_FINDINGS.filter((f) => f.status === "high-risk").length;

  const filteredFindings = filterFindings(MOCK_FINDINGS, findingFilter);

  const handleCopy = useCallback(() => {
    const summary = buildAssessmentSummary(MOCK_FINDINGS);
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  }, []);

  return {
    activeTab,
    setActiveTab,
    findingFilter,
    setFindingFilter,
    filteredFindings,
    copiedSummary,
    handleCopy,
    passedCount,
    warningCount,
    missingCount,
    highRiskCount,
  };
}
