import { ArrowRight } from "lucide-react";
import { StatusBadge } from "../../../shared/components/StatusBadge";
import type { DocumentWorkItem } from "../utils";
import { DashboardCard } from "./DashboardCard";

interface PriorityWorkProps {
  item: DocumentWorkItem | null;
  onOpen: (tab: string) => void;
}

export function PriorityWork({ item, onOpen }: PriorityWorkProps) {
  if (!item) return null;

  return (
    <DashboardCard
      overline="Active review"
      title={item.title}
      action={
        <StatusBadge variant={item.statusVariant}>{item.statusLabel}</StatusBadge>
      }
      noPadding
    >
      <div className="px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-[var(--color-border-subtle)]">
        <div className="min-w-0">
          <p
            className="text-[length:var(--text-body-sm)] leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {item.type} agreement · updated {item.updatedLabel}
            {item.issues > 0 && ` · ${item.issues} open issue${item.issues === 1 ? "" : "s"}`}
          </p>
          <p
            className="text-[length:var(--text-caption)] mt-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Trust score {item.score}% — {item.actionLabel.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(item.suggestedTab)}
          className="inline-flex items-center justify-center gap-2 shrink-0 px-5 py-2.5 rounded-[var(--radius-md)] text-[13px] font-semibold text-white transition-colors bg-[var(--color-text-primary)] hover:bg-[#1f2937]"
        >
          {item.actionLabel}
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </DashboardCard>
  );
}
