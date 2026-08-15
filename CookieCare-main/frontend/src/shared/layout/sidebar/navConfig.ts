// ─── Navigation Configuration — single source of truth ───────────────────────
// AppSidebar, TopNav, and App.tsx consume this file.

import {
  LayoutDashboard, Scale, ScanSearch, PenTool,
  MessageSquare, Handshake, GitCompare, Archive,
  ShieldCheck, Cookie, FileCheck, Building2,
  ShieldAlert, Brain, Layers, Shield,
} from "lucide-react";
import type { ElementType } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NavLeaf {
  id: string;
  label: string;
  icon: ElementType;
  disabled?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: ElementType;
  children: NavLeaf[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: ElementType;
}

export type NavEntry = NavItem | NavGroup;

export interface Breadcrumb {
  section: string | null;
  page: string;
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

// ── Nav tree ──────────────────────────────────────────────────────────────────

export function buildNav(isAdmin: boolean): NavEntry[] {
  const entries: NavEntry[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "legal",
      label: "Legal",
      icon: Scale,
      children: [
        { id: "legal-review",    label: "Analyze",     icon: ScanSearch    },
        { id: "legal-draft",     label: "Draft",       icon: PenTool       },
        { id: "legal-ask-ai",    label: "Ask Lawyer",  icon: MessageSquare },
        { id: "legal-negotiate", label: "Negotiate",   icon: Handshake     },
        { id: "legal-compare",   label: "Compare",     icon: GitCompare    },
        { id: "legal-vault",     label: "Vault",       icon: Archive       },
      ],
    },
    {
      id: "privacy",
      label: "Privacy",
      icon: ShieldCheck,
      children: [
        { id: "cookie-scanner", label: "Cookie Scanner", icon: Cookie    },
        { id: "dpa-reviewer",   label: "DPA Review",     icon: FileCheck  },
        { id: "vendor-review",  label: "Vendor Review",  icon: Building2  },
      ],
    },
    {
      id: "security",
      label: "Security",
      icon: ShieldAlert,
      children: [
        { id: "vulnerability-scanner", label: "Vulnerability scanner", icon: ShieldAlert },
      ],
    },
    {
      id: "ai-governance",
      label: "AI Governance",
      icon: Brain,
      children: [
        { id: "ai-ethics", label: "AI Ethics Review", icon: Brain },
        { id: "ai-tools-inventory", label: "AI Tools Inventory", icon: Layers },
      ],
    },
  ];

  if (isAdmin) {
    entries.push({
      id: "admin",
      label: "Admin",
      icon: Shield,
      children: [
        { id: "admin-panel", label: "Admin Panel", icon: Shield },
      ],
    });
  }

  return entries;
}

// ── Tab labels — used by TopNav breadcrumb ────────────────────────────────────

function extractLabels(entries: NavEntry[]): Record<string, string> {
  const map: Record<string, string> = {
    settings: "Settings",
    "admin-panel": "Admin Panel",
  };
  for (const entry of entries) {
    map[entry.id] = entry.label;
    if (isNavGroup(entry)) {
      for (const child of entry.children) {
        map[child.id] = child.label;
      }
    }
  }
  return map;
}

export const TAB_LABELS: Record<string, string> = extractLabels(buildNav(true));

/** Section / page breadcrumb for the top navigation bar. */
export function getBreadcrumb(activeTab: string, isAdmin = false): Breadcrumb {
  const nav = buildNav(isAdmin);

  for (const entry of nav) {
    if (!isNavGroup(entry)) {
      if (entry.id === activeTab) {
        return { section: null, page: entry.label };
      }
      continue;
    }
    for (const child of entry.children) {
      if (child.id === activeTab) {
        return { section: entry.label, page: child.label };
      }
    }
  }

  if (activeTab === "settings") {
    return { section: null, page: "Settings" };
  }

  return {
    section: null,
    page: TAB_LABELS[activeTab] ?? activeTab,
  };
}
