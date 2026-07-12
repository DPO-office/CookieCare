import React from "react";

interface EthicsRadialGaugeProps {
  score: number;
  size?: number;
}

export function EthicsRadialGauge({ score, size = 96 }: EthicsRadialGaugeProps) {
  const r = size * 0.375;
  const circ = 2 * Math.PI * r;
  const arcLength = circ * 0.75;
  const offset = arcLength - (score / 100) * arcLength;
  const color =
    score >= 70 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  const trackColor =
    score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const cx = size / 2;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[135deg]"
      >
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth="7"
          strokeDasharray={`${arcLength} ${circ}`}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={`${arcLength - offset} ${circ}`}
          strokeLinecap="round"
          style={{
            transition:
              "stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: size * 0.22, color }}
        >
          {score}
        </span>
        <span
          className="font-bold uppercase tracking-wide"
          style={{ fontSize: size * 0.09, color: color + "99", marginTop: 2 }}
        >
          /100
        </span>
      </div>
    </div>
  );
}
