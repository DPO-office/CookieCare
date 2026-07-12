import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, FileText, Brain, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Download, Copy, FileDown,
  Sparkles, Eye, Users, AlertCircle, Loader2,
  ArrowRight, RefreshCw, FileSearch, Shield, ClipboardCheck,
  BadgeCheck, Check, Info, BarChart3, Lock, Scale,
  Cpu, Layers, UserCheck, Database, ScanEye, TrendingUp,
  Activity, Star, Gauge,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "upload" | "analyzing" | "results";

interface AnalysisStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

interface EthicsFinding {
  id: string;
  category: string;
  status: "passed" | "needs-improvement" | "warning" | "high-risk";
  description: string;
  recommendation: string;
}

interface EthicsRecommendation {
  category: string;
  icon: React.ReactNode;
  accent: string;
  items: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "read",          label: "Reading AI documentation",                  status: "pending" },
  { id: "identify",      label: "Identifying AI system information",         status: "pending" },
  { id: "fairness",      label: "Evaluating fairness and bias",              status: "pending" },
  { id: "transparency",  label: "Reviewing transparency practices",          status: "pending" },
  { id: "accountability",label: "Checking accountability controls",          status: "pending" },
  { id: "privacy",       label: "Assessing privacy and data governance",     status: "pending" },
  { id: "oversight",     label: "Evaluating human oversight",                status: "pending" },
  { id: "score",         label: "Calculating AI Ethics Score",               status: "pending" },
  { id: "recommendations",label: "Generating recommendations",              status: "pending" },
  { id: "finalize",      label: "Finalizing assessment",                     status: "pending" },
];

const MOCK_FINDINGS: EthicsFinding[] = [
  {
    id: "f1", category: "Fairness & Bias", status: "warning",
    description: "The model documentation references demographic parity as a fairness metric but does not provide quantitative bias audit results across protected attributes including race, gender, and age.",
    recommendation: "Conduct and publish formal bias audits covering all relevant protected attributes. Adopt multiple fairness metrics (equalized odds, calibration) and disclose test set composition.",
  },
  {
    id: "f2", category: "Transparency", status: "needs-improvement",
    description: "Model architecture and training methodology are described at a high level only. No model card or system card has been provided detailing performance across subgroups, known limitations, or out-of-scope use cases.",
    recommendation: "Publish a comprehensive model card following the Mitchell et al. (2019) framework, including intended use, performance metrics per demographic group, and documented failure modes.",
  },
  {
    id: "f3", category: "Accountability", status: "passed",
    description: "An AI governance committee is established with clear ownership. The documentation identifies a named AI Officer responsible for ethics oversight and an escalation path for AI-related concerns.",
    recommendation: "Consider establishing a formal AI incident register and a process for post-deployment monitoring reviews at defined intervals (e.g. quarterly).",
  },
  {
    id: "f4", category: "Privacy & Data Governance", status: "warning",
    description: "Training data provenance documentation is partially complete. Consent mechanisms for personal data used in training are referenced but not fully evidenced. Data retention for model inputs is undefined.",
    recommendation: "Document full data lineage including source, consent basis, anonymisation techniques, and retention schedules. Conduct a Data Protection Impact Assessment (DPIA) for high-risk processing.",
  },
  {
    id: "f5", category: "Human Oversight", status: "passed",
    description: "The system architecture includes human review checkpoints for high-stakes decisions. An override mechanism is documented and access controls for intervention are defined.",
    recommendation: "Expand human oversight logging to capture all override events. Define SLAs for human review queues and ensure adequate staffing for peak load scenarios.",
  },
  {
    id: "f6", category: "Security Controls", status: "needs-improvement",
    description: "Adversarial robustness testing is not mentioned in the documentation. There is no reference to model security assessments, prompt injection mitigations, or data poisoning controls.",
    recommendation: "Integrate adversarial testing into the model release pipeline. Document red-teaming results and implement input validation and output filtering controls.",
  },
  {
    id: "f7", category: "Documentation Quality", status: "warning",
    description: "Technical documentation is present but lacks version control evidence. Multiple referenced annexes are missing. The risk register has not been updated to reflect the current model version.",
    recommendation: "Establish a documentation governance policy with versioning requirements. Link the risk register to the model release cycle and assign documentation owners.",
  },
  {
    id: "f8", category: "Explainability", status: "high-risk",
    description: "No explainability mechanisms are documented for end-user-facing decisions. Individuals affected by automated decisions have no access to explanations, which may conflict with GDPR Article 22 requirements.",
    recommendation: "Implement and document an explainability layer (e.g. LIME, SHAP, or rule-based summaries). Provide affected individuals with meaningful information about automated decision logic.",
  },
];

