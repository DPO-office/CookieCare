import { FileText } from "lucide-react";
import { scoreVariant } from "../../../shared/components/StatusBadge";
import type { DocumentWorkItem } from "../utils";
import { DashboardCard } from "./DashboardCard";

const SCORE_COLOR: Record<ReturnType<typeof scoreVariant>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  neutral: "var(--color-text-tertiary)",
  brand: "var(--color-brand)",
};

interface ContinueWorkingProps {
  items: DocumentWorkItem[];
  onOpen: (tab: string) => void;
  onViewVault: () => void;
  excludeId?: string;
}

export function ContinueWorking({
  items,
  onOpen,
  onViewVault,
  excludeId,
}: ContinueWorkingProps) {
  const list = excludeId ? items.filter((i) => i.id !== excludeId) : items;

  return (
    <DashboardCard
      overline="Your queue"
      title="Continue working"
      action={
        items.length > 0 ? (
          <button
            type="button"
            onClick={onViewVault}
            className="text-[length:var(--text-body-sm)] font-medium hover:underline underline-offset-2"
            style={{ color: "var(--color-brand-text)" }}
          >
            View all
          </button>
        ) : undefined
      }
      noPadding
    >
      {list.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <FileText
            className="w-5 h-5 mx-auto mb-2"
            style={{ color: "var(--color-text-disabled)" }}
            strokeWidth={1.5}
          />
          <p
            className="text-[length:var(--text-body-sm)] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {items.length === 0 ? "No documents in your queue" : "No other documents waiting"}
          </p>
          <p
            className="text-[length:var(--text-caption)] mt-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {items.length === 0
              ? "Analyze or draft an agreement to get started."
              : "Your active review is shown above."}
          </p>
        </div>
      ) : (
        <ul>
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="dashboard-activity-row"
                onClick={() => onOpen(item.suggestedTab)}
              >
                <div className="dashboard-icon-tile">
                  <FileText className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[length:var(--text-body-sm)] font-semibold truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {item.title}
                  </p>
                  <p
                    className="text-[length:var(--text-caption)] mt-0.5 truncate"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {item.type} · {item.statusLabel} · {item.actionLabel}
                  </p>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <p
                    className="text-[length:var(--text-body-sm)] font-bold tabular-nums"
                    style={{ color: SCORE_COLOR[scoreVariant(item.score)] }}
                  >
                    {item.score}%
                  </p>
                  <p
                    className="text-[10px] mt-0.5 tabular-nums"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {item.updatedLabel}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
