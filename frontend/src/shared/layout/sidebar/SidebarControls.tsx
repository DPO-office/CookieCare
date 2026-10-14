// ─── SidebarControls ──────────────────────────────────────────────────────────
// CollapseToggle — the expand/collapse button in the sidebar header.
// LogoArea     — renders the brand logo, adapting to collapsed/expanded state.

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";
import { useSidebar } from "./hooks/useSidebar";
import { SidebarTrigger } from "./SidebarPrimitives";

// ── CollapseToggle ────────────────────────────────────────────────────────────

interface CollapseToggleProps {
  isDark?: boolean;
}

export function CollapseToggle({ isDark = false }: CollapseToggleProps) {
  const { state, toggleSidebar, isMobile } = useSidebar();
  if (isMobile) return null;

  const collapsed = state === "collapsed";
  const iconColor = isDark ? "rgba(255,255,255,0.35)" : undefined;
  const bgColor = isDark
    ? collapsed
      ? "rgba(255,255,255,0.08)"
      : "transparent"
    : undefined;

  return (
    <SidebarTrigger
      onClick={toggleSidebar}
      className={
        collapsed
          ? "absolute -right-3 top-[18px] w-6 h-6 rounded-full bg-white border border-[#E4E4E7] shadow-sm z-10"
          : "w-7 h-7 shrink-0 ml-2"
      }
      style={
        bgColor || iconColor
          ? { background: bgColor, color: iconColor }
          : undefined
      }
    >
      {collapsed ? (
        <PanelLeftOpen className="w-3 h-3" />
      ) : (
        <PanelLeftClose className="w-3.5 h-3.5" />
      )}
    </SidebarTrigger>
  );
}

// ── LogoArea ──────────────────────────────────────────────────────────────────

interface LogoAreaProps {
  isDark?: boolean;
}

export function LogoArea({ isDark: _isDark = false }: LogoAreaProps) {
  const { state } = useSidebar();
  return state === "collapsed" ? (
    <BrandLogo size="md" iconOnly />
  ) : (
    <BrandLogo size="lg" className="min-w-0" />
  );
}
