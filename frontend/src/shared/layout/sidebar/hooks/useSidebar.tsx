// ─── useSidebar + SidebarContext + useIsMobile ────────────────────────────────
// Central context for sidebar open/collapse state.
// Consumed by all sidebar primitive components and SidebarTrigger.

import * as React from "react";
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_KEYBOARD_SHORTCUT,
} from "../sidebarTheme";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SidebarState = "expanded" | "collapsed";

export interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

export const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

// ── useIsMobile ───────────────────────────────────────────────────────────────

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );

  React.useEffect(() => {
    // Range syntax matches innerWidth < breakpoint. `max-width: 767px` misses
    // a viewport of exactly 767px in Chrome, which left the desktop sidebar up.
    const mq = window.matchMedia(`(width < ${breakpoint}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return isMobile;
}

// ── SidebarProvider ───────────────────────────────────────────────────────────

export interface SidebarProviderProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function getPersistedOpen(defaultOpen: boolean): boolean {
  if (typeof document === "undefined") return defaultOpen;
  const found = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${SIDEBAR_COOKIE_NAME}=`));
  if (!found) return defaultOpen;
  return found.split("=")[1]?.trim() === "true";
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
    },
    ref
  ) => {
    const isMobile = useIsMobile();
    const [openMobile, setOpenMobile] = React.useState(false);
    const [_open, _setOpen] = React.useState<boolean>(() =>
      getPersistedOpen(defaultOpen)
    );

    const open = openProp ?? _open;

    const setOpen = React.useCallback(
      (value: boolean) => {
        setOpenProp ? setOpenProp(value) : _setOpen(value);
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [setOpenProp]
    );

    const toggleSidebar = React.useCallback(() => {
      isMobile ? setOpenMobile((v) => !v) : setOpen(!open);
    }, [isMobile, open, setOpen]);

    // Leaving the mobile breakpoint must not leave the drawer open, and must
    // not write the desktop cookie.
    React.useEffect(() => {
      if (!isMobile) setOpenMobile(false);
    }, [isMobile]);

    // Keyboard shortcut: Ctrl/Cmd + B. Mobile toggles the drawer only.
    React.useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (
          e.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (e.metaKey || e.ctrlKey)
        ) {
          e.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [toggleSidebar]);

    React.useEffect(() => {
      if (!isMobile || !openMobile) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setOpenMobile(false);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [isMobile, openMobile]);

    const state: SidebarState = open ? "expanded" : "collapsed";

    const ctx = React.useMemo(
      () => ({
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={ctx}>
        <div
          ref={ref}
          data-sidebar-provider=""
          style={
            {
              "--sidebar-width": "248px",
              "--sidebar-width-icon": "72px",
              ...style,
            } as React.CSSProperties
          }
          className={[
            "group/sidebar-wrapper flex h-screen max-md:h-dvh w-full min-w-0 max-w-full",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";
