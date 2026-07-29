import { useState, useRef, useEffect } from "react";
import { Bell, ChevronDown, Settings, LogOut, User } from "lucide-react";

interface TopNavProps {
  user: { name: string; email: string; role?: string } | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}



export default function TopNav({ user, activeTab, setActiveTab, onLogout }: TopNavProps) {
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : "Member";

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))  setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target   as Node))  setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setProfileOpen(false); setNotifOpen(false); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <header
      className="h-[58px] shrink-0 flex items-center px-5 gap-4 no-print"
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #E4E4E7",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      {/* ·· Right: actions ·· */}
      <div className="flex-1 flex items-center justify-end gap-1">

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg outline-none transition-all duration-150"
            style={{ color: "#71717A" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#F4F4F5";
              (e.currentTarget as HTMLElement).style.color = "#0F172A";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#71717A";
            }}
            aria-label="Notifications"
          >
            <Bell className="w-[17px] h-[17px]" />
            {/* unread dot */}
            <span
              className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full border-2 border-white"
              style={{ background: "#2175D9" }}
            />
          </button>

          {notifOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-[300px] overflow-hidden z-50"
              style={{
                background: "#ffffff",
                border: "1px solid #E4E4E7",
                borderRadius: "12px",
                boxShadow: "0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)",
              }}
            >
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: "1px solid #F4F4F5" }}
              >
                <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>
                  Notifications
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white"
                  style={{ background: "#2175D9" }}
                >
                  1 new
                </span>
              </div>
              <div className="py-1.5">
                <div
                  className="px-4 py-3 cursor-pointer transition-colors"
                  style={{ borderLeft: "2px solid #2175D9" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#F4F4F5"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0" style={{ background: "#2175D9" }} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium leading-snug" style={{ color: "#0F172A" }}>
                        AI Summary ready
                      </p>
                      <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: "#71717A" }}>
                        Your latest contract analysis has completed.
                      </p>
                      <p className="text-[10.5px] mt-1" style={{ color: "#A1A1AA" }}>Just now</p>
                    </div>
                  </div>
                </div>
                <div
                  className="px-4 py-3 cursor-pointer transition-colors"
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#F4F4F5"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-[5px] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium leading-snug opacity-60" style={{ color: "#0F172A" }}>
                        All systems operational
                      </p>
                      <p className="text-[11.5px] mt-0.5 leading-snug opacity-60" style={{ color: "#71717A" }}>
                        Platform status is healthy.
                      </p>
                      <p className="text-[10.5px] mt-1" style={{ color: "#A1A1AA" }}>2h ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: "#E4E4E7" }} />

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
            className="flex items-center gap-2.5 pl-2 pr-3 h-9 rounded-lg outline-none transition-all duration-150"
            style={{ color: "#0F172A" }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#F4F4F5"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
            aria-label="Open profile menu"
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 text-white select-none"
              style={{ background: "#2175D9" }}
            >
              {initials}
            </div>

            {/* Name + Role */}
            <div className="hidden sm:flex flex-col items-start leading-none gap-[3px]">
              <span className="text-[12.5px] font-semibold truncate max-w-[130px]" style={{ color: "#0F172A" }}>
                {user?.name ?? "User"}
              </span>
              <span className="text-[11px] truncate max-w-[130px]" style={{ color: "#A1A1AA" }}>
                {roleLabel}
              </span>
            </div>

            {/* Caret */}
            <ChevronDown
              className="w-3.5 h-3.5 shrink-0 hidden sm:block"
              style={{ color: "#A1A1AA" }}
            />
          </button>

          {profileOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-[228px] overflow-hidden z-50"
              style={{
                background: "#ffffff",
                border: "1px solid #E4E4E7",
                borderRadius: "12px",
                boxShadow: "0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)",
              }}
            >
              {/* User header */}
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid #F4F4F5" }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] text-white shrink-0"
                    style={{ background: "#2175D9" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "#0F172A" }}>
                      {user?.name}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "#A1A1AA" }}>
                      {user?.email}
                    </p>
                  </div>
                </div>
                {user?.role && (
                  <span
                    className="inline-block mt-2.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{
                      background: "#EBF4FF",
                      color: "#2175D9",
                      border: "1px solid #BFDBFE",
                    }}
                  >
                    {user.role}
                  </span>
                )}
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                {([
                  { icon: User,     label: "Your profile" },
                  { icon: Settings, label: "Settings"     },
                ] as const).map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    className="w-full flex items-center gap-3 px-4 py-2 text-[12.5px] outline-none transition-colors duration-100"
                    style={{ color: "#3F3F46" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#F4F4F5";
                      (e.currentTarget as HTMLElement).style.color = "#0F172A";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "#3F3F46";
                    }}
                    onClick={() => setProfileOpen(false)}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: "#A1A1AA" }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Sign out */}
              <div className="py-1.5" style={{ borderTop: "1px solid #F4F4F5" }}>
                <button
                  id="topnav-logout-btn"
                  onClick={() => { setProfileOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12.5px] outline-none transition-colors duration-100"
                  style={{ color: "#EF4444" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#FEF2F2"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