const MOCK_RECOMMENDATIONS: EthicsRecommendation[] = [
  {
    category: "Bias Mitigation",
    icon: <Scale className="w-4 h-4" />,
    accent: "border-red-200 bg-red-50/40",
    items: [
      "Commission an independent bias audit covering all protected attributes before next model release",
      "Adopt a bias monitoring pipeline in production with automated alerts for performance drift across groups",
      "Document fairness constraints applied during training and any trade-offs accepted between fairness metrics",
    ],
  },
  {
    category: "Governance Improvements",
    icon: <ClipboardCheck className="w-4 h-4" />,
    accent: "border-amber-200 bg-amber-50/40",
    items: [
      "Establish a formal AI incident register with severity classifications and response SLAs",
      "Define a model lifecycle policy covering versioning, deprecation, and incident retrospectives",
      "Expand AI governance committee to include external ethics advisory representation",
      "Introduce mandatory ethics review gates at key stages of the model development lifecycle",
    ],
  },
  {
    category: "Transparency Enhancements",
    icon: <Eye className="w-4 h-4" />,
    accent: "border-blue-200 bg-blue-50/40",
    items: [
      "Publish a model card aligned with industry standards covering intended use, limitations, and subgroup performance",
      "Create a public-facing AI system summary accessible to non-technical stakeholders",
      "Document training data composition, provenance, and consent basis in a data card",
    ],
  },
  {
    category: "Privacy Recommendations",
    icon: <Lock className="w-4 h-4" />,
    accent: "border-orange-200 bg-orange-50/40",
    items: [
      "Complete and publish a DPIA for all high-risk processing activities involving personal data",
      "Define and enforce data retention schedules for model inputs and outputs",
      "Review training data consent mechanisms and remediate any gaps before next model update",
    ],
  },
  {
    category: "Human Oversight Suggestions",
    icon: <UserCheck className="w-4 h-4" />,
    accent: "border-emerald-200 bg-emerald-50/40",
    items: [
      "Extend override logging to capture rationale, reviewer identity, and outcome for audit purposes",
      "Define escalation thresholds for automated decisions requiring mandatory human review",
      "Conduct regular tabletop exercises to validate that oversight mechanisms work under load",
    ],
  },
];

const FEATURE_CARDS = [
  { icon: Scale,      title: "Fairness & Bias",         description: "Detect potential bias and fairness risks across protected attributes and demographic groups." },
  { icon: Eye,        title: "Transparency",             description: "Review explainability mechanisms, model cards, and documentation quality." },
  { icon: ClipboardCheck, title: "Accountability",      description: "Evaluate AI governance ownership, oversight structures and escalation controls." },
  { icon: Database,   title: "Privacy & Data Governance", description: "Assess responsible handling of personal data in training and inference pipelines." },
  { icon: UserCheck,  title: "Human Oversight",          description: "Review human involvement, override mechanisms and monitoring capabilities." },
  { icon: Gauge,      title: "Risk Assessment",          description: "Generate an overall AI ethics risk evaluation and governance gap analysis." },
];

