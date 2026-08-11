// ─── SidebarNavItems ──────────────────────────────────────────────────────────
// TopNavItem   — renders a top-level flat nav item (Dashboard, RandTrust AI).
// SectionGroup — renders an accordion group with labelled child items.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useSidebar } from "./hooks/useSidebar";
import { DARK } from "./sidebarTheme";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "./SidebarPrimitives";
import type { NavItem, NavGroup } from "./navConfig";

// ── Shared nav props ──────────────────────────────────────────────────────────

interface NavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDark?: boolean;
}

// ── TopNavItem ────────────────────────────────────────────────────────────────

interface TopNavItemProps extends NavProps {
  entry: NavItem;
}

export function TopNavItem({
  entry,
  activeTab,
  setActiveTab,
  isDark = false,
}: TopNavItemProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const active = activeTab === entry.id;
  const isAI = entry.id === "randtrust-ai";
  const Icon = entry.icon;

  const textColor = isDark
    ? active
      ? "rgba(255,255,255,0.92)"
      : "rgba(255,255,255,0.45)"
    : active
    ? "#ffffff"
    : "#4B5563";

  const activeBg = isDark ? "rgba(255,255,255,0.08)" : "#2175D9";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "#ffffff";

  return (
    <SidebarGroup className="pt-2 px-0">
      <SidebarMenu>
        <SidebarMenuItem>
          {isAI ? (
            // RandTrust AI gets a special branded button with an "AI" badge
            <button
              data-sidebar="menu-button"
              data-active={active}
              onClick={() => setActiveTab(entry.id)}
              title={collapsed ? entry.label : undefined}
              className={[
                "group/btn peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 font-medium outline-none ring-0 transition-all duration-150 h-9 text-[13px]",
                collapsed ? "justify-center px-0" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                background: active ? activeBg : "transparent",
                color: textColor,
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = hoverBg;
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{
                  color: active
                    ? isDark
                      ? "rgba(255,255,255,0.8)"
                      : "#ffffff"
                    : "#2175D9",
                }}
              />
              {!collapsed && (
                <>
                  <span
                    style={{
                      color: textColor,
                      fontWeight: isAI && !active ? 600 : 500,
                    }}
                  >
                    {entry.label}
                  </span>
                  {!active && (
                    <span
                      className="ml-auto text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded"
                      style={{
                        background: isDark
                          ? "rgba(33,117,217,0.15)"
                          : "#EBF4FD",
                        color: "#2175D9",
                      }}
                    >
                      AI
                    </span>
                  )}
                </>
              )}
            </button>
          ) : (
            <SidebarMenuButton
              isActive={active}
              onClick={() => setActiveTab(entry.id)}
              tooltip={entry.label}
              className={collapsed ? "justify-center px-0 h-9" : "h-9"}
              isDark={isDark}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{
                  color: active
                    ? isDark
                      ? "rgba(255,255,255,0.8)"
                      : "#ffffff"
                    : isDark
                    ? "rgba(255,255,255,0.3)"
                    : "#9CA3AF",
                }}
              />
              {!collapsed && (
                <span style={{ color: textColor }}>{entry.label}</span>
              )}
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

// ── SectionGroup ──────────────────────────────────────────────────────────────

interface SectionGroupProps extends NavProps {
  group: NavGroup;
}

export function SectionGroup({
  group,
  activeTab,
  setActiveTab,
  isDark = false,
}: SectionGroupProps) {
  const { state, setOpen: setSidebarOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const sectionHasActive = group.children.some((c) => c.id === activeTab);
  const [open, setOpen] = useState(true);
  const expanded = open && !collapsed;
  const Icon = group.icon;

  const groupLabelColor = isDark ? DARK.groupLabel : "#9CA3AF";
  const labelHoverColor = isDark ? "rgba(255,255,255,0.5)" : "#6B7280";

  // ── Collapsed: show icon-only button that expands the sidebar on click ──
  if (collapsed) {
    return (
      <SidebarGroup className="pt-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={group.label}
              isActive={sectionHasActive}
              className="justify-center px-0 h-9"
              isDark={isDark}
              onClick={() => setSidebarOpen(true)}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{
                  color: sectionHasActive
                    ? isDark
                      ? "rgba(255,255,255,0.8)"
                      : "#ffffff"
                    : isDark
                    ? "rgba(255,255,255,0.3)"
                    : "#9CA3AF",
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  // ── Expanded: accordion with labelled header ──────────────────────────────
  return (
    <SidebarGroup>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between rounded-md px-2 text-[10px] font-semibold tracking-widest uppercase transition-colors duration-150 outline-none"
        style={{ color: groupLabelColor }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = labelHoverColor)
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color = groupLabelColor)
        }
      >
        <span>{group.label}</span>
        <ChevronRight
          className={[
            "w-3 h-3 shrink-0 transition-transform duration-200",
            expanded ? "rotate-90" : "rotate-0",
          ].join(" ")}
        />
      </button>

      <SidebarGroupContent
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-in-out ${
          expanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <SidebarMenu className="mt-0.5">
            {group.children.map((child) => {
              const ChildIcon = child.icon;
              const active = activeTab === child.id;

              if (child.disabled) {
                return (
                  <SidebarMenuItem key={child.id}>
                    <div className="flex h-8 items-center gap-2.5 rounded-lg px-3 cursor-default select-none">
                      <ChildIcon
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: isDark
                            ? "rgba(255,255,255,0.15)"
                            : "#D1D5DB",
                        }}
                      />
                      <span
                        className="flex-1 truncate text-[13px]"
                        style={{
                          color: isDark
                            ? "rgba(255,255,255,0.15)"
                            : "#D1D5DB",
                        }}
                      >
                        {child.label}
                      </span>
                      <SidebarMenuBadge>soon</SidebarMenuBadge>
                    </div>
                  </SidebarMenuItem>
                );
              }

              return (
                <SidebarMenuItem key={child.id}>
                  <SidebarMenuButton
                    isActive={active}
                    isDark={isDark}
                    onClick={() => setActiveTab(child.id)}
                    tooltip={child.label}
                  >
                    <ChildIcon
                      className="w-4 h-4 shrink-0"
                      style={{
                        color: active
                          ? isDark
                            ? "rgba(255,255,255,0.8)"
                            : "#ffffff"
                          : isDark
                          ? "rgba(255,255,255,0.3)"
                          : "#9CA3AF",
                      }}
                    />
                    <span
                      className="truncate"
                      style={{
                        color: active
                          ? isDark
                            ? "rgba(255,255,255,0.88)"
                            : "#ffffff"
                          : isDark
                          ? "rgba(255,255,255,0.45)"
                          : "#4B5563",
                      }}
                    >
                      {child.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
