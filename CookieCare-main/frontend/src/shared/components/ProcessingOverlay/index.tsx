import React, { useState, useEffect, useRef } from "react";
import { Check, Loader2, AlertTriangle, RefreshCw, X } from "lucide-react";
import { BrandLogo } from "../BrandLogo";
import { PRIMARY_BRAND, PRIMARY_BRAND_LIGHT } from "../../theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "active" | "done";

export interface ProcessingStep {
  id: string;
  label: string;
  status: StepStatus;
}

export type OverlayMode = "page" | "dialog";

export interface FileItem {
  name: string;
  subLabel?: string;
  badge?: string;
}

export interface ProcessingOverlayProps {
  mode?: OverlayMode;
  visible?: boolean;
  title?: string;
  subtitle?: string;
  hint?: string;
  progress?: number;
  statusMessage?: string;
  steps?: ProcessingStep[];
  files?: FileItem[];
  fileIcon?: React.ReactNode;
  error?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

// ─── Auto-cycling messages ────────────────────────────────────────────────────

const AUTO_MESSAGES = [
  "Preparing request…",
  "Uploading document…",
  "Reading content…",
  "Extracting text…",
  "Processing input…",
  "Sending to AI…",
  "Analyzing…",
  "Validating output…",
  "Generating response…",
  "Formatting results…",
  "Finalising…",
];

// ─── Animated progress bar ────────────────────────────────────────────────────
// A full-height bar (not just the 3px stripe) that pulses when indeterminate
// and smoothly fills when a percentage is known.

function ProgressBar({ pct, error }: { pct: number | undefined; error: boolean }) {
  const hasPct = typeof pct === "number";

  if (error) {
    return (
      <div className="h-1 w-full rounded-full overflow-hidden bg-red-100">
        <div className="h-full w-full bg-red-400 rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "#E8F1FB" }}>
      {hasPct ? (
        /* Determinate */
        <div
          className="h-full rounded-full relative overflow-hidden"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${PRIMARY_BRAND} 0%, #56A0F5 100%)`,
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Shimmer sweep */}
          <span
            className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ animation: "rt-shimmer 1.6s ease-in-out infinite" }}
          />
        </div>
      ) : (
        /* Indeterminate — two-segment travelling bar */
        <div
          className="h-full rounded-full"
          style={{
            width: "45%",
            background: `linear-gradient(90deg, transparent 0%, ${PRIMARY_BRAND} 40%, #56A0F5 70%, transparent 100%)`,
            animation: "rt-indeterminate 1.6s cubic-bezier(0.65,0,0.35,1) infinite",
          }}
        />
      )}
    </div>
  );
}

// ─── Animated ring ────────────────────────────────────────────────────────────
// Sits concentrically around BrandLogo size="lg" (44×44px container).
// The SVG viewport is 80×80; the circle is at cx/cy=40 with r=36.

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R; // ≈ 226.2

