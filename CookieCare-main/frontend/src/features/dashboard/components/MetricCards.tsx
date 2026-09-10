interface MetricDef {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
}

interface MetricCardsProps {
  documentCount: number;
  analyzedCount: number;
  runningCount: number;
  failedCount: number;
  redlineCount: number;
  signatureCount: number;
}

export function MetricCards({
  documentCount,
  analyzedCount,
  runningCount,
  failedCount,
  redlineCount,
  signatureCount,
}: MetricCardsProps) {
  const metrics: MetricDef[] = [
    {
      label: "Documents",
      value: documentCount,
      sub: documentCount === 0 ? "None in vault" : "In vault",
    },
    {
      label: "Analyzed",
      value: analyzedCount,
      sub: analyzedCount === 0 ? "No analyses yet" : "With stored findings",
    },
    {
      label: "Jobs running",
      value: runningCount,
      sub: runningCount === 0 ? "None running" : "Queued or processing",
    },
    {
      label: "Failed (7 days)",
      value: failedCount,
      sub: failedCount === 0 ? "None" : "Need follow-up",
      alert: failedCount > 0,
    },
  ];

  if (redlineCount > 0) {
    metrics.push({
      label: "Pending redlines",
      value: redlineCount,
      sub: "Need resolution",
      alert: true,
    });
  }
  if (signatureCount > 0) {
    metrics.push({
      label: "Pending signatures",
      value: signatureCount,
      sub: "Awaiting signers",
      alert: true,
    });
  }

  const cols =
    metrics.length <= 4
      ? "grid-cols-2 sm:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";

  return (
    <section className="dashboard-metric-wrap p-4 sm:p-5" aria-label="Workspace metrics">
      <div className={`grid gap-2.5 ${cols}`}>
        {metrics.map((m) => (
          <div key={m.label} className="dashboard-metric-tile">
            <p className="text-[12px] font-medium text-dark-200">{m.label}</p>
            <p
              className={`mt-2 text-[24px] font-semibold leading-none tracking-tight tabular-nums ${
                m.alert ? "text-badge-yellow-text" : "text-[#1a1a1a]"
              }`}
            >
              {m.value}
            </p>
            <p className="mt-1.5 text-[11px] text-[#98A2B3]">{m.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
