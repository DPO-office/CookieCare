import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, FileText, ShieldCheck, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Download, Copy, FileDown,
  Sparkles, Lock, Globe, Users, AlertCircle, Loader2,
  ArrowRight, RefreshCw, FileSearch, Scale, ClipboardList,
  BadgeCheck, Building2, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "upload" | "analyzing" | "results";

interface AnalysisStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

interface Finding {
  id: string;
  clause: string;
  status: "compliant" | "warning" | "missing";
  description: string;
  recommendation: string;
  article?: string;
}

interface Recommendation {
  category: string;
  icon: React.ReactNode;
  accent: string;
  items: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "structure",       label: "Reading document structure",               status: "pending" },
  { id: "parties",         label: "Identifying controller and processor",     status: "pending" },
  { id: "article28",       label: "Checking GDPR Article 28 compliance",      status: "pending" },
  { id: "obligations",     label: "Detecting processor obligations",          status: "pending" },
  { id: "security",        label: "Reviewing security measures",              status: "pending" },
  { id: "transfers",       label: "Checking international transfer clauses",  status: "pending" },
  { id: "missing",         label: "Detecting missing contractual clauses",    status: "pending" },
  { id: "risk",            label: "Performing risk assessment",               status: "pending" },
  { id: "recommendations", label: "Generating AI recommendations",            status: "pending" },
  { id: "report",          label: "Finalizing compliance report",             status: "pending" },
];

const MOCK_FINDINGS: Finding[] = [
  {
    id: "f1", clause: "Article 28 Compliance", status: "compliant", article: "Art. 28 GDPR",
    description: "The DPA correctly establishes the processor relationship and includes the required subject-matter, duration, nature and purpose of the processing.",
    recommendation: "No action required. Consider adding an explicit reference to the supervisory authority for added clarity.",
  },
  {
    id: "f2", clause: "Processor Obligations", status: "warning", article: "Art. 28(3)(a)",
    description: "Processor obligations are partially defined. The clause on sub-processor authorisation is present but lacks a mechanism for prior written consent before engaging new sub-processors.",
    recommendation: "Add a provision requiring the processor to obtain specific prior written consent from the controller before appointing any new sub-processor, with a notification window of at least 30 days.",
  },
  {
    id: "f3", clause: "Data Subject Rights", status: "compliant", article: "Art. 28(3)(e)",
    description: "The agreement includes obligations for the processor to assist the controller in responding to data subject requests.",
    recommendation: "Specify a response timeframe (e.g. within 5 business days) to avoid ambiguity.",
  },
  {
    id: "f4", clause: "Security Measures (Article 32)", status: "warning", article: "Art. 32 GDPR",
    description: "Security measures are referenced but described at a high level only. The agreement does not specify technical and organisational measures in sufficient detail.",
    recommendation: "Attach a dedicated Annex listing specific TOMs (encryption standards, access controls, pseudonymisation, backup procedures, penetration testing frequency).",
  },
  {
    id: "f5", clause: "International Data Transfers", status: "missing", article: "Art. 44–49 GDPR",
    description: "No provisions for international data transfers have been identified. If processing occurs outside the EEA, this is a critical compliance gap.",
    recommendation: "Add a clause specifying the legal basis for any transfers outside the EEA, referencing Standard Contractual Clauses (SCCs), Binding Corporate Rules, or an adequacy decision as applicable.",
  },
  {
    id: "f6", clause: "Data Breach Notification", status: "compliant", article: "Art. 33 GDPR",
    description: "The agreement includes a breach notification obligation requiring the processor to notify the controller without undue delay.",
    recommendation: "Strengthen by specifying the maximum notification period (e.g. 24 hours) and the required content of breach notifications.",
  },
  {
    id: "f7", clause: "Audit Rights", status: "warning", article: "Art. 28(3)(h)",
    description: "The audit rights clause allows the controller to conduct audits but does not specify notice periods, audit scope, or cost allocation.",
    recommendation: "Define audit notice requirements (minimum 30 days), permitted audit scope, frequency limits, and whether the controller or processor bears audit costs.",
  },
  {
    id: "f8", clause: "Data Deletion & Return", status: "missing", article: "Art. 28(3)(g)",
    description: "No clause addresses the deletion or return of personal data upon termination of the agreement.",
    recommendation: "Add a clause requiring the processor to return all personal data to the controller or delete it upon request, within a specified timeframe (e.g. 30 days), and provide written confirmation.",
  },
];

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  {
    category: "Missing Clauses",
    icon: <XCircle className="w-4 h-4" />,
    accent: "border-red-200 bg-red-50/40",
    items: [
      "International transfer provisions with SCCs or adequacy decision reference",
      "Data deletion and return clause with defined timeframes",
      "Sub-processor list as a binding annex with change notification mechanism",
    ],
  },
  {
    category: "Suggested Improvements",
    icon: <ChevronUp className="w-4 h-4" />,
    accent: "border-amber-200 bg-amber-50/40",
    items: [
      "Attach a detailed Annex II listing specific Technical and Organisational Measures (TOMs)",
      "Specify breach notification window (recommend 24 hours, not just 'without undue delay')",
      "Define audit notice period, scope and cost allocation explicitly",
      "Add a processor's obligation to maintain records of processing activities (Art. 30(2))",
    ],
  },
  {
    category: "Risk Mitigation",
    icon: <AlertTriangle className="w-4 h-4" />,
    accent: "border-orange-200 bg-orange-50/40",
    items: [
      "Obtain legal review of sub-processor change notification mechanism before execution",
      "Verify all sub-processors listed are covered by adequate transfer mechanisms",
      "Implement a DPA review cycle (annual) to keep pace with regulatory guidance",
    ],
  },
  {
    category: "Compliance Recommendations",
    icon: <CheckCircle2 className="w-4 h-4" />,
    accent: "border-emerald-200 bg-emerald-50/40",
    items: [
      "Register this DPA in your data processing register linked to the relevant ROPA entry",
      "Ensure corresponding SCCs are executed separately if international transfers apply",
      "Cross-reference this DPA with your Privacy Notice and ensure consistency",
    ],
  },
];

