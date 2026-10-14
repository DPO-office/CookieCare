import type { AiTool, StatusTab } from "./types";
import { CATEGORY_OPTIONS, REVIEW_WINDOW_DAYS, RISK_OPTIONS, STATUS_OPTIONS } from "./constants";

export function statusLabel(status: AiTool["status"]): string {
  return STATUS_OPTIONS.find((o) => o.id === status)?.label ?? status;
}

export function riskLabel(risk: AiTool["euRisk"]): string {
  return RISK_OPTIONS.find((o) => o.id === risk)?.label ?? risk;
}

export function categoryLabel(category: AiTool["category"]): string {
  return CATEGORY_OPTIONS.find((o) => o.id === category)?.label ?? category;
}

export function isReviewOverdue(tool: AiTool): boolean {
  if (tool.status === "retired" || tool.status === "proposed") return false;
  if (!tool.lastReviewedAt) return true;
  const reviewed = new Date(tool.lastReviewedAt).getTime();
  if (Number.isNaN(reviewed)) return true;
  const ageDays = (Date.now() - reviewed) / (1000 * 60 * 60 * 24);
  return ageDays > REVIEW_WINDOW_DAYS;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function computeMetrics(tools: AiTool[]) {
  return {
    total: tools.length,
    active: tools.filter((t) => t.status === "active").length,
    highRisk: tools.filter((t) => t.euRisk === "high" || t.euRisk === "prohibited").length,
    overdue: tools.filter(isReviewOverdue).length,
  };
}

export function filterTools(tools: AiTool[], tab: StatusTab, query: string): AiTool[] {
  const q = query.trim().toLowerCase();
  return tools.filter((tool) => {
    if (tab !== "all" && tool.status !== tab) return false;
    if (!q) return true;
    return [tool.name, tool.vendor, tool.ownerName, tool.department, tool.purpose, tool.modelName]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function exportCsv(tools: AiTool[]) {
  const header = [
    "Name",
    "Vendor",
    "Category",
    "Status",
    "EU risk",
    "Owner",
    "Department",
    "Model",
    "Data types",
    "Last reviewed",
    "Purpose",
  ];
  const rows = tools.map((t) => [
    t.name,
    t.vendor,
    categoryLabel(t.category),
    statusLabel(t.status),
    riskLabel(t.euRisk),
    t.ownerName,
    t.department,
    t.modelName,
    t.dataTypes.join("; "),
    t.lastReviewedAt || "",
    t.purpose,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-tools-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
