import React, { useState, useEffect } from "react";
import { Check, Loader2, AlertTriangle, RefreshCw, X } from "lucide-react";
import { BrandLogo } from "../BrandLogo";

// ─── Palette (premium ink) ────────────────────────────────────────────────────

const INK = "#1a1a1a";
const INK_MUTED = "#667085";
const INK_FAINT = "#98A2B3";
const SURFACE = "#F7F8FB";
const BORDER = "#E4E4E7";
const ACCENT = "#4F5BD9";

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
  estimatedTime?: string;
  keepOpenNote?: string;
  progress?: number;
  statusMessage?: string;
  steps?: ProcessingStep[];
  files?: FileItem[];
  fileIcon?: React.ReactNode;
  error?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  /** `scan` shows the document-scan GIF instead of the logo ring. */
  illustration?: "ring" | "scan";
  className?: string;
}

// ─── Auto-cycling messages ────────────────────────────────────────────────────

const AUTO_MESSAGES = [
  "Preparing request…",
  "Connecting securely…",
  "Reading content…",
  "Analyzing…",
  "Checking policies…",
  "Validating findings…",
  "Generating report…",
  "Finalising…",
];

// ─── Animated progress bar ────────────────────────────────────────────────────

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
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "#EEF2FF" }}
      >
        {hasPct ? (
          <div
            className="relative h-full overflow-hidden rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(to bottom, #8e98ff, #606beb)",
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <span
              className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{ animation: "rt-shimmer 1.6s ease-in-out infinite" }}
            />
          </div>
        ) : (
          <div
            className="h-full rounded-full"
            style={{
              width: "45%",
              background:
                "linear-gradient(90deg, transparent 0%, #8e98ff 40%, #606beb 70%, transparent 100%)",
              animation: "rt-indeterminate 1.6s cubic-bezier(0.65,0,0.35,1) infinite",
            }}
          />
        )}
      </div>
  );
}

// ─── Animated ring ────────────────────────────────────────────────────────────

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

