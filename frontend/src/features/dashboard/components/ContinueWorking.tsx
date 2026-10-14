import { FileText } from "lucide-react";
import type { DocumentRow } from "../types";
import { DashboardCard } from "./DashboardCard";

interface ContinueWorkingProps {
  items: DocumentRow[];
  onOpen: (tab: string) => void;
  onViewVault: () => void;
}

export function ContinueWorking({ items, onOpen, onViewVault }: ContinueWorkingProps) {
  return (
    <DashboardCard
      overline="Vault"
      title="Recent documents"
      action={
        items.length > 0 ? (
          <button
            type="button"
            onClick={onViewVault}
            className="text-[13px] font-medium text-dark-200 transition-colors hover:text-[#1a1a1a]"
          >
            View all
          </button>
        ) : undefined
      }
      noPadding
    >
      {items.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="dashboard-icon-tile mx-auto mb-3">
            <FileText className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] font-medium text-[#1a1a1a]">No documents yet</p>
          <p className="mt-1 text-[12px] text-dark-200">
            Analyze or draft an agreement to populate the vault.
          </p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="dashboard-activity-row"
                onClick={() => onOpen(item.analyzed ? "legal-review" : "legal-vault")}
              >
                <div className="dashboard-icon-tile">
                  <FileText className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-dark-200">
                    {item.type}
                    {item.analyzed
                      ? ` · ${item.findingCount} finding${item.findingCount === 1 ? "" : "s"}`
                      : " · Not analyzed"}
                  </p>
                </div>
                <p className="shrink-0 pl-2 text-[12px] tabular-nums text-[#98A2B3]">
                  {item.updatedLabel}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
