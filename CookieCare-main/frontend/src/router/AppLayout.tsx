/**
 * AppLayout.tsx — Persistent shell layout.
 *
 * Rendered once by the protected layout route. The Sidebar, SidebarProvider,
 * and SidebarInset are mounted here and NEVER remount on route changes.
 * Feature pages render into <Outlet /> inside SidebarInset.
 *
 * Below 768px a compact bar opens the existing sidebar drawer. Desktop keeps
 * the sidebar in the document flow with no extra header.
 */

import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "../shared/layout";
import { SidebarProvider, SidebarInset, useSidebar } from "../shared/layout/Sidebar";
import { useAppContext } from "../contexts/AppContext";
import { BrandLogo } from "../shared/components/BrandLogo";

function MobileShellBar() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  if (!isMobile) return null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-2">
      <button
        id="lora-mobile-menu"
        type="button"
        aria-label={openMobile ? "Close menu" : "Open menu"}
        aria-expanded={openMobile}
        aria-controls="lora-mobile-nav"
        onClick={toggleSidebar}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-[var(--color-text-secondary)]"
      >
        <Menu aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <div className="flex min-w-0 items-center">
        <BrandLogo size="sm" />
      </div>
    </header>
  );
}

export default function AppLayout() {
  const { currentUser, isAdmin, handleLogout } = useAppContext();

  return (
    <SidebarProvider>
      <div className="flex h-full w-full min-w-0 max-w-full overflow-hidden font-sans app-shell">
        <Sidebar
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        <SidebarInset>
          <MobileShellBar />
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
