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
