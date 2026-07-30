import { ShieldCheck, ShieldAlert, Layers } from "lucide-react";

export const DASHBOARD_SHORTCUTS = [
  {
    tab: "cookie-scanner",
    icon: ShieldCheck,
    title: "Cookie scanner",
    desc: "Scan URLs for tracker scripts, check opt-in compliance, and perform GDPR/CCPA scoring.",
    cta: "Scan domain",
  },
  {
    tab: "vulnerability-scanner",
    icon: ShieldAlert,
    title: "Vulnerability scanner",
    desc: "Verify certificates, track missing security headers (HSTS, CSP, X-Frame) instantly.",
    cta: "Run security audit",
  },
  {
    tab: "legal-review",
    icon: Layers,
    title: "Legal review",
    desc: "Analyze NDAs, DPAs and SLAs. Coordinate redlining, signatures, and AI risk analysis.",
    cta: "Open legal suite",
  },
] as const;
