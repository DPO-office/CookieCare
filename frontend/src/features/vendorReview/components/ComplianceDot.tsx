import type { ComplianceItem } from "../types";

interface ComplianceDotProps {
  status: ComplianceItem["status"];
}

const CFG = {
  compliant: { cls: "bg-badge-green text-badge-green-text", label: "Compliant" },
  partial: { cls: "bg-badge-yellow text-badge-yellow-text", label: "Partial" },
  missing: { cls: "bg-badge-red text-badge-red-text", label: "Missing" },
  na: { cls: "bg-[#F2F4F7] text-[#667085]", label: "N/A" },
} as const;

export function ComplianceDot({ status }: ComplianceDotProps) {
  const cfg = CFG[status];
  return (
    <span className={`score-badge text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>
  );
}
