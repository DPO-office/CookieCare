import type { VendorFinding } from "../types";

interface FindingBadgeProps {
  status: VendorFinding["status"];
}

const CFG = {
  passed: {
    label: "Passed",
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
  "high-risk": {
    label: "High risk",
    cls: "bg-badge-red text-badge-red-text",
    icon: "/icons/ats-bad.svg",
  },
} as const;

export function FindingBadge({ status }: FindingBadgeProps) {
  const cfg = CFG[status];
  return (
    <span className={`score-badge text-[11px] font-medium ${cfg.cls}`}>
      <img src={cfg.icon} alt="" className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