const FEATURE_CARDS = [
  { icon: ShieldCheck,   title: "GDPR Compliance",         description: "Verify alignment with GDPR Article 28 requirements and all mandatory DPA provisions." },
  { icon: ClipboardList, title: "Processor Obligations",   description: "Identify and validate all processor obligations including sub-processor controls." },
  { icon: Users,         title: "Data Subject Rights",     description: "Confirm the agreement covers data subject request handling and response timelines." },
  { icon: Lock,          title: "Security Measures",       description: "Assess Article 32 TOMs and technical safeguards against regulatory standards." },
  { icon: Globe,         title: "International Transfers", description: "Detect cross-border transfer provisions and validate legal transfer mechanisms." },
  { icon: Scale,         title: "Risk Assessment",         description: "Identify missing clauses, contractual risks, and critical compliance gaps." },
];

// ─── Radial Score Gauge ───────────────────────────────────────────────────────

function RadialGauge({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  // Arc covers 270° (¾ of circle), starting from bottom-left (135°)
  const arcLength = circ * 0.75;
  const offset = arcLength - (score / 100) * arcLength;
  const color = score >= 70 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  const trackColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-[135deg]">
        {/* Track */}
        <circle cx="48" cy="48" r={r} fill="none" stroke={trackColor} strokeWidth="7"
          strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
        {/* Progress */}
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

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Finding["status"] }) {
  const cfg = {
    compliant: { label: "Compliant", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    warning:   { label: "Warning",   cls: "bg-amber-50 text-amber-700 border border-amber-200",       icon: <AlertTriangle className="w-3 h-3" /> },
    missing:   { label: "Missing",   cls: "bg-red-50 text-red-700 border border-red-200",             icon: <XCircle className="w-3 h-3" /> },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const borderColor = { compliant: "border-l-emerald-400", warning: "border-l-amber-400", missing: "border-l-red-400" }[finding.status];
  const hoverBg = { compliant: "hover:bg-emerald-50/30", warning: "hover:bg-amber-50/30", missing: "hover:bg-red-50/30" }[finding.status];

  return (
    <div className={`bg-white border border-gray-200 rounded-[14px] shadow-xs border-l-[3px] ${borderColor} overflow-hidden transition-all duration-200 hover:shadow-sm`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-150 cursor-pointer ${hoverBg}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900">{finding.clause}</span>
              {finding.article && (
                <span className="badge badge-neutral text-[10px]">{finding.article}</span>
              )}
            </div>
            {!open && (
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1 pr-2">{finding.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <StatusBadge status={finding.status} />
          <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150 ${open ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100"}`}>
            {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          <div>
            <p className="section-label mb-2">Finding</p>
            <p className="text-[13px] text-gray-700 leading-relaxed">{finding.description}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-blue-600" />
              </div>
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">AI Recommendation</p>
            </div>
            <p className="text-[13px] text-blue-900 leading-relaxed">{finding.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Upload State ─────────────────────────────────────────────────────────────

function UploadState({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }, [onFileSelected]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB]">
      <div
        className="px-10 py-8 max-w-5xl mx-auto"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transition: "opacity 0.35s ease, transform 0.35s ease" }}
      >
        {/* ── Compact Hero ──────────────────────────────────── */}
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
              Upload your DPA and let AI review GDPR compliance, processor obligations, security requirements,
              contractual risks, and missing clauses to generate a comprehensive compliance report.
            </p>
          </div>
        </div>

        {/* ── Upload Zone */}
        <div className="mb-10">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
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
            {/* Subtle radial glow behind icon */}
            <div className={`absolute inset-0 rounded-[20px] transition-opacity duration-300 pointer-events-none
              ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ background: "radial-gradient(ellipse at 50% 40%,rgba(0,0,0,0.03) 0%,transparent 70%)" }}
            />

            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFile} />

            <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-250 shadow-xs
              ${dragging ? "bg-gray-900 text-white scale-110 shadow-md" : "bg-white text-gray-500 border border-gray-200 group-hover:bg-gray-900 group-hover:text-white group-hover:shadow-sm group-hover:scale-105"}`}>
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">
              {dragging ? "Drop your DPA to start analysis" : "Drag & drop your DPA here"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              or{" "}
              <span className="text-gray-900 font-semibold underline underline-offset-2">browse files</span>
              {" "}from your computer
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              {["PDF", "DOCX", "TXT"].map((fmt) => (
                <span key={fmt} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-xs">
                  <FileText className="w-3 h-3 text-gray-400" />{fmt}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 font-medium pl-1">· Max 25 MB · Up to 200 pages</span>
            </div>
          </div>
        </div>

        {/* ── What We'll Analyze ─────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">What we'll analyze</h2>
              <p className="text-[12.5px] text-gray-500 mt-0.5">Six critical compliance dimensions reviewed by our GDPR AI engine.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FEATURE_CARDS.map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="group bg-white border border-gray-200 rounded-[16px] p-5 shadow-xs cursor-default
                    hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
                  style={{ transitionDelay: `${i * 25}ms` }}
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 mb-3.5
                    group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 transition-all duration-200 shadow-xs">
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

// ─── Analyzing State ──────────────────────────────────────────────────────────

function AnalyzingState({ fileName, steps }: { fileName: string; steps: AnalysisStep[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress  = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB] flex flex-col items-center justify-center px-6 py-12">
      <div
        className="w-full max-w-md"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(12px)", transition: "opacity 0.4s ease, transform 0.4s ease" }}
      >
        {/* Label */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-[12px] font-semibold text-gray-500 mb-4 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Live AI Processing</span>
          </div>
          <h2 className="text-[21px] font-bold text-gray-900 tracking-tight mb-2">Analyzing your DPA</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Lexify AI is reviewing your agreement against GDPR requirements and compliance best practices.
          </p>
        </div>

        {/* Analysis card */}
        <div className="bg-white border border-gray-200 rounded-[20px] shadow-sm overflow-hidden mb-4">

          {/* Animated top bar */}
          <div className="h-[3px] bg-gray-100 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gray-900 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
            {/* Shimmer sweep */}
            <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{ animation: "dpa-shimmer 1.8s ease-in-out infinite", left: `${Math.max(0, progress - 8)}%` }}
            />
          </div>

          <div className="p-6">
            {/* File row */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 w-[18px] h-[18px] text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{fileName}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Data Processing Agreement · {progress}% complete</p>
              </div>
              <span className="badge badge-blue shrink-0 animate-pulse">Reviewing</span>
            </div>

            {/* Steps list */}
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 transition-all duration-400 ${step.status === "pending" ? "opacity-30" : "opacity-100"}`}
                >
                  {/* Step indicator */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                    ${step.status === "done"    ? "bg-emerald-100 border border-emerald-200" : ""}
                    ${step.status === "active"  ? "bg-gray-900" : ""}
                    ${step.status === "pending" ? "bg-gray-100 border border-gray-200" : ""}`}
                  >
                    {step.status === "done"    && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                    {step.status === "active"  && <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />}
                    {step.status === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
                  </div>

                  <span className={`text-[12.5px] leading-snug transition-all duration-200
                    ${step.status === "done"    ? "text-gray-600" : ""}
                    ${step.status === "active"  ? "text-gray-900 font-semibold" : ""}
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

        {/* Info footer */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-700">Keep this tab open until analysis is complete</p>
            <p className="text-[11px] text-gray-400 mt-0.5">This usually takes 10–30 seconds depending on document size</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dpa-shimmer {
          0%   { opacity: 0; transform: translateX(-20px); }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
}

// ─── Results State ────────────────────────────────────────────────────────────

function ResultsState({ fileName, onReset }: { fileName: string; onReset: () => void }) {
  const [activeTab, setActiveTab]       = useState<"findings" | "recommendations">("findings");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [findingFilter, setFindingFilter] = useState<"all" | Finding["status"]>("all");
  const [mounted, setMounted]            = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const compliantCount = MOCK_FINDINGS.filter((f) => f.status === "compliant").length;
  const warningCount   = MOCK_FINDINGS.filter((f) => f.status === "warning").length;
  const missingCount   = MOCK_FINDINGS.filter((f) => f.status === "missing").length;
  const score          = Math.round((compliantCount / MOCK_FINDINGS.length) * 100);
  const riskLevel      = missingCount >= 2 ? "High" : warningCount >= 2 ? "Medium" : "Low";

  const riskCfg = {
    High:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-100",    icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
    Medium: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-100",  icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
    Low:    { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-100",icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
  }[riskLevel];

  const filteredFindings = findingFilter === "all"
    ? MOCK_FINDINGS
    : MOCK_FINDINGS.filter((f) => f.status === findingFilter);

  const handleCopy = () => {
    const summary = `DPA Compliance Report\nFile: ${fileName}\nScore: ${score}/100\nRisk: ${riskLevel}\nCompliant: ${compliantCount}, Warnings: ${warningCount}, Missing: ${missingCount}`;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#FAFAFB] px-10 py-8"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(8px)", transition: "opacity 0.4s ease, transform 0.4s ease" }}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-success">Analysis Complete</span>
            <span className="text-[11px] text-gray-400 font-medium truncate max-w-[240px]">{fileName}</span>
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">DPA Compliance Report</h1>
          <p className="text-[13px] text-gray-500 mt-1">AI-generated GDPR compliance analysis and risk assessment.</p>
        </div>
        <button onClick={onReset} className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1">
          <RefreshCw className="w-3.5 h-3.5" />New Review
        </button>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

        {/* Compliance Score — radial gauge */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Compliance Score</p>
          <RadialGauge score={score} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {score >= 70 ? "Generally compliant" : score >= 50 ? "Needs attention" : "Critical gaps found"}
          </p>
        </div>

        {/* Risk Level */}
        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${riskCfg.bg} ${riskCfg.border}`}>
          <p className="section-label mb-3">Risk Level</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {riskCfg.icon}
            <span className={`text-[11px] font-bold uppercase tracking-wide ${riskCfg.text}`}>{riskLevel}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${riskCfg.text}`}>
            {riskLevel === "High" ? "Immediate action required" : riskLevel === "Medium" ? "Review recommended" : "Low risk profile"}
          </p>
        </div>

        {/* Missing Clauses */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Missing Clauses</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-red-50 border border-red-100 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold text-red-700 tabular-nums leading-none">{missingCount}</span>
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide mt-0.5">clauses</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Required by GDPR</p>
        </div>

        {/* Critical Findings */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Critical Findings</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-amber-50 border border-amber-100 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold text-amber-700 tabular-nums leading-none">{warningCount + missingCount}</span>
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide mt-0.5">findings</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{warningCount} warnings · {missingCount} missing</p>
        </div>
      </div>

      {/* ── Two-column workspace ───────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* ── Main panel ──────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Tab bar */}
          <div className="flex items-center gap-2">
            {(["findings", "recommendations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer
                  ${activeTab === t ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"}`}
              >
                {t === "findings"        && <FileSearch className="w-3.5 h-3.5" />}
                {t === "recommendations" && <Sparkles className="w-3.5 h-3.5" />}
                <span className="capitalize">{t}</span>
                {t === "findings" && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {MOCK_FINDINGS.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Findings ──────────────────────────────────── */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",       label: "All",       count: MOCK_FINDINGS.length, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "compliant", label: "Compliant", count: compliantCount,        cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "warning",   label: "Warning",   count: warningCount,          cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "missing",   label: "Missing",   count: missingCount,          cls: "bg-red-50 text-red-700 border border-red-200" },
                ] as const).map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setFindingFilter(f.val)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150 cursor-pointer ${f.cls}
                      ${findingFilter === f.val ? "ring-2 ring-gray-900 ring-offset-1 shadow-xs" : "hover:opacity-80"}`}
                  >
                    {f.label}
                    <span className="font-bold opacity-70">{f.count}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {filteredFindings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {/* ── Recommendations ───────────────────────────── */}
          {activeTab === "recommendations" && (
            <div className="space-y-4">
              {MOCK_RECOMMENDATIONS.map((rec) => (
                <div key={rec.category} className={`border rounded-[18px] overflow-hidden shadow-xs ${rec.accent}`}>
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-white flex items-center justify-center text-gray-600 shadow-xs">
                      {rec.icon}
                    </div>
                    <h3 className="text-[13px] font-bold text-gray-900">{rec.category}</h3>
                    <span className="ml-auto text-[11px] font-semibold text-gray-500 bg-white/60 rounded-md px-2 py-0.5">
                      {rec.items.length} item{rec.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* Items */}
                  <div className="divide-y divide-white/40">
                    {rec.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-3.5 bg-white/30 hover:bg-white/50 transition-colors duration-150">
                        <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                          <ArrowRight className="w-2.5 h-2.5 text-gray-500" />
                        </div>
                        <p className="text-[13px] text-gray-800 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right sidebar ────────────────────────────────── */}
        <div className="xl:w-[320px] shrink-0 space-y-4">

          {/* Score breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Score Breakdown</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label: "Compliant", count: compliantCount, total: MOCK_FINDINGS.length, barColor: "bg-emerald-400", textColor: "text-emerald-700" },
                { label: "Warnings",  count: warningCount,   total: MOCK_FINDINGS.length, barColor: "bg-amber-400",   textColor: "text-amber-700" },
                { label: "Missing",   count: missingCount,   total: MOCK_FINDINGS.length, barColor: "bg-red-400",     textColor: "text-red-700" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                    <span className={`text-[12px] font-bold tabular-nums ${item.textColor}`}>{item.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.barColor} transition-all duration-700 ease-out`}
                      style={{ width: `${Math.round((item.count / item.total) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export actions */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Export Report</p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <button className="w-full btn-primary justify-center py-2.5 cursor-pointer">
                <Download className="w-4 h-4" />Download Report
              </button>
              <button className="w-full btn-secondary justify-center py-2.5 cursor-pointer">
                <FileDown className="w-4 h-4" />Export PDF
              </button>
              <button onClick={handleCopy} className="w-full btn-secondary justify-center py-2.5 cursor-pointer transition-colors">
                {copiedSummary
                  ? <><Check className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Copied to clipboard</span></>
                  : <><Copy className="w-4 h-4" />Copy Summary</>
                }
              </button>
            </div>
          </div>

          {/* Document info */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Document Details</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "File",     value: fileName },
                { label: "Type",     value: "Data Processing Agreement" },
                { label: "Standard", value: "GDPR / EU 2016/679" },
                { label: "Reviewed", value: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right truncate">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DPAReviewer() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [steps, setSteps]       = useState<AnalysisStep[]>(ANALYSIS_STEPS.map((s) => ({ ...s })));
  const stepTimerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (stepTimerRef.current) clearTimeout(stepTimerRef.current); }, []);

  const runAnalysis = useCallback(() => {
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
    const total = ANALYSIS_STEPS.length;
    let current = 0;

    const advance = () => {
      setSteps((prev) => {
        const next = [...prev];
        if (current > 0) next[current - 1] = { ...next[current - 1], status: "done" };
        if (current < total) next[current]  = { ...next[current],     status: "active" };
        return next;
      });

      if (current < total) {
        current++;
        const delay = 800 + Math.random() * 600;
        stepTimerRef.current = setTimeout(() => {
          if (current === total) {
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
            stepTimerRef.current = setTimeout(() => setAppState("results"), 700);
          } else {
            advance();
          }
        }, delay);
      }
    };

    advance();
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    setFileName(file.name);
    setAppState("analyzing");
    runAnalysis();
  }, [runAnalysis]);

  const handleReset = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setAppState("upload");
    setFileName("");
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload"    && <UploadState    onFileSelected={handleFileSelected} />}
      {appState === "analyzing" && <AnalyzingState  fileName={fileName} steps={steps} />}
      {appState === "results"   && <ResultsState    fileName={fileName} onReset={handleReset} />}
    </div>
  );
}
