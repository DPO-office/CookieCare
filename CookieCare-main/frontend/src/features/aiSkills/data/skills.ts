import { ShieldCheck, ScanSearch } from "lucide-react";
import type { Skill } from "../types/skill";

export const skills: Skill[] = [
  {
    id: "dpa-privacy-risk-review",
    title: "DPA privacy risk review",
    description:
      "Analyze Data Processing Agreements to identify GDPR, CCPA, SCC, liability, security, transfer, and compliance risks.",
    category: "Privacy & Compliance",
    estimatedTime: "2–3 mins",
    status: "ready",
    icon: ShieldCheck,
    checks: [
      { label: "GDPR Article 28 compliance" },
      { label: "SCC & transfer mechanisms" },
      { label: "Processor obligations" },
      { label: "Liability & security gaps" },
    ],
    actionLabel: "Launch skill",
    actionTab: "dpa-reviewer",
    reviewProfile: "dpa-privacy-risk-review",
  },
  {
    id: "privacy-risk-audit",
    title: "Privacy risk audit",
    description:
      "Audit websites or privacy policies for GDPR, CPRA, CCPA, cookie compliance, consent management, and regulatory risks.",
    category: "Privacy & Compliance",
    estimatedTime: "1–2 mins",
    status: "ready",
    icon: ScanSearch,
    checks: [
      { label: "GDPR & CPRA alignment" },
      { label: "CCPA opt-out requirements" },
      { label: "Cookie consent audit" },
      { label: "Regulatory risk scoring" },
    ],
    actionLabel: "Launch skill",
    // actionTab intentionally omitted — skill not yet implemented
  },
];
