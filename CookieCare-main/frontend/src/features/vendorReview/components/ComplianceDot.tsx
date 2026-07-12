import type { ComplianceItem } from "../types";

interface ComplianceDotProps {
  status: ComplianceItem["status"];
}

export function ComplianceDot({ status }: ComplianceDotProps) {
  const cfg = {
    compliant: { cls: "bg-emerald-500", label: "Compliant" },
    partial:   { cls: "bg-amber-400",   label: "Partial"   },
    missing:   { cls: "bg-red-500",     label: "Missing"   },
    na:        { cls: "bg-gray-300",    label: "N/A"       },
  }[status];

  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.cls}`} />
      <span className="text-[11px] text-gray-500 font-medium">{cfg.label}</span>
    </span>
  );
}
