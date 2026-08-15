import type { EthicsFinding } from "../types";

interface EthicsBadgeProps {
  status: EthicsFinding["status"];
}

const CFG = {
  passed: {
    label: "Passed",
    cls: "bg-badge-green text-badge-green-text",
    icon: "/icons/check.svg",
  },
  "needs-improvement": {
    label: "Needs work",
    cls: "bg-[#F2F4F7] text-[#667085]",
    icon: "/icons/info.svg",
  },
  warning: {
    label: "Warning",
    cls: "bg-badge-yellow text-badge-yellow-text",
    icon: "/icons/warning.svg",
  },
  "high-risk": {
    label: "High risk",
    cls: "bg-badge-red text-badge-red-text",
    icon: "/icons/ats-bad.svg",
  },
} as const;

export function EthicsBadge({ status }: EthicsBadgeProps) {
  const cfg = CFG[status];
  return (
    <span className={`score-badge text-[11px] font-medium ${cfg.cls}`}>
      <img src={cfg.icon} alt="" className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
