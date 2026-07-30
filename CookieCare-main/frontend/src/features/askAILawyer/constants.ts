import { AlertCircle, ScrollText, Globe, Brain } from "lucide-react";

export const QUICK_PROMPTS = [
  {
    label: "GDPR breach liability",
    description: "Exposure analysis under Article 83 for cross-border data incidents.",
    icon: AlertCircle,
    prompt:
      "Assess our liability exposure under GDPR Article 83 for a data breach affecting EU citizens stored on US servers.",
  },
  {
    label: "Contract indemnity clause",
    description: "Enforceability of indemnification terms and asymmetric risk allocation.",
    icon: ScrollText,
    prompt:
      "Review standard indemnification clause enforceability and asymmetric risk allocation under English law.",
  },
  {
    label: "Cross-border tax relief",
    description: "Double tax relief eligibility under bilateral treaties for UK-India structures.",
    icon: Globe,
    prompt:
      "Assess double tax relief eligibility under applicable bilateral tax treaties for a UK-India corporate structure.",
  },
  {
    label: "IP ownership in employment",
    description: "Default IP assignment rules for employee inventions across US, UK, and EU.",
    icon: Brain,
    prompt:
      "Explain the default IP assignment rules for inventions created by employees during working hours across US, UK, and EU.",
  },
] as const;
