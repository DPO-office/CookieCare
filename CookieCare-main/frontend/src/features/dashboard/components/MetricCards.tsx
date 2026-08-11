import type { DashboardStats } from "../types";

interface MetricCardsProps {
  stats: DashboardStats;
  attentionCount: number;
  avgTrustScore: number | null;
}

interface MetricDef {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
}

export function MetricCards({ stats, attentionCount, avgTrustScore }: MetricCardsProps) {
  const metrics: MetricDef[] = [
    {
      label: "Documents",
      value: stats.totalDocs,
      sub: stats.totalDocs === 0 ? "none yet" : "in vault",
    },
    {
      label: "Pending signatures",
      value: stats.pendingSigs,
      sub: stats.pendingSigs === 0 ? "on track" : "awaiting signers",
      alert: stats.pendingSigs > 0,
    },
    {
      label: "Active redlines",
      value: stats.redlinesPending,
      sub: stats.redlinesPending === 0 ? "none open" : "need resolution",
      alert: stats.redlinesPending > 0,
    },
    {
      label: "Need attention",
      value: attentionCount,
      sub: attentionCount === 0 ? "all clear" : "require review",
      alert: attentionCount > 0,
    },
    {
      label: "Avg trust score",
      value: avgTrustScore !== null ? `${avgTrustScore}%` : "—",
      sub: avgTrustScore !== null ? "across documents" : "no data yet",
    },
  ];

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      aria-label="Workspace metrics"
    >
      {metrics.map((m) => (
        <div key={m.label} className="dashboard-metric-card">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {m.label}
          </p>
          <p
            className="text-[26px] font-bold tracking-tight leading-none mt-2 tabular-nums"
            style={{
              color: m.alert ? "var(--color-warning-text)" : "var(--color-text-primary)",
            }}
          >
            {m.value}
          </p>
          <p
            className="text-[11px] mt-1.5"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {m.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
