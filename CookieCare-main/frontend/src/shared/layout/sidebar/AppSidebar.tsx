import { useState, useEffect } from "react";
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";
import { buildNav, isNavGroup } from "./navConfig";
import { useSidebar } from "./hooks/useSidebar";
import { SidebarPrimitive, SidebarInset } from "./SidebarPrimitives";
import { THEME } from "./sidebarTheme";
import type { NavGroup, NavItem, NavLeaf } from "./navConfig";

const FADE =
  "overflow-hidden whitespace-nowrap transition-opacity duration-200 ease-out group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:opacity-0";

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
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2
                 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium tracking-[-0.01em]
                 select-none"
      style={{
        background: "#18181B",
        color: "#FAFAFA",
        boxShadow: "0 8px 24px rgba(16,24,40,0.18), 0 0 0 1px rgba(16,24,40,0.08)",
      }}
    >
      {label}
    </div>
  );
}

function navSurface(active: boolean): React.CSSProperties {
  return {
    border: "none",
    borderRadius: 10,
    background: active ? THEME.itemActive : "transparent",
    boxShadow: active ? THEME.itemActiveShadow : "none",
    color: active ? THEME.itemActiveText : THEME.itemIdle,
    fontWeight: active ? 600 : 500,
    transition: "background 160ms ease, color 160ms ease, box-shadow 160ms ease",
  };
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
    <div className={`relative ${collapsed ? "flex justify-center" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        title={collapsed ? label : undefined}
        className="flex cursor-pointer items-center outline-none select-none"
        style={{
          width: collapsed ? 36 : "100%",
          height: collapsed ? 36 : undefined,
          minHeight: collapsed ? 36 : 40,
          gap: collapsed ? 0 : 10,
          paddingLeft: collapsed ? 0 : 10,
          paddingRight: collapsed ? 0 : 12,
          paddingTop: collapsed ? 0 : 8,
          paddingBottom: collapsed ? 0 : 8,
          justifyContent: collapsed ? "center" : "flex-start",
          fontSize: 13,
          letterSpacing: "-0.015em",
          ...navSurface(active),
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
            e.currentTarget.style.color = THEME.itemIdle;
          }
          setTip(false);
        }}
      >
        <Icon
          style={{
            width: collapsed ? 16 : 17,
            height: collapsed ? 16 : 17,
            flexShrink: 0,
            color: active ? THEME.itemActiveIcon : THEME.itemIdleIcon,
          }}
          strokeWidth={active ? 1.9 : 1.7}
        />
        {!collapsed && (
          <span className={`min-w-0 flex-1 text-left leading-snug ${FADE}`}>
            {label}
          </span>
        )}
      </button>
      {collapsed && tip && <Tooltip label={label} />}
    </div>
  );
}

function ChildNavButton({
  child,
  active,
  collapsed,
  onClick,
}: {
  child: NavLeaf;
  active: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  const Icon = child.icon;
  const [tip, setTip] = useState(false);

  return (
    <div className={`relative ${collapsed ? "flex justify-center" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        title={collapsed ? child.label : undefined}
        className="flex cursor-pointer items-center outline-none select-none rounded-lg"
        style={{
          width: collapsed ? 36 : "100%",
          height: collapsed ? 36 : undefined,
          minHeight: collapsed ? 36 : 38,
          gap: collapsed ? 0 : 10,
          paddingLeft: collapsed ? 0 : 10,
          paddingRight: collapsed ? 0 : 12,
          paddingTop: collapsed ? 0 : 7,
          paddingBottom: collapsed ? 0 : 7,
          justifyContent: collapsed ? "center" : "flex-start",
          fontSize: 13,
          letterSpacing: "-0.015em",
          ...navSurface(active),
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
            e.currentTarget.style.color = THEME.itemIdle;
          }
          setTip(false);
        }}
      >
        <Icon
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: active ? THEME.itemActiveIcon : THEME.itemIdleIcon,
          }}
          strokeWidth={active ? 1.9 : 1.7}
        />
        {!collapsed && (
          <span className={`min-w-0 flex-1 text-left leading-snug ${FADE}`}>{child.label}</span>
        )}
      </button>
      {collapsed && tip && <Tooltip label={child.label} />}
    </div>
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

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  const Icon = group.icon;

  if (collapsed) {
    return (
      <div className="flex w-full flex-col items-center gap-0.5">
        <div
          style={{
            width: 16,
            height: 1,
            margin: "8px 0 6px",
            background: THEME.border,
          }}
        />
        {group.children.map((child) => (
          <ChildNavButton
            key={child.id}
            child={child}
            active={activeTab === child.id}
            collapsed
            onClick={() => setActiveTab(child.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-5 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full cursor-pointer items-center outline-none select-none"
        style={{
          minHeight: 38,
          paddingLeft: 10,
          paddingRight: 8,
          gap: 10,
          color: THEME.sectionLabel,
          background: "transparent",
          borderRadius: 12,
          transition: "background 160ms ease, color 160ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = THEME.itemIdle;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = THEME.sectionLabel;
        }}
      >
        <Icon
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: THEME.itemIdleIcon,
          }}
          strokeWidth={1.7}
        />
        <span className={`flex min-w-0 flex-1 items-center justify-between gap-1.5 ${FADE}`}>
          <span
            className="text-left leading-none uppercase"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
            }}
          >
            {group.label}
          </span>
          <ChevronDown
            style={{
              width: 12,
              height: 12,
              flexShrink: 0,
              opacity: 0.7,
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
          transition: "grid-template-rows 200ms ease",
          overflow: "hidden",
        }}
      >
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div className="flex flex-col gap-1">
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
  return (
    <div
      className={
        collapsed
          ? "flex flex-col items-center px-0 pt-3 pb-2.5"
          : "flex items-center gap-2 px-3 pt-3 pb-3"
      }
      style={{ borderBottom: `1px solid ${THEME.border}` }}
    >
      <div className={collapsed ? "flex justify-center" : "min-w-0 flex-1"}>
        <BrandLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          tagline={collapsed ? undefined : "Legal Operations & Risk Assistant"}
          className={collapsed ? "" : "mt-[6px] ml-[6px]"}
        />
      </div>
      {!collapsed && (
        <div className="mt-0.5 shrink-0">
          <SidebarToggleBtn />
        </div>
      )}
    </div>
  );
}

function SidebarToggleBtn({ className = "" }: { className?: string }) {
  const { toggleSidebar, isMobile, state } = useSidebar();
  if (isMobile) return null;

  const collapsed = state === "collapsed";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none ${className}`}
      style={{ color: THEME.textMuted }}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = THEME.itemHover;
        e.currentTarget.style.color = THEME.itemIdle;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = THEME.textMuted;
      }}
    >
      <Icon style={{ width: 16, height: 16 }} strokeWidth={1.7} />
    </button>
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

  return (
    <div
      className={collapsed ? "flex justify-center px-0 pb-3 pt-2.5" : "px-3 pb-3 pt-2.5"}
      style={{ borderTop: `1px solid ${THEME.border}` }}
    >
      <div
        className={collapsed ? "relative flex items-center justify-center" : "flex min-w-0 items-center gap-2.5 px-2 py-2"}
        style={
          collapsed
            ? undefined
            : {
                borderRadius: 14,
                background: THEME.searchBg,
              }
        }
      >
        <div
          className="flex items-center justify-center rounded-full select-none shrink-0"
          style={{
            width: collapsed ? 28 : 32,
            height: collapsed ? 28 : 32,
            background: THEME.well,
            color: THEME.wellInk,
            fontSize: collapsed ? 10 : 11,
            fontWeight: 600,
            boxShadow: "inset 0 0 0 1px rgba(79, 91, 217, 0.12)",
          }}
          title={collapsed ? `${user.name} · ${user.email}` : undefined}
        >
          {initials}
        </div>

        {!collapsed && (
          <>
            <div className={`min-w-0 flex-1 ${FADE}`}>
              <p className="m-0 truncate text-[12.5px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: THEME.textPrimary }}>
                {user.name}
              </p>
              <p className="m-0 mt-0.5 truncate text-[11px] leading-tight" style={{ color: THEME.textMuted }}>
                {user.email}
              </p>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className={`inline-flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center outline-none transition-colors ${FADE}`}
              style={{
                borderRadius: 9,
                border: "none",
                background: "transparent",
                color: THEME.textMuted,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FEF2F2";
                e.currentTarget.style.color = "#DC2626";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = THEME.textMuted;
              }}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut style={{ width: 15, height: 15 }} strokeWidth={1.75} />
            </button>
          </>
        )}
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
          paddingBottom: 8,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        <div
          className={
            collapsed
              ? "flex flex-col items-center gap-0.5 px-0 pt-2"
              : "flex flex-col px-2.5 pt-2"
          }
        >
          {collapsed && (
            <div className="mb-1.5 flex justify-center">
              <SidebarToggleBtn />
            </div>
          )}
          {nav.filter((entry) => !isNavGroup(entry)).map((entry) => (
            <NavButton
              key={entry.id}
              label={(entry as NavItem).label}
              icon={(entry as NavItem).icon}
              active={activeTab === entry.id}
              collapsed={collapsed}
              onClick={() => setActiveTab(entry.id)}
            />
          ))}
          {!collapsed && (
            <div
              style={{
                height: 1,
                margin: "12px 8px 2px",
                background: THEME.border,
              }}
            />
          )}
          {nav.filter(isNavGroup).map((entry) => (
            <SectionGroup
              key={entry.id}
              group={entry}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              collapsed={collapsed}
            />
          ))}
        </div>
      </div>

      <UserArea user={user} collapsed={collapsed} onLogout={onLogout} />
    </SidebarPrimitive>
  );
}
