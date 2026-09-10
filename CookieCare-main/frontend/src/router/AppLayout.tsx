/**
 * AppLayout.tsx — Persistent shell layout.
 *
 * Rendered once by the protected layout route. The Sidebar, SidebarProvider,
 * and SidebarInset are mounted here and NEVER remount on route changes.
 * Feature pages render into <Outlet /> inside SidebarInset.
 *
 * TopNav is also kept here so the breadcrumb always reflects the current URL.
 */

import { Outlet } from "react-router-dom";
import { Sidebar } from "../shared/layout";
import { SidebarProvider, SidebarInset } from "../shared/layout/Sidebar";
import { useAppContext } from "../contexts/AppContext";

export default function AppLayout() {
  const { currentUser, isAdmin, handleLogout } = useAppContext();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden font-sans app-shell">
        <Sidebar
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        <SidebarInset>
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
