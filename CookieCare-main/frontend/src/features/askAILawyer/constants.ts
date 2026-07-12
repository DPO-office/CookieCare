import { AlertCircle, ScrollText, Globe, Brain } from "lucide-react";

export const QUICK_PROMPTS = [
  {
    label: "GDPR Breach Liability",
    icon: AlertCircle,
    prompt:
      "Assess our liability exposure under GDPR Article 83 for a data breach affecting EU citizens stored on US servers.",
  },
  {
    label: "Contract Indemnity Clause",
    icon: ScrollText,
    prompt:
      "Review standard indemnification clause enforceability and asymmetric risk allocation under English law.",
  },
  {
    label: "Cross-Border Tax Relief",
    icon: Globe,
    prompt:
      "Assess double tax relief eligibility under applicable bilateral tax treaties for a UK-India corporate structure.",
  },
  {
    label: "IP Ownership in Employment",
    icon: Brain,
    prompt:
      "Explain the default IP assignment rules for inventions created by employees during working hours across US, UK, and EU.",
  },
] as const;
