// ─── Compare Documents — Constants ───────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.txt";

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const SLOT_CONFIG = {
  original: {
    label: "Original Agreement",
    description: "Upload the base version",
  },
  revised: {
    label: "Revised Agreement",
    description: "Upload the updated version",
  },
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  liability: "Liability",
  indemnity: "Indemnity",
  ip: "IP",
  termination: "Termination",
  data_protection: "Data Protection",
  payment: "Payment",
  confidentiality: "Confidentiality",
  governing_law: "Governing Law",
  audit_rights: "Audit Rights",
  other: "Other",
};

export const DIFF_LABELS: Record<string, { label: string; badge: string }> = {
  ADDED: { label: "Added", badge: "bg-badge-green text-badge-green-text" },
  REMOVED: { label: "Removed", badge: "bg-badge-red text-badge-red-text" },
  MODIFIED_BROADER: { label: "Broadened", badge: "bg-badge-yellow text-badge-yellow-text" },
  MODIFIED_NARROWER: { label: "Narrowed", badge: "bg-badge-yellow text-badge-yellow-text" },
  NEUTRAL_REPHRASE: { label: "Rephrased", badge: "bg-light-blue-100 text-dark-200" },
  UNCHANGED: { label: "Unchanged", badge: "bg-light-blue-100 text-dark-200" },
};

/**
 * Compare workspace change-type language.
 * Distinct from risk. Used by the three-pane UI (rail badges + PDF highlights).
 * Do not reuse these colors for HIGH/MEDIUM/LOW risk.
 *
 * `stroke` — used as the CSS outline color on the per-word PDF highlight boxes
 * for the active (selected) finding. Intentionally derived from the change-type
 * hue, NOT from SELECTED_FINDING_OUTLINE (blue), so that a REMOVED finding
 * always draws a red outline, an ADDED finding always draws a blue outline that
 * matches ADDED (not the selection ring), etc.
 *
 * Keep `SELECTED_FINDING_OUTLINE` (#2175D9) exclusively for the finding-card
 * inset box-shadow ring — it must never bleed onto the per-word PDF boxes.
 */
export const CHANGE_TYPE_STYLE: Record<
  string,
  { label: string; badge: string; fill: string; passive: string; stroke: string }
> = {
  REMOVED: {
    label: "Removed",
    badge: "bg-[#FEE2E2] text-[#991B1B]",
    fill: "rgba(220,38,38,0.38)",
    passive: "rgba(220,38,38,0.14)",
    stroke: "rgba(185,28,28,0.80)",   // red-700 at 80% — clearly red, distinct from blue ring
  },
  ADDED: {
    label: "Added",
    badge: "bg-[#DBEAFE] text-[#1D4ED8]",
    fill: "rgba(37,99,235,0.36)",
    passive: "rgba(37,99,235,0.14)",
    stroke: "rgba(29,78,216,0.80)",   // blue-700 — matches ADDED hue, not the selection ring
  },
  MODIFIED_BROADER: {
    label: "Broader",
    badge: "bg-[#FEF3C7] text-[#92400E]",
    fill: "rgba(217,119,6,0.36)",
    passive: "rgba(217,119,6,0.14)",
    stroke: "rgba(180,83,9,0.80)",    // amber-700
  },
  MODIFIED_NARROWER: {
    label: "Narrower",
    badge: "bg-[#EDE9FE] text-[#5B21B6]",
    fill: "rgba(124,58,237,0.36)",
    passive: "rgba(124,58,237,0.14)",
    stroke: "rgba(109,40,217,0.80)",  // violet-700
  },
  NEUTRAL_REPHRASE: {
    label: "Rephrased",
    badge: "bg-[#F3F4F6] text-[#4B5563]",
    fill: "rgba(107,114,128,0.22)",
    passive: "rgba(107,114,128,0.10)",
    stroke: "rgba(75,85,99,0.60)",    // gray-600
  },
  UNCHANGED: {
    label: "Unchanged",
    badge: "bg-[#F3F4F6] text-[#6B7280]",
    fill: "rgba(107,114,128,0.12)",
    passive: "rgba(107,114,128,0.06)",
    stroke: "rgba(107,114,128,0.30)",
  },
};

/** Compact risk badges that do not reuse change-type colors. */
export const COMPARE_RISK_BADGE: Record<string, { label: string; badge: string }> = {
  HIGH: { label: "HIGH", badge: "bg-[#111827] text-white" },
  MEDIUM: { label: "MEDIUM", badge: "border border-[#4B5563] bg-white text-[#374151]" },
  LOW: { label: "LOW", badge: "bg-[#F3F4F6] text-[#4B5563]" },
};

export const SELECTED_FINDING_OUTLINE = "#2175D9";

export const ALIGN_LABELS: Record<string, { label: string; badge: string }> = {
  matched: { label: "Matched", badge: "bg-badge-green text-badge-green-text" },
  added: { label: "Only in revised", badge: "bg-light-blue-100 text-[#4F5BD9]" },
  removed: { label: "Only in original", badge: "bg-badge-red text-badge-red-text" },
  restructured: { label: "Restructured", badge: "bg-badge-yellow text-badge-yellow-text" },
};

export const RISK_BADGE: Record<string, { label: string; badge: string; bar: string }> = {
  HIGH: { label: "High", badge: "bg-badge-red text-badge-red-text", bar: "#B54A45" },
  MEDIUM: { label: "Medium", badge: "bg-badge-yellow text-badge-yellow-text", bar: "#C9843A" },
  LOW: { label: "Low", badge: "bg-badge-green text-badge-green-text", bar: "#3D9B8F" },
};