const ETHICS_BREAKDOWN = [
  { label: "Fairness",       score: 58 },
  { label: "Transparency",   score: 45 },
  { label: "Accountability", score: 82 },
  { label: "Privacy",        score: 64 },
  { label: "Human Oversight",score: 79 },
  { label: "Governance",     score: 61 },
];

// ─── Radial Score Gauge ───────────────────────────────────────────────────────

function EthicsRadialGauge({ score, size = 96 }: { score: number; size?: number }) {
  const r = size * 0.375;
  const circ = 2 * Math.PI * r;
  const arcLength = circ * 0.75;
  const offset = arcLength - (score / 100) * arcLength;
  const color = score >= 70 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  const trackColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const cx = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[135deg]">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth="7"
          strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${arcLength - offset} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold tabular-nums leading-none" style={{ fontSize: size * 0.22, color }}>{score}</span>
        <span className="font-bold uppercase tracking-wide" style={{ fontSize: size * 0.09, color: color + "99", marginTop: 2 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function EthicsBadge({ status }: { status: EthicsFinding["status"] }) {
  const cfg = {
    "passed":           { label: "Passed",           cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",    icon: <CheckCircle2 className="w-3 h-3" /> },
    "needs-improvement":{ label: "Needs Improvement", cls: "bg-gray-100 text-gray-700 border border-gray-200",       icon: <Info className="w-3 h-3" /> },
    "warning":          { label: "Warning",           cls: "bg-amber-50 text-amber-700 border border-amber-200",         icon: <AlertTriangle className="w-3 h-3" /> },
    "high-risk":        { label: "High Risk",          cls: "bg-red-100 text-red-800 border border-red-300",             icon: <XCircle className="w-3 h-3" /> },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function EthicsFindingCard({ finding }: { finding: EthicsFinding }) {
  const [open, setOpen] = useState(false);
  const borderColor = {
    "passed":            "border-l-emerald-400",
    "needs-improvement": "border-l-gray-400",
    "warning":           "border-l-amber-400",
    "high-risk":         "border-l-red-400",
  }[finding.status];
  const hoverBg = {
    "passed":            "hover:bg-emerald-50/30",
    "needs-improvement": "hover:bg-gray-50/60",
    "warning":           "hover:bg-amber-50/30",
    "high-risk":         "hover:bg-red-50/30",
  }[finding.status];

  return (
    <div className={`bg-white border border-gray-200 rounded-[14px] shadow-xs border-l-[3px] ${borderColor} overflow-hidden transition-all duration-200 hover:shadow-sm`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-150 cursor-pointer ${hoverBg}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900">{finding.category}</span>
            </div>
            {!open && (
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1 pr-2">{finding.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <EthicsBadge status={finding.status} />
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
          <div className="bg-gradient-to-br from-blue-50 to-gray-50/50 border border-blue-100 rounded-xl p-4">
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

function UploadState({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFilesSelected(files);
  };

  const DOCUMENT_TYPES = ["AI Policy", "Model Documentation", "Risk Assessment", "System Architecture", "Data Governance Policy", "AI Impact Assessment"];

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB]">
      <div
        className="px-10 py-8 max-w-5xl mx-auto"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transition: "opacity 0.35s ease, transform 0.35s ease" }}
      >
        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-gray-500 mb-4 shadow-xs">
              <Brain className="w-3 h-3 text-gray-400" />
              <span>AI-Powered Ethics Assessment</span>
            </div>
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight mb-2.5">
              AI Ethics Score
            </h1>
            <p className="text-[13.5px] text-gray-500 leading-relaxed max-w-xl">
              Upload your AI documentation and let Lexify AI evaluate fairness, transparency, accountability,
              governance, privacy and responsible AI practices to generate a comprehensive AI Ethics Score.
            </p>
            {/* Premium badges */}
            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { label: "Responsible AI",    icon: <Shield className="w-3 h-3" /> },
                { label: "AI Governance",     icon: <Brain className="w-3 h-3" /> },
                { label: "Ethics Assessment", icon: <Scale className="w-3 h-3" /> },
                { label: "Enterprise Ready",  icon: <BadgeCheck className="w-3 h-3" /> },
              ].map((b) => (
                <span key={b.label} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-xs">
                  {b.icon}{b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Zone */}
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
            <div className={`absolute inset-0 rounded-[20px] transition-opacity duration-300 pointer-events-none
              ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ background: "radial-gradient(ellipse at 50% 40%,rgba(0,0,0,0.03) 0%,transparent 70%)" }}
            />

            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFile} multiple />

            <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-250 shadow-xs
              ${dragging
                ? "bg-gray-900 text-white scale-110 shadow-md"
                : "bg-white text-gray-500 border border-gray-200 group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 group-hover:shadow-sm group-hover:scale-105"
              }`}>
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">
              {dragging ? "Drop your AI documentation to begin" : "Drag & drop your AI documentation here"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              or{" "}
              <span className="text-gray-900 font-semibold underline underline-offset-2">browse files</span>
              {" "}from your computer
            </p>

            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              {DOCUMENT_TYPES.map((dt) => (
                <span key={dt} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-xs">
                  <FileText className="w-3 h-3 text-gray-400" />{dt}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
              {["PDF", "DOCX", "TXT"].map((fmt) => (
                <span key={fmt} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-xs">
                  <FileText className="w-3 h-3 text-gray-400" />{fmt}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 font-medium pl-1">· Max 25 MB</span>
            </div>
          </div>
        </div>

        {/* What We'll Analyze */}
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">What we'll analyze</h2>
              <p className="text-[12.5px] text-gray-500 mt-0.5">Six responsible AI dimensions evaluated by our ethics AI engine.</p>
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

function AnalyzingState({ fileNames, steps }: { fileNames: string[]; steps: AnalysisStep[] }) {
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
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-[12px] font-semibold text-gray-500 mb-4 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Live AI Processing</span>
          </div>
          <h2 className="text-[21px] font-bold text-gray-900 tracking-tight mb-2">Evaluating AI Ethics</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Lexify AI is evaluating your AI system against responsible AI principles and governance best practices.
            This typically takes a few moments depending on the uploaded documentation.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[20px] shadow-sm overflow-hidden mb-4">
          {/* Animated top bar */}
          <div className="h-[3px] bg-gray-100 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out bg-gray-900"
              style={{ width: `${progress}%` }}
            />
            <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{ animation: "ethics-shimmer 1.8s ease-in-out infinite", left: `${Math.max(0, progress - 8)}%` }}
            />
          </div>

          <div className="p-6">
            {/* Files row */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Brain className="w-[18px] h-[18px] text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{fileNames[0]}{fileNames.length > 1 ? ` +${fileNames.length - 1} more` : ""}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">AI Documentation · {progress}% complete</p>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 shrink-0 animate-pulse">
                Evaluating
              </span>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 transition-all duration-400 ${step.status === "pending" ? "opacity-30" : "opacity-100"}`}
                >
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

        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-700">Keep this tab open until assessment is complete</p>
            <p className="text-[11px] text-gray-400 mt-0.5">This usually takes 15–45 seconds depending on document size</p>
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

// ─── Results State ────────────────────────────────────────────────────────────

function ResultsState({ fileNames, onReset }: { fileNames: string[]; onReset: () => void }) {
  const [activeTab, setActiveTab]         = useState<"findings" | "recommendations">("findings");
  const [findingFilter, setFindingFilter] = useState<"all" | EthicsFinding["status"]>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [mounted, setMounted]             = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const passedCount     = MOCK_FINDINGS.filter((f) => f.status === "passed").length;
  const needsImpCount   = MOCK_FINDINGS.filter((f) => f.status === "needs-improvement").length;
  const warningCount    = MOCK_FINDINGS.filter((f) => f.status === "warning").length;
  const highRiskCount   = MOCK_FINDINGS.filter((f) => f.status === "high-risk").length;

  const ethicsScore  = 62;
  const riskLevel    = highRiskCount > 0 ? "High Risk" : warningCount >= 2 ? "Medium" : "Low";
  const highPriority = highRiskCount + warningCount;
  const complianceStatus = highRiskCount > 0 ? "Needs Action" : warningCount >= 2 ? "Partial" : "Compliant";

  const riskCfg = {
    "High Risk": { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100"    },
    "Medium":    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"  },
    "Low":       { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100"},
  }[riskLevel];

  const complianceCfg = {
    "Needs Action": { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100",    icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
    "Partial":      { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100",  icon: <AlertCircle className="w-5 h-5 text-amber-500" /> },
    "Compliant":    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100",icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
  }[complianceStatus];

  const filteredFindings = findingFilter === "all"
    ? MOCK_FINDINGS
    : MOCK_FINDINGS.filter((f) => f.status === findingFilter);

  const handleCopy = () => {
    const summary = `AI Ethics Assessment Report\nFile: ${fileNames[0]}\nEthics Score: ${ethicsScore}/100\nRisk Level: ${riskLevel}\nHigh Priority: ${highPriority}\nStatus: ${complianceStatus}`;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#FAFAFB] px-10 py-8"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(8px)", transition: "opacity 0.4s ease, transform 0.4s ease" }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-success">
              <CheckCircle2 className="w-3 h-3" />Assessment Complete
            </span>
            <span className="text-[11px] text-gray-400 font-medium">{fileNames.length} document{fileNames.length !== 1 ? "s" : ""} reviewed</span>
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">AI Ethics Score</h1>
          <p className="text-[13px] text-gray-500 mt-1">AI-generated responsible AI evaluation and governance assessment.</p>
        </div>
        <button onClick={onReset} className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1">
          <RefreshCw className="w-3.5 h-3.5" />New Assessment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

        {/* AI Ethics Score */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">AI Ethics Score</p>
          <EthicsRadialGauge score={ethicsScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {ethicsScore >= 70 ? "Strong ethics posture" : ethicsScore >= 50 ? "Improvement needed" : "Significant gaps found"}
          </p>
        </div>

        {/* Risk Level */}
        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${riskCfg.bg} ${riskCfg.border}`}>
          <p className="section-label mb-3">Risk Level</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {riskLevel === "High Risk" && <AlertTriangle className="w-6 h-6 text-red-500" />}
            {riskLevel === "Medium"    && <AlertCircle   className="w-6 h-6 text-amber-500" />}
            {riskLevel === "Low"       && <CheckCircle2  className="w-6 h-6 text-emerald-500" />}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${riskCfg.text}`}>{riskLevel}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${riskCfg.text}`}>{highRiskCount} critical issues</p>
        </div>

        {/* High Priority Issues */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">High Priority Issues</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-amber-50 border border-amber-100 flex flex-col items-center justify-center gap-1">
            <span className="text-[28px] font-bold text-amber-600 tabular-nums leading-none">{highPriority}</span>
            <span className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider">Issues</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">{highRiskCount} high risk · {warningCount} warnings</p>
        </div>

        {/* Compliance Status */}
        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${complianceCfg.bg} ${complianceCfg.border}`}>
          <p className="section-label mb-3">Compliance Status</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {complianceCfg.icon}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${complianceCfg.text}`}>{complianceStatus}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${complianceCfg.text}`}>{passedCount} of {MOCK_FINDINGS.length} passed</p>
        </div>
      </div>

      {/* Two-column workspace */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* Main panel */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Tabs */}
          <div className="flex items-center gap-2">
            {(["findings", "recommendations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer
                  ${activeTab === t
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
                  }`}
              >
                {t === "findings"        && <FileSearch className="w-3.5 h-3.5" />}
                {t === "recommendations" && <Sparkles   className="w-3.5 h-3.5" />}
                <span className="capitalize">{t}</span>
                {t === "findings" && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {MOCK_FINDINGS.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Findings tab */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",              label: "All",              count: MOCK_FINDINGS.length, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "passed",           label: "Passed",           count: passedCount,          cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "needs-improvement",label: "Needs Improvement",count: needsImpCount,        cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "warning",          label: "Warning",          count: warningCount,         cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "high-risk",        label: "High Risk",        count: highRiskCount,        cls: "bg-red-100 text-red-800 border border-red-300" },
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
                  <EthicsFindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations tab */}
          {activeTab === "recommendations" && (
            <div className="space-y-4">
              {MOCK_RECOMMENDATIONS.map((rec) => (
                <div key={rec.category} className={`border rounded-[18px] overflow-hidden shadow-xs ${rec.accent}`}>
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-white flex items-center justify-center text-gray-600 shadow-xs">
                      {rec.icon}
                    </div>
                    <h3 className="text-[13px] font-bold text-gray-900">{rec.category}</h3>
                    <span className="ml-auto text-[11px] font-semibold text-gray-500 bg-white/60 rounded-md px-2 py-0.5">
                      {rec.items.length} item{rec.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
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

        {/* Right sidebar */}
        <div className="xl:w-[300px] shrink-0 space-y-4">

          {/* Assessment Summary */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Assessment Summary</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "AI System",       value: "Lexify ML Platform v2.1" },
                { label: "Assessment Type", value: "Full Ethics Review" },
                { label: "Framework",       value: "EU AI Act / NIST RMF" },
                { label: "Review Date",     value: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
                { label: "Overall Rating",  value: `${ethicsScore}/100 — ${ethicsScore >= 70 ? "Low Risk" : ethicsScore >= 50 ? "Moderate" : "High Risk"}` },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5 min-w-[90px]">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ethics Breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Ethics Breakdown</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {ETHICS_BREAKDOWN.map((item) => {
                const barColor = item.score >= 70 ? "bg-emerald-400" : item.score >= 50 ? "bg-amber-400" : "bg-red-400";
                const textColor = item.score >= 70 ? "text-emerald-700" : item.score >= 50 ? "text-amber-700" : "text-red-700";
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                      <span className={`text-[12px] font-bold tabular-nums ${textColor}`}>{item.score}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Export</p>
              </div>
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
                  : <><Copy className="w-4 h-4" />Copy Summary</>}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIEthicsScore() {
  const [appState, setAppState]   = useState<AppState>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [steps, setSteps]         = useState<AnalysisStep[]>(ANALYSIS_STEPS);
  const stepTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnalysis = useCallback((files: File[]) => {
    setUploadedFiles(files);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
    setAppState("analyzing");

    // Advance steps sequentially
    let current = 0;
    const advance = () => {
      if (current >= ANALYSIS_STEPS.length) {
        setAppState("results");
        return;
      }
      setSteps((prev) =>
        prev.map((s, i) =>
          i === current     ? { ...s, status: "active" }
          : i < current     ? { ...s, status: "done" }
          : s
        )
      );
      current++;
      const delay = current === ANALYSIS_STEPS.length ? 900 : 600 + Math.random() * 500;
      stepTimerRef.current = setTimeout(() => {
        setSteps((prev) => prev.map((s, i) => i === current - 1 ? { ...s, status: "done" } : s));
        setTimeout(advance, 200);
      }, delay);
    };
    setTimeout(advance, 300);
  }, []);

  useEffect(() => {
    return () => { if (stepTimerRef.current) clearTimeout(stepTimerRef.current); };
  }, []);

  const handleReset = () => {
    setAppState("upload");
    setUploadedFiles([]);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
  };

  const fileNames = uploadedFiles.map((f) => f.name);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {appState === "upload"    && <UploadState    onFilesSelected={startAnalysis} />}
      {appState === "analyzing" && <AnalyzingState fileNames={fileNames} steps={steps} />}
      {appState === "results"   && <ResultsState   fileNames={fileNames} onReset={handleReset} />}
    </div>
  );
}
