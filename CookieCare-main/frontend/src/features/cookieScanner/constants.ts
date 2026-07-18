export const SCAN_DEPTHS = [
  { value: "Lite", label: "Lite (1 page)" },
  { value: "Medium", label: "Medium (5 pages)" },
  { value: "Deep", label: "Deep (20 pages)" },
  { value: "Enterprise", label: "Enterprise (50 pages)" },
] as const;

export const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const TRACKER_TABLE_HEADERS = ["Name", "Category", "Domain", "Retention", "Severity"];
