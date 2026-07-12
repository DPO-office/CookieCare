import React from "react";
import { Sparkles, Loader2, AlertTriangle, RefreshCw, X } from "lucide-react";

const PROGRESS_STEPS = [
  "Preparing request…",
  "Uploading document…",
  "Reading document…",
  "Extracting text…",
  "Processing input…",
  "Sending to AI…",
  "Analyzing…",
  "Validating output…",
  "Generating response…",
  "Formatting results…",
  "Finalizing…",
];

interface AiProgressOverlayProps {
  visible: boolean;
  message?: string;
  error?: string;
  label?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function AiProgressOverlay({
  visible,
  message,
  error,
  label = "AI Processing",
  onRetry,
  onDismiss,
}: AiProgressOverlayProps) {
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (!visible || error) return;
    setStepIndex(0);
    const interval = setInterval(() => setStepIndex((p) => (p + 1) % PROGRESS_STEPS.length), 1800);
    return () => clearInterval(interval);
  }, [visible, error]);

  if (!visible) return null;

  const displayMessage = error
    ? error
    : message?.trim()
    ? message
    : PROGRESS_STEPS[stepIndex];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/92 backdrop-blur-[2px] p-6 select-none">
      <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl shadow-lg p-8 text-center space-y-5 relative overflow-hidden">
        {!error && (
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gray-100 overflow-hidden">
            <div className="h-full bg-gray-900 rounded-full" style={{ width: "40%", animation: "slideIndeterminate 1.5s cubic-bezier(0.65,0,0.35,1) infinite" }} />
          </div>
        )}
        {error && <div className="absolute inset-x-0 top-0 h-[3px] bg-red-400 rounded-full" />}
        <div className="flex justify-center">
          {error ? (
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
          ) : (
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-gray-100 border-t-gray-900 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-gray-900" />
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {error ? "Error" : label}
          </p>
          <p className={`text-sm font-medium leading-snug transition-all ${error ? "text-red-700" : "text-gray-800"}`}>
            {displayMessage}
          </p>
        </div>
        {!error && (
          <div className="flex justify-center gap-1.5 pt-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center gap-3 pt-1">
            {onDismiss && (
              <button onClick={onDismiss} className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">
                <X className="w-3.5 h-3.5" />Dismiss
              </button>
            )}
            {onRetry && (
              <button onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />Retry
              </button>
            )}
          </div>
        )}
        {!error && (
          <div className="pt-1 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Secure AI engine · Do not close</span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes slideIndeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
