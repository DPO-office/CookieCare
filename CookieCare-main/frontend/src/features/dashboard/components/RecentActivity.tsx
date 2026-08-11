import { FileText } from "lucide-react";
import { scoreVariant } from "../../../shared/components/StatusBadge";
import type { DocLogEntry } from "../utils";
import { DashboardCard } from "./DashboardCard";

interface RecentActivityProps {
  entries: DocLogEntry[];
  onStartDraft: () => void;
}

export function RecentActivity({ entries, onStartDraft }: RecentActivityProps) {
  const visible = entries.slice(0, 8);

  return (
    <DashboardCard
      overline="Ledger"
      title="Recent activity"
      action={
        <span
          className="text-[length:var(--text-caption)] font-medium tabular-nums"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {entries.length} total
        </span>
      }
      noPadding
    >
      {visible.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p
            className="text-[length:var(--text-body-sm)] font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No activity yet
          </p>
          <p
            className="text-[length:var(--text-caption)] mb-4"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Documents you create or analyze will appear here.
          </p>
          <button type="button" className="btn-primary" onClick={onStartDraft}>
            Create document
          </button>
        </div>
      ) : (
        <ul>
          {visible.map((log) => {
            const variant = scoreVariant(log.score);
            const scoreColor =
              variant === "success"
                ? "var(--color-success-text)"
                : variant === "warning"
                ? "var(--color-warning-text)"
                : variant === "danger"
                ? "var(--color-danger-text)"
                : "var(--color-text-tertiary)";

            return (
              <li key={log.id}>
                <div className="dashboard-activity-row cursor-default hover:bg-transparent">
                  <div className="dashboard-icon-tile">
                    <FileText className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[length:var(--text-body-sm)] font-semibold truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {log.target}
                    </p>
                    <p
                      className="text-[length:var(--text-caption)] mt-0.5 truncate"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {log.type} · {log.issues} issue{log.issues === 1 ? "" : "s"} · Trust {log.score}%
                    </p>
                  </div>
                  <span
                    className="text-[length:var(--text-caption)] tabular-nums shrink-0"
                    style={{ color: scoreColor }}
                  >
                    {log.scanTime}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
