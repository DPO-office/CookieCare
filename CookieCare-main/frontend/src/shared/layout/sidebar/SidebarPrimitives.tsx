// ─── Sidebar Primitives ───────────────────────────────────────────────────────
// Headless structural building blocks used by AppSidebar.
// Navigation logic lives in AppSidebar.tsx — only layout shells here.

import * as React from "react";
import { useSidebar } from "./hooks/useSidebar";
import { THEME } from "./sidebarTheme";

// ── SidebarPrimitive (the shell) ──────────────────────────────────────────────

interface SidebarPrimitiveProps {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
  className?: string;
  children?: React.ReactNode;
  isDark?: boolean; // kept for backward compat, ignored — always light now
}

export const SidebarPrimitive = React.forwardRef<
  HTMLDivElement,
  SidebarPrimitiveProps
>(({ side = "left", collapsible = "icon", className, children }, ref) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        ref={ref}
        data-sidebar="sidebar"
        className={["flex h-full w-[var(--sidebar-width)] flex-col border-r", className]
          .filter(Boolean).join(" ")}
        style={{ background: THEME.bg, borderColor: THEME.border }}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpenMobile(false)}
          />
        )}
        <div
          ref={ref}
          data-sidebar="sidebar"
          data-state={openMobile ? "expanded" : "collapsed"}
          className={[
            "fixed inset-y-0 left-0 z-50 flex flex-col h-full w-[var(--sidebar-width)]",
            "border-r shadow-xl transition-transform duration-300 ease-in-out",
            openMobile ? "translate-x-0" : "-translate-x-full",
            className,
          ].filter(Boolean).join(" ")}
          style={{ background: THEME.bg, borderColor: THEME.border }}
        >
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      ref={ref}
      data-sidebar="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
        className={[
          "group relative flex h-screen flex-col shrink-0 sticky top-0",
          "border-r transition-[width] duration-250 ease-in-out",
          state === "expanded"
            ? "w-[var(--sidebar-width)]"
            : collapsible === "icon"
            ? "w-[var(--sidebar-width-icon)]"
            : "w-0 overflow-hidden border-r-0",
          className,
        ].filter(Boolean).join(" ")}
      style={{ background: THEME.bg, borderColor: THEME.border, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
});
SidebarPrimitive.displayName = "SidebarPrimitive";

// ── SidebarInset ──────────────────────────────────────────────────────────────

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="inset"
    className={["flex flex-1 flex-col min-w-0 overflow-hidden relative", className]
      .filter(Boolean).join(" ")}
    {...props}
  />
));
SidebarInset.displayName = "SidebarInset";

// ── Below: legacy primitives kept for any imports that still reference them ───
// AppSidebar no longer uses these directly but they remain exported from
// Sidebar.tsx so any accidental imports don't break the build.

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="header"
      className={["flex shrink-0 flex-col gap-2 p-2", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="content"
      className={["flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]", className]
        .filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="footer"
      className={["flex shrink-0 flex-col", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarFooter.displayName = "SidebarFooter";

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group"
      className={["relative flex w-full min-w-0 flex-col px-2 pt-3", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group-content"
      className={["w-full text-sm", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarGroupContent.displayName = "SidebarGroupContent";

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} data-sidebar="menu"
      className={["flex w-full min-w-0 flex-col gap-0.5", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-sidebar="menu-item"
      className={["group/menu-item relative", className].filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarMenuItem.displayName = "SidebarMenuItem";

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean; tooltip?: string; size?: "default" | "sm" | "lg"; isDark?: boolean;
}
export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive = false, tooltip, size = "default", children, ...props }, ref) => (
    <button ref={ref} data-sidebar="menu-button" data-active={isActive}
      className={[
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 font-medium outline-none transition-all duration-100",
        size === "sm" ? "h-7 text-[12px]" : size === "lg" ? "h-10 text-[14px]" : "h-8 text-[13px]",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        background: isActive ? THEME.itemActive : "transparent",
        color: isActive ? THEME.itemActiveText : THEME.textSecondary,
      }}
      {...props}
    >
      {children}
    </button>
  )
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="menu-badge"
      className={["ml-auto shrink-0 text-[10px] font-semibold tracking-wider uppercase rounded px-1.5 py-0.5 bg-gray-100 text-gray-400", className]
        .filter(Boolean).join(" ")}
      {...props} />
  )
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, onClick, children, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <button ref={ref} data-sidebar="trigger" aria-label="Toggle sidebar"
        onClick={(e) => { onClick?.(e); toggleSidebar(); }}
        className={["inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 outline-none", className]
          .filter(Boolean).join(" ")}
        style={{ color: THEME.textMuted }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SidebarTrigger.displayName = "SidebarTrigger";
