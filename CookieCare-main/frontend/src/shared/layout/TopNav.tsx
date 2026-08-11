import { useState, useRef, useEffect } from "react";
import { Bell, ChevronDown, LogOut, Settings, User } from "lucide-react";
import { getBreadcrumb } from "./sidebar/navConfig";
import { cn } from "../../lib/utils";

interface TopNavProps {
  user: { name: string; email: string; role?: string } | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isAdmin?: boolean;
}

export default function TopNav({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  isAdmin = false,
}: TopNavProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { section, page } = getBreadcrumb(activeTab, isAdmin);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : "Member";

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const openSettings = () => {
    setProfileOpen(false);
    setActiveTab("settings");
  };

  return (
    <header className="topnav-shell shrink-0 flex items-center px-4 gap-3 no-print">
      {/* Breadcrumb: Section / Page */}
      <div className="flex items-center gap-2 min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="hidden sm:flex items-center gap-1.5 text-[length:var(--text-body-sm)] min-w-0"
        >
          {section ? (
            <>
              <span className="truncate text-[var(--color-text-tertiary)]">{section}</span>
              <span className="text-[var(--color-text-tertiary)]">/</span>
            </>
          ) : null}
          <span className="font-medium truncate text-[var(--color-text-primary)]">
            {page}
          </span>
        </nav>
      </div>

      {/* Right actions */}
      <div className="flex-1 flex items-center justify-end gap-1">
        {/* Notifications — empty until real data exists */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setProfileOpen(false);
            }}
            className="topnav-icon-btn"
            aria-label="Notifications"
            aria-expanded={notifOpen}
          >
            <Bell className="w-[17px] h-[17px]" strokeWidth={1.5} />
          </button>

          {notifOpen && (
            <div className="topnav-dropdown absolute top-full right-0 mt-2 w-[280px] overflow-hidden z-50">
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--color-text-primary)]">
                  Notifications
                </span>
              </div>
              <div className="px-4 py-8 text-center">
                <p className="text-[length:var(--text-body-sm)] font-medium text-[var(--color-text-secondary)]">
                  No notifications
                </p>
                <p className="text-[length:var(--text-caption)] text-[var(--color-text-tertiary)] mt-1">
                  You&apos;re all caught up.
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotifOpen(false);
            }}
            className={cn(
              "flex items-center gap-2.5 pl-2 pr-3 h-9 rounded-[var(--radius-md)] outline-none",
              "transition-colors duration-100 hover:bg-[var(--color-surface-3)]"
            )}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 text-white select-none"
              style={{ background: "var(--color-brand)" }}
            >
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none gap-[3px]">
              <span className="text-[12.5px] font-semibold truncate max-w-[130px] text-[var(--color-text-primary)]">
                {user?.name ?? "User"}
              </span>
              <span className="text-[11px] truncate max-w-[130px] text-[var(--color-text-tertiary)]">
                {roleLabel}
              </span>
            </div>
            <ChevronDown
              className="w-3.5 h-3.5 shrink-0 hidden sm:block text-[var(--color-text-tertiary)]"
              strokeWidth={1.5}
            />
          </button>

          {profileOpen && (
            <div className="topnav-dropdown absolute top-full right-0 mt-2 w-[228px] overflow-hidden z-50">
              <div
                className="px-4 py-3.5"
                style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] text-white shrink-0"
                    style={{ background: "var(--color-brand)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[length:var(--text-body-sm)] font-semibold truncate text-[var(--color-text-primary)]">
                      {user?.name}
                    </p>
                    <p className="text-[11px] truncate mt-0.5 text-[var(--color-text-tertiary)]">
                      {user?.email}
                    </p>
                  </div>
                </div>
                {user?.role && (
                  <span
                    className="inline-block mt-2.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius-sm)]"
                    style={{
                      background: "var(--color-brand-subtle)",
                      color: "var(--color-brand-text)",
                      border: "1px solid color-mix(in srgb, var(--color-brand) 20%, transparent)",
                    }}
                  >
                    {user.role}
                  </span>
                )}
              </div>

              <div className="py-1.5">
                <button
                  type="button"
                  className="topnav-menu-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <User className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                  <span>Your profile</span>
                </button>
                <button type="button" className="topnav-menu-item" onClick={openSettings}>
                  <Settings className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                  <span>Settings</span>
                </button>
              </div>

              <div className="py-1.5" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                <button
                  id="topnav-logout-btn"
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="topnav-menu-item text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text)]"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
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
