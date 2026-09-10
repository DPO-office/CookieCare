export type ToolStatus = "proposed" | "pilot" | "active" | "under_review" | "retired";
export type EuRisk = "prohibited" | "high" | "limited" | "minimal";
export type ToolCategory =
  | "llm_platform"
  | "copilot"
  | "analytics"
  | "hr"
  | "customer"
  | "security"
  | "custom"
  | "other";

export interface AiTool {
  id: string;
  name: string;
  vendor: string;
  category: ToolCategory;
  purpose: string;
  ownerName: string;
  department: string;
  status: ToolStatus;
  euRisk: EuRisk;
  dataTypes: string[];
  modelName: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AiToolInput = Omit<AiTool, "id" | "createdAt" | "updatedAt">;

export type StatusTab = "all" | ToolStatus;
