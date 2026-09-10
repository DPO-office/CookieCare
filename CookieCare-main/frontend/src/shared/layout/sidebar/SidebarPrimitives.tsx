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
  const collapsed = state === "collapsed";

  const panelStyle: React.CSSProperties = {
    background: THEME.bg,
    borderRadius: !isMobile && collapsed ? 16 : 24,
    boxShadow: THEME.hairline,
    fontFamily: "var(--font-sans)",
    transition: "width 300ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 300ms cubic-bezier(0.32, 0.72, 0, 1)",
  };

  if (collapsible === "none") {
    return (
      <div
        ref={ref}
        data-sidebar="sidebar"
        className={["flex h-full w-[var(--sidebar-width)] flex-col p-3", className]
          .filter(Boolean).join(" ")}
      >
        <div className="flex h-full flex-col overflow-hidden" style={panelStyle}>
          {children}
        </div>
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
            "fixed inset-y-0 left-0 z-50 flex flex-col h-full w-[var(--sidebar-width)] p-3",
            "transition-transform duration-300 ease-in-out",
            openMobile ? "translate-x-0" : "-translate-x-full",
            className,
          ].filter(Boolean).join(" ")}
        >
          <div className="flex h-full flex-col overflow-hidden" style={panelStyle}>
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={ref}
      data-sidebar="sidebar"
      data-state={state}
      data-collapsible={collapsed ? collapsible : ""}
      data-side={side}
      className={[
        "group relative flex h-screen shrink-0 sticky top-0 overflow-hidden py-3",
        collapsed ? "px-2" : "pl-3 pr-2",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        fontFamily: "var(--font-sans)",
        width: collapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)",
        transition: "width 300ms cubic-bezier(0.32, 0.72, 0, 1), padding 300ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div
        className="flex h-full flex-col overflow-hidden"
        style={{
          ...panelStyle,
          width: collapsed
            ? "calc(var(--sidebar-width-icon) - 1rem)"
            : "calc(var(--sidebar-width) - 1.25rem)",
          minWidth: collapsed
            ? "calc(var(--sidebar-width-icon) - 1rem)"
            : "calc(var(--sidebar-width) - 1.25rem)",
          maxWidth: collapsed
            ? "calc(var(--sidebar-width-icon) - 1rem)"
            : "calc(var(--sidebar-width) - 1.25rem)",
        }}
      >
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
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 font-medium outline-none",
        "transition-colors duration-200 ease-out",
        !isActive && "hover:bg-[#F7F8FB] hover:text-[#1a1a1a]",
        size === "sm" ? "h-8 text-[12px]" : size === "lg" ? "h-10 text-[14px]" : "h-9 text-[13px]",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        background: isActive ? THEME.itemActive : "transparent",
        boxShadow: isActive ? THEME.itemActiveShadow : "none",
        color: isActive ? THEME.itemActiveText : THEME.itemIdle,
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
        className={["inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ease-out outline-none hover:bg-[#F7F8FB] hover:text-[#1a1a1a]", className]
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
