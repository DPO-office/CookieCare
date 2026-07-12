import React from "react";
import { FileText, Activity, FileEdit, Globe, ShieldAlert, Terminal } from "lucide-react";

export const JOB_STATUS_CONFIG = {
  queued:     { label: "Queued",     cls: "bg-gray-100 text-gray-600 border-gray-200" },
  processing: { label: "Processing", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:  { label: "Completed",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed:     { label: "Failed",     cls: "bg-red-50 text-red-700 border-red-200" },
} as const;

export const JOB_PROGRESS_BAR_COLOR: Record<string, string> = {
  failed:    "bg-red-400",
  completed: "bg-emerald-500",
  default:   "bg-gray-900",
};
