interface RadialGaugeProps {
  score: number;
}

export function RadialGauge({ score }: RadialGaugeProps) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const ring =
    score >= 70 ? "#3D9B8F" :
    score >= 50 ? "#C9843A" : "#B54A45";

  return (
    <div className="relative flex h-[118px] w-[118px] shrink-0 items-center justify-center">
      <svg width="118" height="118" viewBox="0 0 118 118" className="-rotate-90">
        <circle cx="59" cy="59" r={r} fill="none" stroke="#EEF2FF" strokeWidth="10" />
        <circle
          cx="59"
          cy="59"
          r={r}
          fill="none"
          stroke={ring}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-semibold leading-none tabular-nums tracking-tight text-[#1a1a1a]">
          {score}
          <span className="text-[12px] font-medium text-[#98A2B3]">/100</span>
        </span>
      </div>
    </div>
  );
}
