import React, { useState, useRef, useEffect } from "react";
import {
  Upload, FileText, Brain,
  ArrowRight, BadgeCheck, Shield, Scale, XCircle, Sparkles,
} from "lucide-react";
import { FEATURE_CARDS } from "../constants";
import { WebsiteUrlInput, validateUrl } from "../../../shared/components/WebsiteUrlInput";
import { useFileUpload } from "../../vendorReview/hooks/useFileUpload";

interface EthicsUploadStateProps {
  onFilesSelected: (files: File[], websiteUrl?: string) => void;
  error?: string;
}

const DOCUMENT_TYPES = [
  "AI Policy",
  "Model Documentation",
  "Risk Assessment",
  "System Architecture",
  "Data Governance Policy",
  "AI Impact Assessment",
];

export function EthicsUploadState({ onFilesSelected, error }: EthicsUploadStateProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();

  const { uploadedFiles, dragging, addFiles, removeFile, setDragging } = useFileUpload();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleUrlChange = (val: string) => {
    setWebsiteUrl(val);
    if (urlError) setUrlError(undefined);
  };

  const handleAnalyze = () => {
    if (uploadedFiles.length > 0) {
      onFilesSelected(uploadedFiles.map((e) => e.file), websiteUrl.trim() || undefined);
    }
  };

  const handleAnalyzeWebsite = () => {
    const err = validateUrl(websiteUrl);
    if (err) { setUrlError(err); return; }
    setUrlError(undefined);
    onFilesSelected(uploadedFiles.map((e) => e.file), websiteUrl.trim());
  };

  // Dynamic button label — mirrors Vendor Review logic exactly
  const hasFiles = uploadedFiles.length > 0;
  const hasUrl = websiteUrl.trim() !== "" && !validateUrl(websiteUrl);
  const analyzeLabel = (() => {
    if (hasFiles && hasUrl)
      return `Analyze ${uploadedFiles.length} Document${uploadedFiles.length !== 1 ? "s" : ""} + Website`;
    if (hasFiles)
      return `Analyze ${uploadedFiles.length} Document${uploadedFiles.length !== 1 ? "s" : ""}`;
    if (hasUrl)
      return "Analyze Website";
    return null;
  })();

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
        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">         
           <div className="max-w-2xl">
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight mb-2.5">
              AI Ethics Score
            </h1>
            <p className="text-[13.5px] text-gray-500 leading-relaxed max-w-xl">
              Upload your AI documentation and let Lexify AI evaluate
              fairness, transparency, accountability, governance, privacy and
              responsible AI practices to generate a comprehensive AI Ethics
              Score.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { label: "Responsible AI", icon: <Shield className="w-3 h-3" /> },
                { label: "AI Governance", icon: <Brain className="w-3 h-3" /> },
                { label: "Ethics Assessment", icon: <Scale className="w-3 h-3" /> },
                { label: "Enterprise Ready", icon: <BadgeCheck className="w-3 h-3" /> },
              ].map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-xs"
                >
                  {b.icon}
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-6">
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
              multiple
            />
            <div
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-250 shadow-xs
                ${dragging
                  ? "bg-gray-900 text-white scale-110 shadow-md"
                  : "bg-white text-gray-500 border border-gray-200 group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 group-hover:shadow-sm group-hover:scale-105"
                }`}
            >
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">
              {dragging
                ? "Drop your AI documentation to begin"
                : "Drag & drop your AI documentation here"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              or{" "}
              <span className="text-gray-900 font-semibold underline underline-offset-2">
                browse files
              </span>{" "}
              from your computer
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              {DOCUMENT_TYPES.map((dt) => (
                <span
                  key={dt}
                  className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-xs"
                >
                  <FileText className="w-3 h-3 text-gray-400" />
                  {dt}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
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
                · Max 25 MB
              </span>
            </div>
          </div>
        </div>

        {/* Website URL Input */}
        <div className="mb-6">
          <WebsiteUrlInput
            value={websiteUrl}
            onChange={handleUrlChange}
            onAnalyze={handleAnalyzeWebsite}
            error={urlError}
          />
        </div>

        {/* Queued file list + primary action button */}
        {(hasFiles || hasUrl) && (
          <div className="mb-6 space-y-2">
            {hasFiles && (
              <>
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Queued for analysis
                </p>
                {uploadedFiles.map(({ file, id }) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-[14px] px-4 py-3 shadow-xs group hover:shadow-sm transition-all duration-150"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{file.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(id); }}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-150 shrink-0"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </>
            )}

            <button
              onClick={hasFiles ? handleAnalyze : handleAnalyzeWebsite}
              className="btn-primary w-full justify-center py-3 mt-3 text-[13px] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {analyzeLabel}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* What We'll Analyze */}
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">
                What we'll analyze
              </h2>
              <p className="text-[12.5px] text-gray-500 mt-0.5">
                Six responsible AI dimensions evaluated by our ethics AI engine.
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
                  <h3 className="text-[13px] font-bold text-gray-900 mb-1 tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-[12px] text-gray-500 leading-relaxed">
                    {card.description}
                  </p>
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
