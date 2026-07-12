import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, FileText, ShieldCheck, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Download, Copy, FileDown,
  Sparkles, Lock, Globe, Users, AlertCircle, Loader2,
  ArrowRight, RefreshCw, Building2, BadgeCheck, Server,
  Check, Database, MapPin, Network, FileSearch, Shield,
  Award, TrendingUp, BarChart3, Info, Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "upload" | "analyzing" | "results";

interface AnalysisStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

interface VendorFinding {
  id: string;
  category: string;
  status: "passed" | "warning" | "missing" | "high-risk";
  description: string;
  recommendation: string;
  tag?: string;
}

interface ComplianceItem {
  label: string;
  status: "compliant" | "partial" | "missing" | "na";
}

interface RecommendationSection {
  category: string;
  icon: React.ReactNode;
  accent: string;
  items: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "read",        label: "Reading uploaded documents",              status: "pending" },
  { id: "identify",    label: "Identifying vendor information",          status: "pending" },
  { id: "privacy",     label: "Reviewing privacy policy",               status: "pending" },
  { id: "gdpr",        label: "Checking GDPR compliance",               status: "pending" },
  { id: "certs",       label: "Verifying security certifications",      status: "pending" },
  { id: "residency",   label: "Detecting data residency",               status: "pending" },
  { id: "processors",  label: "Identifying sub-processors",             status: "pending" },
  { id: "contracts",   label: "Assessing contractual risks",            status: "pending" },
  { id: "score",       label: "Calculating vendor risk score",          status: "pending" },
  { id: "report",      label: "Generating assessment report",           status: "pending" },
];

const MOCK_FINDINGS: VendorFinding[] = [
  {
    id: "f1", category: "GDPR Compliance", status: "passed", tag: "Art. 13–14 GDPR",
    description: "The vendor's privacy policy adequately addresses data subject rights and lawful bases for processing personal data in line with GDPR requirements.",
    recommendation: "No critical action required. Consider requesting a formal DPA to document the processing relationship and ensure Article 28 obligations are covered.",
  },
  {
    id: "f2", category: "SOC 2 Availability", status: "warning", tag: "Security",
    description: "SOC 2 Type I report was identified but no SOC 2 Type II report is available. Type II provides stronger assurance over operational effectiveness across a period of time.",
    recommendation: "Request a current SOC 2 Type II report covering at least a 6-month audit period. Verify the report is dated within the last 12 months.",
  },
  {
    id: "f3", category: "ISO 27001 Certification", status: "passed", tag: "ISO",
    description: "Valid ISO 27001:2022 certification identified. The certificate covers information security management systems and is in scope for the vendor's core platform.",
    recommendation: "Verify the certificate has not expired and that the audit scope includes the systems and services relevant to your use case.",
  },
  {
    id: "f4", category: "Privacy Policy Review", status: "warning", tag: "Privacy",
    description: "The privacy policy lacks clear disclosure of all data categories collected and the retention period for each category. Cookie consent mechanisms are referenced but not fully described.",
    recommendation: "Request an updated privacy policy that explicitly lists all personal data categories, their purpose, legal basis and retention periods. Verify cookie banner compliance.",
  },
  {
    id: "f5", category: "Data Residency", status: "passed", tag: "Infrastructure",
    description: "Vendor documentation confirms primary data storage in EU (Frankfurt, AWS eu-central-1). Backup replicas remain within EU regions. No cross-Atlantic transfers identified for primary data.",
    recommendation: "Confirm this in the contractual DPA and request documented evidence of the AWS region configuration for your specific tenant.",
  },
  {
    id: "f6", category: "Sub-processors", status: "warning", tag: "Third Parties",
    description: "Sub-processor list is published but has not been updated in over 14 months. Three sub-processors (Stripe, Intercom, Segment) process personal data and require adequate transfer mechanisms.",
    recommendation: "Request an up-to-date sub-processor list with a commitment to 30-day advance notice of changes. Verify all sub-processors have Standard Contractual Clauses in place.",
  },
  {
    id: "f7", category: "Data Retention", status: "missing", tag: "Privacy",
    description: "No specific data retention schedule has been identified across the reviewed documentation. The privacy policy mentions data is kept 'as long as necessary' without defined periods.",
    recommendation: "Require the vendor to provide a formal data retention schedule before onboarding. Include contractual retention and deletion obligations with specific timeframes.",
  },
  {
    id: "f8", category: "Incident Response", status: "passed", tag: "Security",
    description: "Security documentation includes a documented incident response plan with defined escalation paths, SLA commitments for breach notification (72-hour target aligned with GDPR Art. 33).",
    recommendation: "Confirm the 72-hour notification obligation is reflected in your contractual agreement and that it covers both processor and controller notification paths.",
  },
  {
    id: "f9", category: "Encryption Practices", status: "passed", tag: "Security",
    description: "Documentation confirms AES-256 encryption at rest and TLS 1.2+ in transit. Key management procedures are described with annual rotation policy.",
    recommendation: "Request evidence of key management practices such as HSM usage or AWS KMS configuration. Verify TLS version minimums are enforced at the application layer.",
  },
  {
    id: "f10", category: "HIPAA Readiness", status: "high-risk", tag: "Compliance",
    description: "No HIPAA Business Associate Agreement (BAA) is available and the vendor does not appear to have formal HIPAA compliance documentation. This is a critical gap if PHI will be processed.",
    recommendation: "Do not process Protected Health Information with this vendor until a signed BAA is in place and HIPAA compliance has been independently verified.",
  },
];

