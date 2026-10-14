/**
 * AdminRoute.tsx
 *
 * Second-level guard. Allows access only when the authenticated user has the
 * ADMIN role. Non-admins are redirected silently to /dashboard.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";

export default function AdminRoute() {
  const { isAdmin } = useAppContext();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
