import React, { useState, useEffect } from "react";
import { Brain, AlertCircle, Loader2, Check } from "lucide-react";
import { AnalysisStep } from "../types";

interface EthicsAnalyzingStateProps {
  fileNames: string[];
  steps: AnalysisStep[];
}

export function EthicsAnalyzingState({ fileNames, steps }: EthicsAnalyzingStateProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB] flex flex-col items-center justify-center px-6 py-12">
      <div
        className="w-full max-w-md"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "none" : "translateY(12px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-[12px] font-semibold text-gray-500 mb-4 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Live AI Processing</span>
          </div>
          <h2 className="text-[21px] font-bold text-gray-900 tracking-tight mb-2">
            Evaluating AI Ethics
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Lexify AI is evaluating your AI system against responsible AI
            principles and governance best practices. This typically takes a
            few moments depending on the uploaded documentation.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[20px] shadow-sm overflow-hidden mb-4">
          <div className="h-[3px] bg-gray-100 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out bg-gray-900"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{
                animation: "ethics-shimmer 1.8s ease-in-out infinite",
                left: `${Math.max(0, progress - 8)}%`,
              }}
            />
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Brain className="w-[18px] h-[18px] text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">
                  {fileNames[0]}
                  {fileNames.length > 1 ? ` +${fileNames.length - 1} more` : ""}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  AI Documentation · {progress}% complete
                </p>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 shrink-0 animate-pulse">
                Evaluating
              </span>
            </div>

            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 transition-all duration-400 ${
                    step.status === "pending" ? "opacity-30" : "opacity-100"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                      ${step.status === "done" ? "bg-emerald-100 border border-emerald-200" : ""}
                      ${step.status === "active" ? "bg-gray-900" : ""}
                      ${step.status === "pending" ? "bg-gray-100 border border-gray-200" : ""}`}
                  >
                    {step.status === "done" && (
                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                    )}
                    {step.status === "active" && (
                      <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                    )}
                    {step.status === "pending" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <span
                    className={`text-[12.5px] leading-snug transition-all duration-200
                      ${step.status === "done" ? "text-gray-600" : ""}
                      ${step.status === "active" ? "text-gray-900 font-semibold" : ""}
                      ${step.status === "pending" ? "text-gray-400" : ""}`}
                  >
                    {step.label}
                  </span>
                  {step.status === "done" && (
                    <Check className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-700">
              Keep this tab open until assessment is complete
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              This usually takes 15–45 seconds depending on document size
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ethics-shimmer {
          0%   { opacity: 0; transform: translateX(-20px); }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
}