const MOCK_COMPLIANCE: ComplianceItem[] = [
  { label: "GDPR",     status: "compliant" },
  { label: "SOC 2",    status: "partial"   },
  { label: "ISO 27001",status: "compliant" },
  { label: "HIPAA",    status: "missing"   },
  { label: "CCPA",     status: "partial"   },
  { label: "PCI DSS",  status: "na"        },
];

const MOCK_RECOMMENDATIONS: RecommendationSection[] = [
  {
    category: "Missing Documentation",
    icon: <XCircle className="w-4 h-4" />,
    accent: "border-red-200 bg-red-50/40",
    items: [
      "Formal data retention schedule with per-category timeframes",
      "HIPAA Business Associate Agreement before any PHI processing",
      "SOC 2 Type II report (Type I only is insufficient for enterprise onboarding)",
    ],
  },
  {
    category: "Suggested Improvements",
    icon: <TrendingUp className="w-4 h-4" />,
    accent: "border-amber-200 bg-amber-50/40",
    items: [
      "Request an updated sub-processor list with 30-day change notification commitment",
      "Obtain a fully executed DPA referencing GDPR Article 28 obligations",
      "Clarify cookie consent mechanisms and add granular retention periods to privacy policy",
      "Confirm EU data residency is contractually guaranteed for your tenant",
    ],
  },
  {
    category: "Risk Mitigation",
    icon: <AlertTriangle className="w-4 h-4" />,
    accent: "border-orange-200 bg-orange-50/40",
    items: [
      "Block onboarding until a current SOC 2 Type II report is received",
      "Verify Stripe, Intercom and Segment SCCs are in scope before data sharing",
      "Conduct annual vendor review with updated certification and policy checks",
    ],
  },
  {
    category: "Compliance Recommendations",
    icon: <CheckCircle2 className="w-4 h-4" />,
    accent: "border-emerald-200 bg-emerald-50/40",
    items: [
      "Add this vendor to your data processing register (ROPA) with processing details",
      "Link the executed DPA to the vendor record in your contract management system",
      "Schedule a 12-month renewal review aligned with ISO 27001 certificate expiry",
    ],
  },
];

