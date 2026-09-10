import { AlertTriangle, Layers, CheckCircle2, Clock } from "lucide-react";

interface InventoryMetricsProps {
  total: number;
  active: number;
  highRisk: number;
  overdue: number;
}

const CARDS = [
  { key: "total", label: "Total tools", icon: Layers, sub: "In this workspace" },
  { key: "active", label: "Active", icon: CheckCircle2, sub: "In production use" },
  { key: "highRisk", label: "High-risk", icon: AlertTriangle, sub: "EU AI Act high / prohibited" },
  { key: "overdue", label: "Review overdue", icon: Clock, sub: "Last review older than 90 days" },
] as const;

export function InventoryMetrics({ total, active, highRisk, overdue }: InventoryMetricsProps) {
  const values = { total, active, highRisk, overdue };

  return (
    <section className="dashboard-metric-wrap p-4 sm:p-5" aria-label="Inventory metrics">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const value = values[card.key];
          const alert = (card.key === "highRisk" || card.key === "overdue") && value > 0;
          return (
            <div key={card.key} className="dashboard-metric-tile">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-medium text-dark-200">{card.label}</p>
                <span className="dashboard-icon-tile h-8 w-8">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
              </div>
              <p
                className={`mt-2 text-[24px] font-semibold leading-none tracking-tight tabular-nums ${
                  alert ? "text-badge-yellow-text" : "text-[#1a1a1a]"
                }`}
              >
                {value}
              </p>
              <p className="mt-1.5 text-[11px] text-[#98A2B3]">{card.sub}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
