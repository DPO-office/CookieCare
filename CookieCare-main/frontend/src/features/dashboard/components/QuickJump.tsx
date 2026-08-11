import { DashboardCard } from "./DashboardCard";
import { QUICK_ACTIONS } from "../constants";

interface QuickJumpProps {
  onNavigate: (tab: string) => void;
}

export function QuickJump({ onNavigate }: QuickJumpProps) {
  return (
    <DashboardCard overline="Workflows" title="Quick jump" noPadding>
      <div className="px-5 py-4 sm:px-6 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.tab}
              type="button"
              className="dashboard-pill"
              onClick={() => onNavigate(action.tab)}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {action.label}
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}
