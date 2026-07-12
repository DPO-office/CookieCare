import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileText, Sparkles, ArrowRight } from "lucide-react";
import { FEATURE_CARDS } from "../constants";

interface DPAUploadStateProps {
  onFileSelected: (file: File) => void;
}

export function DPAUploadState({ onFileSelected }: DPAUploadStateProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB]">
      <div
        className="px-10 py-8 max-w-5xl mx-auto"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "none" : "translateY(10px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-gray-500 mb-4 shadow-xs">
              <Sparkles className="w-3 h-3 text-gray-400" />
              <span>AI-Powered DPA Analysis</span>
            </div>
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight mb-2.5">
              Data Processing Agreement Reviewer
            </h1>
            <p className="text-[13.5px] text-gray-500 leading-relaxed">
              Upload your DPA and let AI review GDPR compliance, processor
              obligations, security requirements, contractual risks, and missing
              clauses to generate a comprehensive compliance report.
            </p>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-10">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragging(false);
            }}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative rounded-[20px] p-10 text-center cursor-pointer transition-all duration-250 group overflow-hidden
              ${dragging
                ? "border-2 border-dashed border-gray-500 bg-gray-50 scale-[1.008] shadow-md"
                : "border-2 border-dashed border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
            style={{
              background: dragging
                ? "linear-gradient(135deg,#F9FAFB 0%,#F3F4F6 100%)"
                : "linear-gradient(135deg,#FFFFFF 0%,#FAFAFA 60%,#F5F5F5 100%)",
            }}
          >
            <div
              className={`absolute inset-0 rounded-[20px] transition-opacity duration-300 pointer-events-none ${
                dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              style={{
                background:
                  "radial-gradient(ellipse at 50% 40%,rgba(0,0,0,0.03) 0%,transparent 70%)",
              }}
            />
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt"
              onChange={handleFile}
            />
            <div
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-250 shadow-xs
                ${dragging
                  ? "bg-gray-900 text-white scale-110 shadow-md"
                  : "bg-white text-gray-500 border border-gray-200 group-hover:bg-gray-900 group-hover:text-white group-hover:shadow-sm group-hover:scale-105"
                }`}
            >
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">
              {dragging ? "Drop your DPA to start analysis" : "Drag & drop your DPA here"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              or{" "}
              <span className="text-gray-900 font-semibold underline underline-offset-2">
                browse files
              </span>{" "}
              from your computer
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {["PDF", "DOCX", "TXT"].map((fmt) => (
                <span
                  key={fmt}
                  className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-xs"
                >
                  <FileText className="w-3 h-3 text-gray-400" />
                  {fmt}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 font-medium pl-1">
                · Max 25 MB · Up to 200 pages
              </span>
            </div>
          </div>
        </div>

        {/* What We'll Analyze */}
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">
                What we'll analyze
              </h2>
              <p className="text-[12.5px] text-gray-500 mt-0.5">
                Six critical compliance dimensions reviewed by our GDPR AI engine.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FEATURE_CARDS.map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="group bg-white border border-gray-200 rounded-[16px] p-5 shadow-xs cursor-default hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
                  style={{ transitionDelay: `${i * 25}ms` }}
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 mb-3.5 group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 transition-all duration-200 shadow-xs">
                    <Icon className="w-[17px] h-[17px]" />
                  </div>
                  <h3 className="text-[13px] font-bold text-gray-900 mb-1 tracking-tight">{card.title}</h3>
                  <p className="text-[12px] text-gray-500 leading-relaxed">{card.description}</p>
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-1 text-[11px] font-medium text-gray-400 group-hover:text-gray-600 transition-colors">
                    <span>AI reviewed</span>
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