const VENDOR_INFO = {
  name: "Acme Technologies Ltd.",
  industry: "Cloud Infrastructure",
  headquarters: "Amsterdam, Netherlands",
  dataRegions: "EU (AWS eu-central-1, eu-west-1)",
  primaryServices: "SaaS platform, API services, analytics",
};

const FEATURE_CARDS = [
  { icon: Shield,     title: "Privacy Practices",      description: "Review privacy policies and data handling practices against GDPR and regional requirements." },
  { icon: Award,      title: "Security Certifications",description: "Identify SOC 2, ISO 27001 and other active certifications and their audit scope." },
  { icon: BadgeCheck, title: "Compliance Standards",   description: "Evaluate GDPR, CCPA, HIPAA and other privacy compliance posture." },
  { icon: MapPin,     title: "Data Residency",         description: "Detect where customer data is stored and processed across cloud regions." },
  { icon: Network,    title: "Sub-processors",         description: "Identify third-party processors, vendor dependencies and transfer mechanisms." },
  { icon: BarChart3,  title: "Vendor Risk",            description: "Assess overall onboarding risk, contractual gaps and compliance readiness." },
];

// ─── Radial Score Gauge ───────────────────────────────────────────────────────

function RadialGauge({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size / 2) * 0.75;
  const circ = 2 * Math.PI * r;
  const arcLength = circ * 0.75;
  const offset = arcLength - (score / 100) * arcLength;
  const color = score >= 70 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";
  const trackColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[135deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth="7"
          strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${arcLength - offset} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: color + "99" }}>/100</span>
      </div>
    </div>
  );
}

// ─── Finding Status Badge ─────────────────────────────────────────────────────

