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
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
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

    // Keyboard shortcut: Ctrl/Cmd + B
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
              "--sidebar-width": "216px",
              "--sidebar-width-icon": "52px",
              ...style,
            } as React.CSSProperties
          }
          className={[
            "group/sidebar-wrapper flex min-h-screen w-full",
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