function LogoRing({ pct, error }: { pct: number | undefined; error: boolean }) {
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
      <circle cx="40" cy="40" r={RING_R} stroke="#EEF2FF" strokeWidth="2.5" />

      {error ? (
        <circle cx="40" cy="40" r={RING_R} stroke="#EF4444" strokeWidth="2.5" />
      ) : hasPct ? (
        <circle
          cx="40"
          cy="40"
          r={RING_R}
          stroke={ACCENT}
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
        <circle
          cx="40"
          cy="40"
          r={RING_R}
          stroke={ACCENT}
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
  const isActive = step.status === "active";
  const isDone = step.status === "done";
  const isPending = step.status === "pending";

  return (
    <div
      className="flex items-center gap-2.5 transition-opacity duration-300"
      style={{ opacity: isPending ? 0.35 : 1 }}
    >
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
        style={
          isDone
            ? { background: "#ECFDF5", border: "1px solid #A7F3D0" }
            : isActive
            ? { background: ACCENT }
            : { background: SURFACE, border: `1px solid ${BORDER}` }
        }
      >
        {isDone && <Check className="w-2.5 h-2.5 text-emerald-600" />}
        {isActive && <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />}
        {isPending && <span className="w-1 h-1 rounded-full bg-gray-300" />}
      </div>

      <span
        className="text-[12.5px] leading-snug flex-1 transition-all duration-200"
        style={{
          color: isDone ? INK_FAINT : isActive ? INK : INK_FAINT,
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
  estimatedTime,
  keepOpenNote,
  progress,
  statusMessage,
  steps,
  files,
  fileIcon,
  error,
  onRetry,
  onDismiss,
  illustration = "ring",
  className = "",
}: ProcessingOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!visible) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, [visible]);

  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (!visible || error) return;
    setMsgIdx(0);
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % AUTO_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, [visible, error]);

  const derivedPct: number | undefined =
    steps && steps.length > 0
      ? Math.round((steps.filter((s) => s.status === "done").length / steps.length) * 100)
      : typeof progress === "number"
      ? Math.max(0, Math.min(100, progress))
      : undefined;

  const activeStep = steps?.find((s) => s.status === "active");

  const liveMessage = error
    ? undefined
    : statusMessage?.trim()
    ? statusMessage
    : activeStep?.label
    ? activeStep.label
    : AUTO_MESSAGES[msgIdx];

  const card = (
    <div
      className="w-full"
      style={{
        maxWidth: 420,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0) scale(1)" : "translateY(12px) scale(0.98)",
        transition: "opacity 0.38s ease, transform 0.38s ease",
      }}
    >
      <div
        className="overflow-hidden bg-white"
        style={{
          borderRadius: 24,
          boxShadow:
            "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.10)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div className="px-7 pt-6 pb-0">
          <ProgressBar pct={derivedPct} error={!!error} />
        </div>

        <div className="flex justify-center pt-6 pb-4">
          {error ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEF2F2]">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
          ) : illustration === "scan" ? (
            <img
              src="/images/resume-scan-2.gif"
              alt="Scanning document"
              className="h-[168px] w-auto object-contain sm:h-[196px]"
            />
          ) : (
            <div className="relative inline-flex items-center justify-center">
              <div
                className="absolute rounded-full"
                style={{
                  width: 96,
                  height: 96,
                  background:
                    "radial-gradient(circle, rgba(79,91,217,0.12) 0%, rgba(79,91,217,0.03) 55%, transparent 75%)",
                  animation: "rt-glow-pulse 2.4s ease-in-out infinite",
                }}
              />
              <LogoRing pct={derivedPct} error={false} />
              <BrandLogo size="lg" iconOnly />
            </div>
          )}
        </div>

        <div className="px-7 pb-6 text-center">
          <h2
            className="font-semibold tracking-tight m-0"
            style={{ fontSize: 18, color: error ? "#B91C1C" : INK, marginBottom: subtitle ? 10 : 6 }}
          >
            {error ? "Something went wrong" : title}
          </h2>

          {subtitle && !error && (
            <p
              className="text-[14px] font-medium leading-snug truncate max-w-[320px] mx-auto m-0 mb-2"
              style={{ color: INK }}
              title={subtitle}
            >
              {subtitle}
            </p>
          )}

          {!error && liveMessage && (
            <p
              className="text-[13px] leading-relaxed m-0"
              style={{ color: INK_MUTED }}
              key={liveMessage}
            >
              {liveMessage}
            </p>
          )}

          {error && (
            <p className="text-[13px] text-red-600 leading-snug max-w-xs mx-auto m-0 mt-2">
              {error}
            </p>
          )}

          {estimatedTime && !error && (
            <p className="text-[11px] leading-relaxed m-0 mt-2" style={{ color: INK_FAINT }}>
              Estimated time: {estimatedTime}
            </p>
          )}
        </div>

        {((steps && steps.length > 0) || (files && files.length > 0)) && (
          <div style={{ height: 1, background: "#F4F4F5" }} />
        )}

        {((steps && steps.length > 0) || (files && files.length > 0)) && (
          <div className="px-7 py-4 space-y-4">
            {files && files.length > 0 && (
              <div
                className={`space-y-2.5 ${steps && steps.length > 0 ? "pb-3.5 border-b border-[#F4F4F5]" : ""}`}
              >
                {files.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                    >
                      {fileIcon ?? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={INK_MUTED}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#18181B] truncate leading-tight m-0">
                        {f.name}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA] mt-0.5 m-0">
                        {f.subLabel ??
                          (typeof derivedPct === "number" ? `${derivedPct}% complete` : "Processing…")}
                      </p>
                    </div>
                    {f.badge && (
                      <span
                        className="shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: SURFACE,
                          color: INK_MUTED,
                          border: `1px solid ${BORDER}`,
                        }}
                      >
                        {f.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {steps && steps.length > 0 && (
              <div className="space-y-2">
                {steps.map((step) => (
                  <StepRow key={step.id} step={step} />
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="px-7 py-3.5 flex items-center justify-between"
          style={{ borderTop: `1px solid #F4F4F5` }}
        >
          {typeof derivedPct === "number" && !error ? (
            <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: INK }}>
              {derivedPct}%
            </span>
          ) : (
            <span className="flex gap-1.5">
              {!error &&
                [0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      background: "#4F5BD9",
                      opacity: 0.7,
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
            </span>
          )}
          <span className="text-[11px]" style={{ color: INK_FAINT }}>
            {error ? "" : hint ?? keepOpenNote ?? "Secure AI · keep this tab open"}
          </span>
        </div>

        {error && (onRetry || onDismiss) && (
          <div
            className="px-7 pb-6 flex items-center justify-center gap-3"
            style={{ borderTop: `1px solid #F4F4F5`, paddingTop: 16 }}
          >
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex items-center gap-1.5 px-4 py-2 border rounded-full text-[13px] font-medium transition cursor-pointer"
                style={{ borderColor: BORDER, color: INK_MUTED, background: "#fff" }}
              >
                <X className="w-3.5 h-3.5" />
                Dismiss
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="primary-gradient flex cursor-pointer items-center gap-1.5 rounded-full border-none px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
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

  if (mode === "page") {
    return (
      <div
        className={`flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-12 dpa-results-bg ${className}`}
      >
        {card}
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div
      className="dpa-results-bg absolute inset-0 z-50 flex items-center justify-center p-6 select-none"
    >
      {card}
    </div>
  );
}

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