function LogoRing({
  pct,
  error,
}: {
  pct: number | undefined;
  error: boolean;
}) {
  const hasPct = typeof pct === "number";

  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      className="absolute"
      style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
      aria-hidden
    >
      {/* Track */}
      <circle cx="40" cy="40" r={RING_R} stroke="#E5E7EB" strokeWidth="2.5" />

      {error ? (
        <circle cx="40" cy="40" r={RING_R} stroke="#EF4444" strokeWidth="2.5" />
      ) : hasPct ? (
        /* Determinate arc */
        <circle
          cx="40"
          cy="40"
          r={RING_R}
          stroke={PRIMARY_BRAND}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct! / 100)}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      ) : (
        /* Spinning arc */
        <circle
          cx="40"
          cy="40"
          r={RING_R}
          stroke={PRIMARY_BRAND}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${RING_C * 0.25} ${RING_C * 0.75}`}
          style={{
            transformOrigin: "center",
            animation: "rt-ring-spin 1.1s linear infinite",
          }}
        />
      )}
    </svg>
  );
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: ProcessingStep }) {
  const isActive  = step.status === "active";
  const isDone    = step.status === "done";
  const isPending = step.status === "pending";

  return (
    <div
      className="flex items-center gap-2.5 transition-opacity duration-300"
      style={{ opacity: isPending ? 0.35 : 1 }}
    >
      {/* Status node */}
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
        style={
          isDone
            ? { background: "#ECFDF5", border: "1px solid #A7F3D0" }
            : isActive
            ? { background: PRIMARY_BRAND }
            : { background: "#F3F4F6", border: "1px solid #E5E7EB" }
        }
      >
        {isDone    && <Check   className="w-2.5 h-2.5 text-emerald-600" />}
        {isActive  && <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />}
        {isPending && <span   className="w-1 h-1 rounded-full bg-gray-300" />}
      </div>

      <span
        className="text-[12.5px] leading-snug flex-1 transition-all duration-200"
        style={{
          color    : isDone ? "#9CA3AF" : isActive ? "#111827" : "#9CA3AF",
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {step.label}
      </span>

      {isDone && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProcessingOverlay({
  mode = "page",
  visible = true,
  title = "Processing…",
  subtitle,
  hint,
  progress,
  statusMessage,
  steps,
  files,
  fileIcon,
  error,
  onRetry,
  onDismiss,
  className = "",
}: ProcessingOverlayProps) {
  // Mount-in animation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!visible) { setMounted(false); return; }
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, [visible]);

  // Auto-cycling fallback message
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (!visible || error) return;
    setMsgIdx(0);
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % AUTO_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, [visible, error]);

  // Derived progress
  const derivedPct: number | undefined =
    steps && steps.length > 0
      ? Math.round((steps.filter((s) => s.status === "done").length / steps.length) * 100)
      : typeof progress === "number"
      ? Math.max(0, Math.min(100, progress))
      : undefined;

  // Active step label — surfaced prominently as the live status line
  const activeStep = steps?.find((s) => s.status === "active");

  // Displayed live message: SSE > active step label > auto-cycling
  const liveMessage = error
    ? undefined
    : statusMessage?.trim()
    ? statusMessage
    : activeStep?.label
    ? activeStep.label
    : AUTO_MESSAGES[msgIdx];

  // ── Card ───────────────────────────────────────────────────────────────────
  const card = (
    <div
      className="w-full"
      style={{
        maxWidth: 400,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(14px)",
        transition: "opacity 0.38s ease, transform 0.38s ease",
      }}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #E5E7EB",
          boxShadow:
            "0 0 0 1px rgba(33,117,217,0.04), 0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 24px -4px rgba(0,0,0,0.07)",
        }}
      >
        {/* ── Top progress bar ─────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-0">
          <ProgressBar pct={derivedPct} error={!!error} />
        </div>

        {/* ── Logo + glow ──────────────────────────────────────────────── */}
        <div className="flex justify-center pt-6 pb-4">
          <div className="relative inline-flex items-center justify-center">
            {/* Radial glow */}
            {!error && (
              <div
                className="absolute rounded-full"
                style={{
                  width: 96,
                  height: 96,
                  background:
                    "radial-gradient(circle, rgba(33,117,217,0.13) 0%, rgba(33,117,217,0.04) 55%, transparent 75%)",
                  animation: "rt-glow-pulse 2.4s ease-in-out infinite",
                }}
              />
            )}

            {/* Animated ring */}
            <LogoRing pct={derivedPct} error={!!error} />

            {/* Logo */}
            {error ? (
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: "#FEF2F2" }}
              >
                <AlertTriangle className="w-[22px] h-[22px] text-red-500" />
              </div>
            ) : (
              <BrandLogo size="lg" iconOnly />
            )}
          </div>
        </div>

        {/* ── Title + live status ───────────────────────────────────────── */}
        <div className="px-6 pb-5 text-center">
          <h2
            className="font-bold tracking-tight"
            style={{ fontSize: 17, color: error ? "#B91C1C" : "#111827", marginBottom: 6 }}
          >
            {error ? "Something went wrong" : title}
          </h2>

          {/* Live status / SSE message */}
          {!error && liveMessage && (
            <p
              className="text-[12.5px] leading-snug font-medium"
              style={{ color: "#6B7280" }}
              key={liveMessage}
            >
              {liveMessage}
            </p>
          )}

          {/* Error body */}
          {error && (
            <p className="text-[12.5px] text-red-600 leading-snug max-w-xs mx-auto">
              {error}
            </p>
          )}

          {/* Subtitle — only when no steps (dialog-style) */}
          {subtitle && !steps?.length && !error && (
            <p
              className="text-[12px] leading-relaxed mt-1"
              style={{ color: "#9CA3AF" }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* ── Divider before body content ───────────────────────────────── */}
        {((steps && steps.length > 0) || (files && files.length > 0)) && (
          <div style={{ height: 1, background: "#F3F4F6", marginBottom: 0 }} />
        )}

        {/* ── Body: file rows + steps ──────────────────────────────────── */}
        {((steps && steps.length > 0) || (files && files.length > 0)) && (
          <div className="px-6 py-4 space-y-4">
            {/* File rows */}
            {files && files.length > 0 && (
              <div className={`space-y-2.5 ${steps && steps.length > 0 ? "pb-3.5 border-b border-gray-100" : ""}`}>
                {files.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: PRIMARY_BRAND_LIGHT, border: "1px solid #BFDBFE" }}
                    >
                      {fileIcon ?? (
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke={PRIMARY_BRAND} strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
                        {f.name}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {f.subLabel ?? (typeof derivedPct === "number" ? `${derivedPct}% complete` : "Processing…")}
                      </p>
                    </div>
                    {f.badge && (
                      <span
                        className="shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: PRIMARY_BRAND_LIGHT,
                          color: PRIMARY_BRAND,
                          border: `1px solid #BFDBFE`,
                        }}
                      >
                        {f.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Steps */}
            {steps && steps.length > 0 && (
              <div className="space-y-2">
                {steps.map((step) => (
                  <StepRow key={step.id} step={step} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer: progress pct + hint ──────────────────────────────── */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid #F3F4F6" }}
        >
          {typeof derivedPct === "number" && !error ? (
            <span
              className="text-[11.5px] font-semibold tabular-nums"
              style={{ color: PRIMARY_BRAND }}
            >
              {derivedPct}%
            </span>
          ) : (
            /* Dot pulse when no pct */
            <span className="flex gap-1">
              {!error && [0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full animate-bounce"
                  style={{
                    background: PRIMARY_BRAND,
                    opacity: 0.5,
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </span>
          )}
          <span className="text-[11px] text-gray-400">
            {error ? "" : (hint ?? "Secure AI · keep this tab open")}
          </span>
        </div>

        {/* ── Error actions ─────────────────────────────────────────────── */}
        {error && (onRetry || onDismiss) && (
          <div
            className="px-6 pb-5 flex items-center justify-center gap-3"
            style={{ borderTop: "1px solid #F3F4F6", paddingTop: 16 }}
          >
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-600 bg-white hover:bg-gray-50 transition"
              >
                <X className="w-3.5 h-3.5" />
                Dismiss
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition"
                style={{ background: PRIMARY_BRAND }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <style>{RT_KEYFRAMES}</style>
    </div>
  );

  // ── Page mode ─────────────────────────────────────────────────────────────
  if (mode === "page") {
    return (
      <div
        className={`flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-12 ${className}`}
        style={{ background: "#FAFAFB" }}
      >
        {card}
      </div>
    );
  }

  // ── Dialog mode ───────────────────────────────────────────────────────────
  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6 select-none"
      style={{ background: "rgba(250,250,251,0.88)", backdropFilter: "blur(3px)" }}
    >
      {card}
    </div>
  );
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

const RT_KEYFRAMES = `
  @keyframes rt-ring-spin {
    from { transform: rotate(0deg);   }
    to   { transform: rotate(360deg); }
  }
  @keyframes rt-shimmer {
    0%   { opacity: 0;  transform: translateX(-100%); }
    40%  { opacity: 1;  }
    60%  { opacity: 1;  }
    100% { opacity: 0;  transform: translateX(300%);  }
  }
  @keyframes rt-indeterminate {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(280%);  }
  }
  @keyframes rt-glow-pulse {
    0%, 100% { opacity: 0.75; transform: scale(1);    }
    50%       { opacity: 1;   transform: scale(1.08); }
  }
`;

export default ProcessingOverlay;
