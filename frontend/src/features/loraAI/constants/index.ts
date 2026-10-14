import {
  Lock, Building2, Brain, ScanSearch,
  PenTool, ShieldCheck, Globe, MessageSquare, GitCompare,
} from "lucide-react";
import type { QuickAction } from "../types";

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "dpa-review",
    label: "DPA Review",
    icon: Lock,
    description: "Analyze data processing agreements",
    prompt: "I'd like to review a Data Processing Agreement. Please upload your DPA document to begin the analysis.",
    available: true,
    primary: true,
  },
  {
    id: "vendor-review",
    label: "Vendor Review",
    icon: Building2,
    description: "Assess vendor privacy posture",
    prompt: "Let's assess a vendor's privacy and security posture. Upload the vendor documentation to get started.",
    available: true,
  },
  {
    id: "ai-ethics",
    label: "AI Ethics Review",
    icon: Brain,
    description: "Evaluate AI governance compliance",
    prompt: "I'll evaluate your AI system against ethics and governance frameworks. Please upload your AI documentation.",
    available: true,
  },
  {
    id: "compare-documents",
    label: "Compare Documents",
    icon: GitCompare,
    description: "AI-powered side-by-side agreement comparison",
    prompt: "",
    available: true,
  },
  {
    id: "analyze-agreement",
    label: "Analyze Agreement",
    icon: ScanSearch,
    description: "Risk and compliance analysis",
    prompt: "Upload any legal agreement and I'll provide a comprehensive risk and compliance analysis.",
    available: false,
  },
  {
    id: "draft-agreement",
    label: "Draft Agreement",
    icon: PenTool,
    description: "Generate legal agreements",
    prompt: "Describe the agreement you need and I'll draft it with appropriate legal clauses.",
    available: false,
  },
  {
    id: "privacy-assessment",
    label: "Privacy Assessment",
    icon: ShieldCheck,
    description: "Privacy impact evaluation",
    prompt: "Run a privacy impact assessment. Upload your documentation to evaluate data handling practices.",
    available: false,
  },
  {
    id: "cookie-review",
    label: "Cookie Review",
    icon: Globe,
    description: "GDPR & CCPA cookie audit",
    prompt: "Enter a website URL and I'll audit its cookie practices for GDPR and CCPA compliance.",
    available: false,
  },
  {
    id: "website-analysis",
    label: "Ask AI Lawyer",
    icon: MessageSquare,
    description: "Instant legal guidance",
    prompt: "Ask any legal question and I'll provide guidance based on enterprise legal frameworks.",
    available: false,
  },
];

export const LOADING_STAGES = [
  "Reading document…",
  "Cross-referencing clauses…",
  "Checking regulatory references…",
  "Compiling findings…",
] as const;
