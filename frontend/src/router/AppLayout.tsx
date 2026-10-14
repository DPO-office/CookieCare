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

import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "../shared/layout";
import { SidebarProvider, SidebarInset, useSidebar } from "../shared/layout/Sidebar";
import { useAppContext } from "../contexts/AppContext";
import { BrandLogo } from "../shared/components/BrandLogo";
import { pathToTabId } from "./routeMap";
import { getBreadcrumb } from "../shared/layout/sidebar/navConfig";

function MobileTopBar() {
  const { toggleSidebar } = useSidebar();
  const { currentUser, isAdmin } = useAppContext();
  const location = useLocation();

  const tabId = pathToTabId(location.pathname);
  const { page } = getBreadcrumb(tabId, isAdmin);

  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <header className="md:hidden flex h-14 shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-4 z-20 shadow-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          id="lora-mobile-menu"
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-[#374151] hover:bg-[#F3F4F6] transition-colors focus:outline-none"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <BrandLogo size="sm" iconOnly />
        <span className="text-[13px] font-semibold text-[#111827] truncate max-w-[170px]">
          {page}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs select-none"
          style={{ background: "var(--color-brand, #2175D9)" }}
          title={currentUser?.name || "User profile"}
        >
          {initials}
        </div>
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
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative h-full">
            <MobileTopBar />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
              <Outlet />
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
