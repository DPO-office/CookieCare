import { Archive, ScanSearch, ShieldCheck } from "lucide-react";
import { DashboardCard } from "./DashboardCard";

interface WorkspaceSidebarProps {
  documentCount: number;
  attentionCount: number;
  onNavigate: (tab: string) => void;
}

export function WorkspaceSidebar({
  documentCount,
  attentionCount,
  onNavigate,
}: WorkspaceSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      <DashboardCard overline="Vault" title="Documents" noPadding>
        <div className="px-5 py-4 sm:px-6">
          <p
            className="text-[32px] font-bold tracking-tight leading-none tabular-nums"
            style={{ color: "var(--color-text-primary)" }}
          >
            {documentCount}
          </p>
          <p
            className="text-[length:var(--text-caption)] mt-1.5 mb-4"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            agreements stored securely
          </p>
          <button
            type="button"
            onClick={() => onNavigate("legal-vault")}
            className="btn-secondary w-full inline-flex items-center justify-center gap-2"
          >
            <Archive className="w-4 h-4" strokeWidth={1.5} />
            Open vault
          </button>
        </div>
      </DashboardCard>

      <DashboardCard overline="Trust & compliance" title="Workspace status" noPadding>
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          <li className="px-5 py-3.5 sm:px-6 flex items-start gap-3">
            <ShieldCheck
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: attentionCount > 0 ? "var(--color-warning)" : "var(--color-success)" }}
              strokeWidth={1.5}
            />
            <div>
              <p
                className="text-[length:var(--text-body-sm)] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {attentionCount > 0
                  ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need review`
                  : "Workspace is current"}
              </p>
              <p
                className="text-[length:var(--text-caption)] mt-0.5"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {attentionCount > 0
                  ? "Prioritize agreements with open issues or redlines."
                  : "No outstanding compliance actions."}
              </p>
            </div>
          </li>
          <li className="px-5 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={() => onNavigate("legal-review")}
              className="w-full flex items-center gap-2 text-[length:var(--text-body-sm)] font-medium transition-colors hover:text-[var(--color-brand-text)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <ScanSearch className="w-4 h-4" strokeWidth={1.5} />
              Run new analysis
            </button>
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}
