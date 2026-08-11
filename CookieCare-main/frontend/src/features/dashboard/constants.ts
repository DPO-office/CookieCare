import {
  ScanSearch,
  PenTool,
  MessageSquare,
  GitCompare,
  type LucideIcon,
} from "lucide-react";

export interface QuickAction {
  tab: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

/** Core legal workflows — all tabs are wired in App.tsx */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    tab: "legal-review",
    icon: ScanSearch,
    label: "Analyze",
    description: "Run compliance and risk analysis",
  },
  {
    tab: "legal-draft",
    icon: PenTool,
    label: "Draft",
    description: "Generate or edit agreements",
  },
  {
    tab: "legal-ask-ai",
    icon: MessageSquare,
    label: "Ask Trust Lawyer",
    description: "Research with citations",
  },
  {
    tab: "legal-compare",
    icon: GitCompare,
    label: "Compare",
    description: "Diff two agreements",
  },
];
