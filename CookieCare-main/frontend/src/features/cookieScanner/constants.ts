export const SCAN_DEPTHS = [
  { value: "Lite", label: "Lite (1 page)" },
  { value: "Medium", label: "Medium (5 pages)" },
  { value: "Deep", label: "Deep (20 pages)" },
  { value: "Enterprise", label: "Enterprise (50 pages)" },
] as const;

export const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

export const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  HIGH: "score-badge bg-badge-red text-badge-red-text",
  MEDIUM: "score-badge bg-badge-yellow text-badge-yellow-text",
  LOW: "score-badge bg-badge-green text-badge-green-text",
};

export const TRACKER_TABLE_HEADERS = ["Name", "Category", "Domain", "Retention", "Severity"];
