import type { EuRisk, StatusTab, ToolCategory, ToolStatus } from "./types";

export const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "pilot", label: "Pilot" },
  { id: "under_review", label: "Under review" },
  { id: "proposed", label: "Proposed" },
  { id: "retired", label: "Retired" },
];

export const STATUS_OPTIONS: { id: ToolStatus; label: string }[] = [
  { id: "proposed", label: "Proposed" },
  { id: "pilot", label: "Pilot" },
  { id: "active", label: "Active" },
  { id: "under_review", label: "Under review" },
  { id: "retired", label: "Retired" },
];

export const RISK_OPTIONS: { id: EuRisk; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "limited", label: "Limited" },
  { id: "high", label: "High-risk" },
  { id: "prohibited", label: "Prohibited" },
];

export const CATEGORY_OPTIONS: { id: ToolCategory; label: string }[] = [
  { id: "llm_platform", label: "LLM platform" },
  { id: "copilot", label: "Copilot / assistant" },
  { id: "analytics", label: "Analytics" },
  { id: "hr", label: "HR / people" },
  { id: "customer", label: "Customer-facing" },
  { id: "security", label: "Security" },
  { id: "custom", label: "Internal custom" },
  { id: "other", label: "Other" },
];

export const DATA_TYPE_OPTIONS = [
  "Personal data",
  "Sensitive / special category",
  "Confidential business",
  "Customer data",
  "Employee data",
  "Public only",
];

export const REVIEW_WINDOW_DAYS = 90;

export const EMPTY_TOOL_FORM = {
  name: "",
  vendor: "",
  category: "other" as ToolCategory,
  purpose: "",
  ownerName: "",
  department: "",
  status: "pilot" as ToolStatus,
  euRisk: "minimal" as EuRisk,
  dataTypes: [] as string[],
  modelName: "",
  lastReviewedAt: null as string | null,
};
