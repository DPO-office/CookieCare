import React from "react";
import {
  Scale, Eye, ClipboardCheck, Database, UserCheck, Gauge,
  Lock,
} from "lucide-react";
import { AnalysisStep } from "./types";

// ─── Analysis steps — must mirror backend progress stages ────────────────────
// Backend emits progress at:
//  5  → Receiving request
// 10  → Extracting uploaded documents
// 18  → Scanning website
// 24  → Discovering AI governance pages
// 34  → Extracting website intelligence
// 40  → Searching knowledge base
// 46  → Reviewing AI governance
// 52  → Reviewing transparency
// 58  → Reviewing fairness
// 64  → Reviewing accountability
// 68  → Reviewing privacy
// 72  → Reviewing human oversight
// 76  → Reviewing explainability
// 85  → Calculating AI ethics score
// 92  → Generating recommendations
// 97  → Preparing report

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "receive",        label: "Receiving request",                     status: "pending" },
  { id: "extract",        label: "Extracting uploaded documents",         status: "pending" },
  { id: "scan",           label: "Scanning website",                      status: "pending" },
  { id: "governance",     label: "Discovering AI governance pages",       status: "pending" },
  { id: "intelligence",   label: "Extracting website intelligence",       status: "pending" },
  { id: "knowledge",      label: "Searching knowledge base",              status: "pending" },
  { id: "ai-governance",  label: "Reviewing AI governance",               status: "pending" },
  { id: "transparency",   label: "Reviewing transparency",                status: "pending" },
  { id: "fairness",       label: "Reviewing fairness",                    status: "pending" },
  { id: "accountability", label: "Reviewing accountability",              status: "pending" },
  { id: "privacy",        label: "Reviewing privacy",                     status: "pending" },
  { id: "oversight",      label: "Reviewing human oversight",             status: "pending" },
  { id: "explainability", label: "Reviewing explainability",              status: "pending" },
  { id: "score",          label: "Calculating AI Ethics Score",           status: "pending" },
  { id: "recommendations",label: "Generating recommendations",           status: "pending" },
  { id: "report",         label: "Preparing report",                      status: "pending" },
];

export const FEATURE_CARDS = [
  { icon: Scale,         title: "Fairness & Bias",          description: "Detect potential bias and fairness risks across protected attributes and demographic groups." },
  { icon: Eye,           title: "Transparency",             description: "Review explainability mechanisms, model cards, and documentation quality." },
  { icon: ClipboardCheck,title: "Accountability",           description: "Evaluate AI governance ownership, oversight structures and escalation controls." },
  { icon: Database,      title: "Privacy & Data Governance",description: "Assess responsible handling of personal data in training and inference pipelines." },
  { icon: UserCheck,     title: "Human Oversight",          description: "Review human involvement, override mechanisms and monitoring capabilities." },
  { icon: Gauge,         title: "Risk Assessment",          description: "Generate an overall AI ethics risk evaluation and governance gap analysis." },
];

// ─── Icon and accent palette for recommendation categories ───────────────────
// The backend returns categories like "Bias Mitigation", "Governance Improvements", etc.
// We inject icons and accent styles on the frontend.

export const REC_STYLE_MAP: Record<string, { icon: React.ReactNode; accent: string }> = {
  "Bias Mitigation":           { icon: <Scale className="w-4 h-4" />,        accent: "border-red-200 bg-red-50/40"     },
  "Governance Improvements":   { icon: <ClipboardCheck className="w-4 h-4" />,accent: "border-amber-200 bg-amber-50/40" },
  "Transparency Enhancements": { icon: <Eye className="w-4 h-4" />,           accent: "border-blue-200 bg-blue-50/40"   },
  "Privacy Recommendations":   { icon: <Lock className="w-4 h-4" />,          accent: "border-orange-200 bg-orange-50/40"},
  "Human Oversight Suggestions":{ icon: <UserCheck className="w-4 h-4" />,   accent: "border-emerald-200 bg-emerald-50/40"},
  "Immediate Actions":         { icon: <Gauge className="w-4 h-4" />,         accent: "border-red-200 bg-red-50/40"     },
  "Standards Alignment":       { icon: <ClipboardCheck className="w-4 h-4" />,accent: "border-purple-200 bg-purple-50/40"},
  "Risk Mitigation":           { icon: <Gauge className="w-4 h-4" />,         accent: "border-amber-200 bg-amber-50/40" },
};

// Default style for unmapped categories
export const DEFAULT_REC_STYLE = {
  icon: <Gauge className="w-4 h-4" />,
  accent: "border-gray-200 bg-gray-50/40",
};
