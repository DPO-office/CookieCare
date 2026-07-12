import React from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Finding } from "../types";

interface DPAStatusBadgeProps {
  status: Finding["status"];
}

export function DPAStatusBadge({ status }: DPAStatusBadgeProps) {
  const cfg = {
    compliant: {
      label: "Compliant",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    warning: {
      label: "Warning",
      cls: "bg-amber-50 text-amber-700 border border-amber-200",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    missing: {
      label: "Missing",
      cls: "bg-red-50 text-red-700 border border-red-200",
      icon: <XCircle className="w-3 h-3" />,
    },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
