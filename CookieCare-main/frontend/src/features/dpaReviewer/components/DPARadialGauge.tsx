import React from "react";

interface DPARadialGaugeProps {
  score: number;
}

export function DPARadialGauge({ score }: DPARadialGaugeProps) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const arcLength = circ * 0.75;
  const offset = arcLength - (score / 100) * arcLength;
  const color      = score >= 70 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  const trackColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-[135deg]">
        <circle cx="48" cy="48" r={r} fill="none" stroke={trackColor} strokeWidth="7"
          strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${arcLength - offset} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: color + "99" }}>/100</span>
      </div>
    </div>
  );
}
