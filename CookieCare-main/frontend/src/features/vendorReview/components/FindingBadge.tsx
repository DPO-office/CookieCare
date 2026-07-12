import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { VendorFinding } from "../types";

interface FindingBadgeProps {
  status: VendorFinding["status"];
}

export function FindingBadge({ status }: FindingBadgeProps) {
  const cfg = {
    passed:      { label: "Passed",    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    warning:     { label: "Warning",   cls: "bg-amber-50 text-amber-700 border border-amber-200",       icon: <AlertTriangle className="w-3 h-3" /> },
    missing:     { label: "Missing",   cls: "bg-red-50 text-red-700 border border-red-200",             icon: <XCircle className="w-3 h-3" /> },
    "high-risk": { label: "High Risk", cls: "bg-red-100 text-red-800 border border-red-300",            icon: <AlertTriangle className="w-3 h-3" /> },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
