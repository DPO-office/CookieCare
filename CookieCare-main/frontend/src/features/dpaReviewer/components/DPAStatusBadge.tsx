import React from "react";
import { Finding } from "../types";

interface DPAStatusBadgeProps {
  status: Finding["status"];
}

const CFG = {
  compliant: {
    label: "Compliant",
    cls: "bg-badge-green text-badge-green-text",
    icon: "/icons/check.svg",
  },
  warning: {
    label: "Warning",
    cls: "bg-badge-yellow text-badge-yellow-text",
    icon: "/icons/warning.svg",
  },
  missing: {
    label: "Missing",
    cls: "bg-badge-red text-badge-red-text",
    icon: "/icons/cross.svg",
  },
} as const;

export function DPAStatusBadge({ status }: DPAStatusBadgeProps) {
  const cfg = CFG[status];

  return (
    <span className={`score-badge text-[11px] font-semibold ${cfg.cls}`}>
      <img src={cfg.icon} alt="" className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
