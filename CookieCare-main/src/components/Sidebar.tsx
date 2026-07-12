import { useState } from "react";
import {
  LayoutDashboard,
  ShieldAlert,
  Settings,
  LogOut,
  Scale,
  ShieldCheck,
  Brain,
  ChevronDown,
  MessageSquare,
  PenTool,
  Cookie,
  Lock,
  Building2,
  BarChart3,
  Star,
  Cpu,
  ScanSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  FolderLock,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: { name: string; email: string } | null;
  onLogout: () => void;
}

interface NavChild {
  id: string;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ElementType;
  children: NavChild[];
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

type NavEntry = NavItem | NavSection;

function isSection(entry: NavEntry): entry is NavSection {
  return "children" in entry;
}

const navigation: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "legal",
    label: "legal review",
    icon: Scale,
    children: [
      { id: "legal-review",    label: "Analyze agreements",  icon: ScanSearch },
      { id: "legal-draft",     label: "Draft agreements",    icon: PenTool },
      { id: "legal-ask-ai",    label: "Ask AI lawyer",       icon: MessageSquare },
      { id: "legal-negotiate", label: "Negotiate redlines",  icon: Scale },
      { id: "legal-queue",     label: "Active queue",        icon: Clock },
      { id: "legal-vault",     label: "Vault repository",    icon: FolderLock },
    ],
  },
  {
    id: "privacy",
    label: "privacy review",
    icon: ShieldCheck,
    children: [
      { id: "cookie-scanner",    label: "Cookie scanner",    icon: Cookie },
      { id: "dpa-reviewer",      label: "DPA reviewer",      icon: Lock },
      { id: "vendor-review",     label: "Vendor review",     icon: Building2 },
      { id: "privacy-dashboard", label: "Privacy dashboard", icon: BarChart3,  disabled: true },
      { id: "privacy-score",     label: "Privacy score",     icon: Star,       disabled: true },
    ],
  },
  {
    id: "security",
    label: "security review",
    icon: ShieldAlert,
    children: [
      { id: "vulnerability-scanner", label: "Vulnerability scanner", icon: Lock },
    ],
  },
  {
    id: "ethics",
    label: "AI ethics review",
    icon: Brain,
    children: [
      { id: "ai-ethics", label: "AI ethics score", icon: Cpu },
    ],
  },
  { id: "settings", label: "Settings", icon: Settings },
];

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 whitespace-nowrap rounded-lg bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 shadow-lg opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150">
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  );
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(["legal", "privacy", "security", "ethics"]);

  const toggleSection = (id: string) => {
    if (collapsed) return;
    setExpandedSections((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const activeSection = navigation.find(
    (e) => isSection(e) && e.children.some((c) => c.id === activeTab)
  );

  return (
    <div
      className="flex flex-col h-screen shrink-0 sticky top-0 transition-all duration-250"
      style={{
        width: collapsed ? "64px" : "240px",
        background: "#FAFAFB",
        borderRight: "1px solid #E4E4E7",
      }}
    >
      {/* Logo */}
      <div className={`flex items-center pt-6 pb-5 ${collapsed ? "justify-center px-3" : "justify-between px-4"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="leading-none min-w-0">
              <span className="block font-bold text-[15px] tracking-tight text-gray-900 truncate">Lexify</span>
              <span className="block text-[9px] text-gray-400 tracking-wider uppercase mt-0.5 font-semibold">compliance ai</span>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-900 to-gray-800 text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        )}

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150 shrink-0 ml-1"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center px-2.5 pb-2">
          <button
            onClick={() => setCollapsed(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5 scrollbar-none">
        {navigation.map((entry) => {
          const Icon = entry.icon;

          if (!isSection(entry)) {
            const active = activeTab === entry.id;
            const btn = (
              <button
                onClick={() => setActiveTab(entry.id)}
                className={`group w-full flex items-center rounded-lg text-[13px] font-medium transition-all duration-150 outline-none
                  ${collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2"}
                  ${active ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-xs"}
                `}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-gray-400 group-hover:text-gray-700"}`} />
                {!collapsed && <span>{entry.label}</span>}
              </button>
            );
            return collapsed ? (
              <Tooltip key={entry.id} label={entry.label}>{btn}</Tooltip>
            ) : (
              <div key={entry.id}>{btn}</div>
            );
          }

          const expanded = expandedSections.includes(entry.id) && !collapsed;
          const sectionActive = entry.children.some((c) => c.id === activeTab) || activeSection?.id === entry.id;

          if (collapsed) {
            return (
              <Tooltip key={entry.id} label={entry.label}>
                <button
                  onClick={() => { setCollapsed(false); setExpandedSections((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]); }}
                  className={`w-full flex justify-center items-center rounded-xl py-2.5 transition-all duration-150 outline-none
                    ${sectionActive ? "bg-gray-900 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}
                  `}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </button>
              </Tooltip>
            );
          }

          return (
            <div key={entry.id} className="pt-3">
              {/* Section header */}
              <button
                onClick={() => toggleSection(entry.id)}
                className="group w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase transition-all duration-150 outline-none text-gray-400 hover:text-gray-600"
              >
                <span>{entry.label}</span>
                <ChevronDown
                  className={`w-3 h-3 shrink-0 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
                />
              </button>

              {/* Children */}
              <div
                className="overflow-hidden transition-all duration-200"
                style={{
                  maxHeight: expanded ? `${entry.children.length * 44 + 8}px` : "0px",
                  opacity: expanded ? 1 : 0,
                }}
              >
                <div className="space-y-0.5 pb-1">
                  {entry.children.map((child) => {
                    const ChildIcon = child.icon;
                    const active = activeTab === child.id;

                    if (child.disabled) {
                      return (
                        <div
                          key={child.id}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-default select-none"
                        >
                          <ChildIcon className="w-4 h-4 shrink-0 text-gray-300" />
                          <span className="text-[13px] text-gray-300 flex-1 truncate">{child.label}</span>
                          <span className="shrink-0 text-[9px] font-semibold tracking-wider uppercase rounded px-1.5 py-0.5 bg-gray-100 text-gray-400">
                            soon
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={child.id}
                        onClick={() => setActiveTab(child.id)}
                        className={`group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 outline-none
                          ${active ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-xs"}
                        `}
                      >
                        <ChildIcon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-gray-400 group-hover:text-gray-600"}`} />
                        <span className="truncate">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* User footer */}
      <div className={`px-2.5 py-3 ${collapsed ? "flex justify-center" : ""}`}>
        {user ? (
          collapsed ? (
            <Tooltip label={user.name}>
              <button
                onClick={onLogout}
                className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-xs hover:bg-red-600 transition-colors duration-200"
              >
                {initials}
              </button>
            </Tooltip>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-xs shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{user.name}</p>
                  <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                id="sidebar-logout-btn"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-gray-500 bg-white border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all duration-150 outline-none shadow-xs hover:shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          )
        ) : (
          <p className="text-center text-[11px] text-gray-400 py-2">{collapsed ? "—" : "No active session"}</p>
        )}
      </div>
    </div>
  );
}
