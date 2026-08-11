import { useState, useEffect } from "react";
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";
import { buildNav, isNavGroup } from "./navConfig";
import { useSidebar } from "./hooks/useSidebar";
import { SidebarPrimitive, SidebarInset } from "./SidebarPrimitives";
import { THEME } from "./sidebarTheme";
import type { NavGroup, NavItem, NavLeaf } from "./navConfig";

export { SidebarInset };

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: { name: string; email: string; role?: string } | null;
  isAdmin?: boolean;
  onLogout: () => void;
}

function Tooltip({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50
                 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium
                 shadow-lg select-none"
      style={{ background: "#18181B", color: "#FAFAFA" }}
    >
      {label}
      <span
        className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
        style={{ borderRightColor: "#18181B" }}
      />
    </div>
  );
}

function NavButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const [tip, setTip] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center outline-none select-none"
        style={{
          minHeight: 38,
          gap: collapsed ? 0 : 12,
          paddingLeft: collapsed ? 0 : 12,
          paddingRight: collapsed ? 0 : 12,
          paddingTop: 8,
          paddingBottom: 8,
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 12,
          background: active ? THEME.itemActive : "transparent",
          color: active ? THEME.itemActiveText : THEME.textSecondary,
          fontSize: 14,
          fontWeight: active ? 500 : 400,
          transition: "background 150ms ease, color 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = THEME.itemHover;
            e.currentTarget.style.color = THEME.itemHoverText;
          }
          if (collapsed) setTip(true);
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = THEME.textSecondary;
          }
          setTip(false);
        }}
      >
        <Icon
          style={{
            width: 18,
            height: 18,
            flexShrink: 0,
            color: active ? THEME.itemActiveIcon : THEME.textSecondary,
          }}
          strokeWidth={1.75}
        />
        {!collapsed && (
          <span className="flex-1 min-w-0 text-left leading-snug whitespace-normal">{label}</span>
        )}
      </button>
      {collapsed && tip && <Tooltip label={label} />}
    </div>
  );
}

function ChildNavButton({
  child,
  active,
  onClick,
}: {
  child: NavLeaf;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = child.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start outline-none select-none"
      style={{
        minHeight: 36,
        gap: 12,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 8,
        borderRadius: 12,
        background: active ? THEME.itemActive : "transparent",
        color: active ? THEME.itemActiveText : THEME.textSecondary,
        fontSize: 14,
        fontWeight: active ? 500 : 400,
        transition: "background 150ms ease, color 150ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = THEME.itemHover;
          e.currentTarget.style.color = THEME.itemHoverText;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = THEME.textSecondary;
        }
      }}
    >
      <Icon
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          marginTop: 1,
          color: active ? THEME.itemActiveIcon : THEME.textMuted,
        }}
        strokeWidth={1.75}
      />
      <span className="flex-1 min-w-0 text-left leading-snug whitespace-normal">{child.label}</span>
    </button>
  );
}

