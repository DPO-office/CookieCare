interface WelcomeBandProps {
  greeting: string;
  firstName: string;
  summary: string;
  dateLabel: string;
}

export function WelcomeBand({
  greeting,
  firstName,
  summary,
  dateLabel,
}: WelcomeBandProps) {
  return (
    <section className="dashboard-hero px-6 py-7 sm:px-8 sm:py-8">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
        {dateLabel}
      </p>
      <h1 className="text-[clamp(1.75rem,4vw,2.125rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[#1a1a1a]">
        {greeting}, {firstName}.
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
        {summary}
      </p>
    </section>
  );
}
