import React from "react";
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Settings,
  LogOut,
  User,
  Scale,
  ShieldCheck,
  Percent,
  BookOpen
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: { name: string; email: string } | null;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "cookie-scanner", label: "Cookie Scanner", icon: ShieldCheck },
    { id: "legal-review", label: "Legal Review Suite", icon: Scale },
    { id: "vulnerability-scanner", label: "Vulnerability Scanner", icon: ShieldAlert },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-68 border-r border-gray-200 bg-white flex flex-col h-screen shrink-0 font-sans sticky top-0">
      {/* Brand Logo Header */}
      <div className="p-6 border-b border-gray-100 flex items-center space-x-3">
        <div className="bg-black text-white p-2 rounded-lg flex items-center justify-center shadow-sm">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <span className="font-display font-bold text-xl tracking-tight text-gray-900 block">
            PrivSecAI
          </span>
          <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase block -mt-1">
            PRIVACY AUDITOR
          </span>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-link-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive 
                  ? "bg-gray-100 text-black font-semibold border-l-4 border-black" 
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? "text-black" : "text-gray-400 group-hover:text-gray-500"}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>


      {/* User Session Footer Card */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        {user ? (
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            
            <button
              id="sidebar-logout-btn"
              onClick={onLogout}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 border border-gray-200 rounded-md text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Secure Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="py-2 text-center text-xs text-gray-400 font-mono">
            Secure Session Inactive
          </div>
        )}
      </div>
    </aside>
  );
}