function SectionGroup({
  group,
  activeTab,
  setActiveTab,
  collapsed,
}: {
  group: NavGroup;
  activeTab: string;
  setActiveTab: (t: string) => void;
  collapsed: boolean;
}) {
  const sectionActive = group.children.some((c) => c.id === activeTab);
  const [open, setOpen] = useState(sectionActive);
  const { setOpen: setSidebarOpen } = useSidebar();
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  const Icon = group.icon;

  if (collapsed) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex items-center justify-center outline-none select-none"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: sectionActive ? THEME.itemActive : "transparent",
            color: sectionActive ? THEME.itemActiveText : THEME.textSecondary,
            transition: "background 150ms ease, color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!sectionActive) {
              e.currentTarget.style.background = THEME.itemHover;
            }
            setTip(true);
          }}
          onMouseLeave={(e) => {
            if (!sectionActive) {
              e.currentTarget.style.background = "transparent";
            }
            setTip(false);
          }}
        >
          <Icon style={{ width: 18, height: 18 }} strokeWidth={1.75} />
        </button>
        {tip && <Tooltip label={group.label} />}
      </div>
    );
  }

  return (
    <div className="mt-5 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between outline-none select-none mb-1.5"
        style={{
          height: 28,
          paddingLeft: 4,
          paddingRight: 4,
          color: THEME.sectionLabel,
          transition: "color 150ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = THEME.textMuted;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = THEME.sectionLabel;
        }}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-left leading-snug whitespace-normal"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {group.label}
          </span>
          <ChevronDown
            style={{
              width: 14,
              height: 14,
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 180ms ease",
            }}
            strokeWidth={2}
          />
        </span>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: "grid-template-rows 200ms ease, opacity 150ms ease",
          overflow: "hidden",
        }}
      >
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div className="flex flex-col gap-0.5">
            {group.children.map((child) => (
              <ChildNavButton
                key={child.id}
                child={child}
                active={activeTab === child.id}
                onClick={() => setActiveTab(child.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceHeader({ collapsed }: { collapsed: boolean }) {
  const { toggleSidebar, isMobile } = useSidebar();

  if (collapsed) {
    return (
      <div className="flex flex-col items-center pt-4 pb-3 gap-3">
        <BrandLogo size="sm" iconOnly />
        {!isMobile && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-lg outline-none"
            style={{ width: 32, height: 32, color: THEME.textMuted }}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen style={{ width: 16, height: 16 }} strokeWidth={1.75} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <BrandLogo size="sm" />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!isMobile && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex items-center justify-center rounded-lg outline-none"
              style={{ width: 30, height: 30, color: THEME.textMuted }}
              aria-label="Collapse sidebar"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = THEME.itemHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <PanelLeftClose style={{ width: 16, height: 16 }} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UserArea({
  user,
  collapsed,
  onLogout,
}: {
  user: { name: string; email: string; role?: string } | null;
  collapsed: boolean;
  onLogout: () => void;
}) {
  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 py-4" style={{ borderTop: `1px solid ${THEME.border}` }}>
        <div
          title={`${user.name} · ${user.email}`}
          className="flex items-center justify-center rounded-full select-none shrink-0"
          style={{
            width: 32,
            height: 32,
            background: "#F4F4F5",
            color: "#52525B",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className="flex items-center justify-center rounded-lg outline-none border-none cursor-pointer"
          style={{ width: 32, height: 32, color: THEME.textMuted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FEF2F2";
            e.currentTarget.style.color = "#DC2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = THEME.textMuted;
          }}
        >
          <LogOut style={{ width: 16, height: 16 }} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-3" style={{ borderTop: `1px solid ${THEME.border}` }}>
      <div className="flex items-center gap-3 min-w-0 rounded-xl px-2 py-2">
        <div
          className="flex items-center justify-center rounded-full select-none shrink-0"
          style={{
            width: 36,
            height: 36,
            background: "#F4F4F5",
            color: "#52525B",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="m-0 truncate text-[14px] font-medium leading-tight" style={{ color: THEME.textPrimary }}>
            {user.name}
          </p>
          <p className="m-0 mt-0.5 truncate text-[12px] leading-tight" style={{ color: THEME.textMuted }}>
            {user.email}
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border outline-none shrink-0 cursor-pointer transition-colors"
          style={{
            borderColor: THEME.border,
            background: "#FFFFFF",
            color: THEME.textSecondary,
            fontSize: 12,
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FEF2F2";
            e.currentTarget.style.borderColor = "#FECACA";
            e.currentTarget.style.color = "#DC2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#FFFFFF";
            e.currentTarget.style.borderColor = THEME.border;
            e.currentTarget.style.color = THEME.textSecondary;
          }}
          aria-label="Log out"
        >
          <LogOut style={{ width: 14, height: 14 }} strokeWidth={1.75} />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function AppSidebar({
  activeTab,
  setActiveTab,
  user,
  isAdmin = false,
  onLogout,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const nav = buildNav(isAdmin);

  return (
    <SidebarPrimitive collapsible="icon" className="no-print">
      <WorkspaceHeader collapsed={collapsed} />

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          paddingTop: collapsed ? 4 : 0,
          paddingBottom: 8,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 px-3">
            {nav.map((entry) => {
              if (isNavGroup(entry)) {
                return (
                  <SectionGroup
                    key={entry.id}
                    group={entry}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    collapsed
                  />
                );
              }
              return (
                <NavButton
                  key={entry.id}
                  label={(entry as NavItem).label}
                  icon={(entry as NavItem).icon}
                  active={activeTab === entry.id}
                  collapsed
                  onClick={() => setActiveTab(entry.id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col px-3">
            {nav.map((entry) => {
              if (isNavGroup(entry)) {
                return (
                  <SectionGroup
                    key={entry.id}
                    group={entry}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    collapsed={false}
                  />
                );
              }
              return (
                <NavButton
                  key={entry.id}
                  label={(entry as NavItem).label}
                  icon={(entry as NavItem).icon}
                  active={activeTab === entry.id}
                  collapsed={false}
                  onClick={() => setActiveTab(entry.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      <UserArea user={user} collapsed={collapsed} onLogout={onLogout} />
    </SidebarPrimitive>
  );
}
