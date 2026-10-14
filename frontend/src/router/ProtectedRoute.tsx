/**
 * ProtectedRoute.tsx
 *
 * Reads authToken directly from AppContext (already hydrated synchronously
 * from localStorage in the useState initialiser) so there is zero flash-of-
 * login on a hard refresh — the token is available on the very first render.
 *
 * If the user is not authenticated they are redirected to /login, and the
 * original URL is saved in location.state so we can redirect back after login.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";

export default function ProtectedRoute() {
  const { authToken } = useAppContext();
  const location = useLocation();

  if (!authToken) {
    // Pass the current path so AuthModal/login can redirect back after success
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