function FindingBadge({ status }: { status: VendorFinding["status"] }) {
  const cfg = {
    passed:    { label: "Passed",    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    warning:   { label: "Warning",   cls: "bg-amber-50 text-amber-700 border border-amber-200",       icon: <AlertTriangle className="w-3 h-3" /> },
    missing:   { label: "Missing",   cls: "bg-red-50 text-red-700 border border-red-200",             icon: <XCircle className="w-3 h-3" /> },
    "high-risk":{ label: "High Risk",cls: "bg-red-100 text-red-800 border border-red-300",            icon: <AlertTriangle className="w-3 h-3" /> },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Compliance Status Dot ────────────────────────────────────────────────────

function ComplianceDot({ status }: { status: ComplianceItem["status"] }) {
  const cfg = {
    compliant: { cls: "bg-emerald-500",  label: "Compliant" },
    partial:   { cls: "bg-amber-400",    label: "Partial"   },
    missing:   { cls: "bg-red-500",      label: "Missing"   },
    na:        { cls: "bg-gray-300",     label: "N/A"       },
  }[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.cls}`} />
      <span className="text-[11px] text-gray-500 font-medium">{cfg.label}</span>
    </span>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: VendorFinding }) {
  const [open, setOpen] = useState(false);
  const borderColor = {
    passed:    "border-l-emerald-400",
    warning:   "border-l-amber-400",
    missing:   "border-l-red-400",
    "high-risk": "border-l-red-600",
  }[finding.status];
  const hoverBg = {
    passed:    "hover:bg-emerald-50/30",
    warning:   "hover:bg-amber-50/30",
    missing:   "hover:bg-red-50/30",
    "high-risk": "hover:bg-red-50/40",
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
              {finding.tag && (
                <span className="badge badge-neutral text-[10px]">{finding.tag}</span>
              )}
            </div>
            {!open && (
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1 pr-2">{finding.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <FindingBadge status={finding.status} />
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

interface UploadedFileEntry { file: File; id: string; }

function UploadState({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setUploadedFiles((prev) => {
      const existing = new Set(prev.map((e) => e.file.name));
      const newEntries = arr
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, id: Math.random().toString(36).slice(2) }));
      return [...prev, ...newEntries];
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (id: string) => setUploadedFiles((prev) => prev.filter((e) => e.id !== id));

  const handleAnalyze = () => {
    if (uploadedFiles.length > 0) onFilesSelected(uploadedFiles.map((e) => e.file));
  };

  const BADGES = [
    { icon: Sparkles,   label: "AI Powered"          },
    { icon: Shield,     label: "Privacy Review"       },
    { icon: Lock,       label: "Security Assessment"  },
    { icon: BadgeCheck, label: "Enterprise Ready"     },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAFAFB]">
      <div
        className="px-10 py-8 max-w-5xl mx-auto"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transition: "opacity 0.35s ease, transform 0.35s ease" }}
      >
        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-gray-500 mb-4 shadow-xs">
              <Sparkles className="w-3 h-3 text-gray-400" />
              <span>AI-Powered Vendor Assessment</span>
            </div>
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight mb-2.5">
              Vendor Review
            </h1>
            <p className="text-[13.5px] text-gray-500 leading-relaxed">
              Upload your vendor's compliance documents and let AI evaluate privacy, security, compliance
              posture, contractual risks, certifications and potential onboarding risks.
            </p>
            {/* Premium badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {BADGES.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-xs">
                  <Icon className="w-3 h-3 text-gray-400" />{label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative rounded-[20px] p-10 text-center cursor-pointer transition-all duration-250 group overflow-hidden
              ${dragging
                ? "border-2 border-dashed border-gray-500 bg-gray-50 scale-[1.008] shadow-md"
                : "border-2 border-dashed border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
            style={{
              background: dragging
                ? "linear-gradient(135deg,#F9FAFB 0%,#F3F4F6 100%)"
                : "linear-gradient(135deg,#FFFFFF 0%,#FAFAFA 60%,#F5F5F5 100%)",
            }}
          >
            <div className={`absolute inset-0 rounded-[20px] transition-opacity duration-300 pointer-events-none ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ background: "radial-gradient(ellipse at 50% 40%,rgba(0,0,0,0.03) 0%,transparent 70%)" }} />

            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt" multiple onChange={handleFileInput} />

            <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-250 shadow-xs
              ${dragging ? "bg-gray-900 text-white scale-110 shadow-md" : "bg-white text-gray-500 border border-gray-200 group-hover:bg-gray-900 group-hover:text-white group-hover:shadow-sm group-hover:scale-105"}`}>
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">
              {dragging ? "Drop vendor documents to start analysis" : "Drag & drop vendor documents here"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              or <span className="text-gray-900 font-semibold underline underline-offset-2">browse files</span> from your computer
            </p>

            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              {[
                { label: "Privacy Policy",       icon: Shield },
                { label: "DPA",                  icon: FileText },
                { label: "Terms of Service",     icon: FileText },
                { label: "Security Docs",        icon: Lock },
                { label: "SOC 2 Report",         icon: Award },
                { label: "ISO Certificates",     icon: BadgeCheck },
              ].map(({ label, icon: Icon }) => (
                <span key={label} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-xs">
                  <Icon className="w-3 h-3 text-gray-400" />{label}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {["PDF", "DOCX", "TXT"].map((fmt) => (
                <span key={fmt} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-xs">
                  <FileText className="w-3 h-3 text-gray-400" />{fmt}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 font-medium pl-1">· Max 25 MB per file</span>
            </div>
          </div>
        </div>

        {/* Uploaded file list */}
        {uploadedFiles.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Queued for analysis</p>
            {uploadedFiles.map(({ file, id }) => (
              <div key={id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-[14px] px-4 py-3 shadow-xs group hover:shadow-sm transition-all duration-150">
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

            <button
              onClick={handleAnalyze}
              className="btn-primary w-full justify-center py-3 mt-3 text-[13px] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Analyze {uploadedFiles.length} Document{uploadedFiles.length !== 1 ? "s" : ""}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* What We'll Analyze */}
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900 tracking-tight">What we'll analyze</h2>
              <p className="text-[12.5px] text-gray-500 mt-0.5">Six critical dimensions reviewed by our vendor risk AI engine.</p>
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
          <h2 className="text-[21px] font-bold text-gray-900 tracking-tight mb-2">Analyzing vendor documents</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Lexify AI is reviewing the vendor's privacy, security and compliance documentation.
            This usually takes a few moments depending on the number and size of uploaded files.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[20px] shadow-sm overflow-hidden mb-4">
          {/* Progress bar */}
          <div className="h-[3px] bg-gray-100 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gray-900 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
            <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{ animation: "vendor-shimmer 1.8s ease-in-out infinite", left: `${Math.max(0, progress - 8)}%` }} />
          </div>

          <div className="p-6">
            {/* File rows */}
            <div className="space-y-2 mb-5 pb-4 border-b border-gray-100">
              {fileNames.map((name) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <FileText className="w-[16px] h-[16px] text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{progress}% complete</p>
                  </div>
                  <span className="badge badge-blue shrink-0 animate-pulse">Reviewing</span>
                </div>
              ))}
            </div>

            {/* Steps list */}
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.id} className={`flex items-center gap-3 transition-all duration-400 ${step.status === "pending" ? "opacity-30" : "opacity-100"}`}>
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
                  {step.status === "done" && <Check className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />}
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
            <p className="text-[12px] font-semibold text-gray-700">Keep this tab open until analysis is complete</p>
            <p className="text-[11px] text-gray-400 mt-0.5">This usually takes 15–60 seconds depending on document size</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vendor-shimmer {
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
  const [activeTab, setActiveTab]       = useState<"findings" | "recommendations">("findings");
  const [findingFilter, setFindingFilter] = useState<"all" | VendorFinding["status"]>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [mounted, setMounted]            = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const passedCount   = MOCK_FINDINGS.filter((f) => f.status === "passed").length;
  const warningCount  = MOCK_FINDINGS.filter((f) => f.status === "warning").length;
  const missingCount  = MOCK_FINDINGS.filter((f) => f.status === "missing").length;
  const highRiskCount = MOCK_FINDINGS.filter((f) => f.status === "high-risk").length;

  const vendorRiskScore  = 62;
  const privacyScore     = 71;
  const securityScore    = 78;

  const complianceStatus = highRiskCount > 0 ? "High Risk" : missingCount >= 2 ? "Needs Review" : warningCount >= 2 ? "Partial" : "Compliant";
  const complianceCfg = {
    "High Risk":   { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100"    },
    "Needs Review":{ bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"  },
    "Partial":     { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"  },
    "Compliant":   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100"},
  }[complianceStatus];

  const filteredFindings = findingFilter === "all"
    ? MOCK_FINDINGS
    : MOCK_FINDINGS.filter((f) => f.status === findingFilter);

  const handleCopy = () => {
    const summary = `Vendor Assessment Report\nVendor: ${VENDOR_INFO.name}\nRisk Score: ${vendorRiskScore}/100\nPrivacy: ${privacyScore}/100 · Security: ${securityScore}/100\nStatus: ${complianceStatus}\nPassed: ${passedCount} · Warnings: ${warningCount} · Missing: ${missingCount} · High Risk: ${highRiskCount}`;
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
            <span className="badge badge-success">Assessment Complete</span>
            <span className="text-[11px] text-gray-400 font-medium">{fileNames.length} document{fileNames.length !== 1 ? "s" : ""} reviewed</span>
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">Vendor Assessment Report</h1>
          <p className="text-[13px] text-gray-500 mt-1">AI-generated vendor risk, privacy and compliance assessment.</p>
        </div>
        <button onClick={onReset} className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1">
          <RefreshCw className="w-3.5 h-3.5" />New Assessment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Vendor Risk Score */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Vendor Risk Score</p>
          <RadialGauge score={vendorRiskScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {vendorRiskScore >= 70 ? "Low risk profile" : vendorRiskScore >= 50 ? "Review recommended" : "Elevated risk"}
          </p>
        </div>

        {/* Privacy Score */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Privacy Score</p>
          <RadialGauge score={privacyScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {privacyScore >= 70 ? "Generally compliant" : "Needs attention"}
          </p>
        </div>

        {/* Security Score */}
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Security Score</p>
          <RadialGauge score={securityScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {securityScore >= 70 ? "Well documented" : "Gaps identified"}
          </p>
        </div>

        {/* Compliance Status */}
        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${complianceCfg.bg} ${complianceCfg.border}`}>
          <p className="section-label mb-3">Compliance Status</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {highRiskCount > 0
              ? <AlertTriangle className="w-6 h-6 text-red-500" />
              : missingCount >= 2
              ? <AlertCircle className="w-6 h-6 text-amber-500" />
              : warningCount >= 2
              ? <Info className="w-6 h-6 text-amber-400" />
              : <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${complianceCfg.text}`}>{complianceStatus}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${complianceCfg.text}`}>
            {highRiskCount} critical · {missingCount} missing
          </p>
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

          {/* Findings tab */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",       label: "All",       count: MOCK_FINDINGS.length, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "passed",    label: "Passed",    count: passedCount,           cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "warning",   label: "Warning",   count: warningCount,          cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "missing",   label: "Missing",   count: missingCount,          cls: "bg-red-50 text-red-700 border border-red-200" },
                  { val: "high-risk", label: "High Risk", count: highRiskCount,         cls: "bg-red-100 text-red-800 border border-red-300" },
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

          {/* Vendor information */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Vendor Information</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "Vendor Name",      value: VENDOR_INFO.name },
                { label: "Industry",         value: VENDOR_INFO.industry },
                { label: "Headquarters",     value: VENDOR_INFO.headquarters },
                { label: "Data Regions",     value: VENDOR_INFO.dataRegions },
                { label: "Primary Services", value: VENDOR_INFO.primaryServices },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5 min-w-[80px]">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Overview */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Compliance Overview</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {MOCK_COMPLIANCE.map(({ label, status }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                  <ComplianceDot status={status} />
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <div className="flex items-center gap-4 pt-3 border-t border-gray-100 flex-wrap">
                {[
                  { cls: "bg-emerald-500", label: "Compliant" },
                  { cls: "bg-amber-400",   label: "Partial"   },
                  { cls: "bg-red-500",     label: "Missing"   },
                  { cls: "bg-gray-300",    label: "N/A"       },
                ].map(({ cls, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />{label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Score Breakdown</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label: "Passed",    count: passedCount,   total: MOCK_FINDINGS.length, barColor: "bg-emerald-400", textColor: "text-emerald-700" },
                { label: "Warnings",  count: warningCount,  total: MOCK_FINDINGS.length, barColor: "bg-amber-400",   textColor: "text-amber-700" },
                { label: "Missing",   count: missingCount,  total: MOCK_FINDINGS.length, barColor: "bg-red-400",     textColor: "text-red-700" },
                { label: "High Risk", count: highRiskCount, total: MOCK_FINDINGS.length, barColor: "bg-red-600",     textColor: "text-red-800" },
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
                <Download className="w-4 h-4" />Download Assessment
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

export default function VendorReview() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [steps, setSteps]         = useState<AnalysisStep[]>(ANALYSIS_STEPS.map((s) => ({ ...s })));
  const stepTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const delay = 700 + Math.random() * 700;
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

  const handleFilesSelected = useCallback((files: File[]) => {
    setFileNames(files.map((f) => f.name));
    setAppState("analyzing");
    runAnalysis();
  }, [runAnalysis]);

  const handleReset = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setAppState("upload");
    setFileNames([]);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload"    && <UploadState    onFilesSelected={handleFilesSelected} />}
      {appState === "analyzing" && <AnalyzingState  fileNames={fileNames} steps={steps} />}
      {appState === "results"   && <ResultsState    fileNames={fileNames} onReset={handleReset} />}
    </div>
  );
}
