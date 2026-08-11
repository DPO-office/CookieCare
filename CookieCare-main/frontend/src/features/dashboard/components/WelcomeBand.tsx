interface WelcomeBandProps {
  greeting: string;
  firstName: string;
  summary: string;
  dateLabel: string;
}

export function WelcomeBand({ greeting, firstName, summary, dateLabel }: WelcomeBandProps) {
  return (
    <section className="dashboard-welcome px-6 py-7 sm:px-8 sm:py-8">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3"
        style={{ color: "var(--dash-warm-text)" }}
      >
        {dateLabel}
      </p>
      <h1
        className="text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight leading-[1.12] mb-3"
        style={{ color: "var(--color-text-primary)" }}
      >
        {greeting}, {firstName}.
      </h1>
      <p
        className="text-[length:var(--text-body-lg)] leading-relaxed max-w-2xl"
        style={{ color: "var(--dash-warm-text)" }}
      >
        {summary}
      </p>
    </section>
  );
}
