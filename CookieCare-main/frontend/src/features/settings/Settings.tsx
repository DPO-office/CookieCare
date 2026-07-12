import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { SettingsProps, SettingsSection } from "./types";
import { NAV_ITEMS } from "./constants";
import GeneralPanel from "./components/GeneralPanel";
import PrivacyPanel from "./components/PrivacyPanel";
import SecurityPanel from "./components/SecurityPanel";
import AIPanel from "./components/AIPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import WorkspacePanel from "./components/WorkspacePanel";
import AdvancedPanel from "./components/AdvancedPanel";

export default function SettingsView({ user }: SettingsProps) {
  const [active, setActive] = useState<SettingsSection>("general");
  const current = NAV_ITEMS.find(n => n.id === active)!;

  function renderPanel() {
    switch (active) {
      case "general":       return <GeneralPanel user={user} />;
      case "privacy":       return <PrivacyPanel />;
      case "security":      return <SecurityPanel />;
      case "ai":            return <AIPanel />;
      case "notifications": return <NotificationsPanel />;
      case "workspace":     return <WorkspacePanel />;
      case "advanced":      return <AdvancedPanel />;
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#FAFAFB]">

      {/* Left nav */}
      <aside className="w-[220px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto scrollbar-none">
        <div className="px-5 pt-7 pb-5 border-b border-gray-100">
          <h2 className="font-bold text-[15px] text-gray-900 tracking-tight">Settings</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Workspace configuration</p>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group outline-none
                  ${isActive ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"}`} />
                <span className="text-[13px] font-medium truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-white/60" />}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Plan</p>
            <p className="text-[13px] font-bold text-gray-900">Enterprise</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Unlimited seats · SLA 99.9%</p>
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] text-gray-400 font-medium">Settings</span>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <span className="text-[12px] text-gray-600 font-medium">{current.label}</span>
            </div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight">{current.label}</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">{current.desc}</p>
          </div>
          <div key={active}>{renderPanel()}</div>
        </div>
      </div>
    </div>
  );
}
