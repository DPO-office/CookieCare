/**
 * AuthPage.tsx
 *
 * Public route wrapper for AuthModal. After successful login, navigates to the
 * page the user originally tried to reach (saved in location.state.from by
 * ProtectedRoute), or falls back to /dashboard.
 *
 * If the user is already logged-in and somehow lands on /login, they are
 * redirected immediately to /dashboard.
 */

import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AuthModal from "./AuthModal";
import { useAppContext } from "../../contexts/AppContext";
import type { AppUser } from "../../contexts/AppContext";

export default function AuthPage() {
  const { authToken, handleAuthSuccess } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  // Already authenticated — skip the login screen
  if (authToken) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    return <Navigate to={from ?? "/dashboard"} replace />;
  }

  const onAuthSuccess = (token: string, user: AppUser) => {
    handleAuthSuccess(token, user);
    // Navigate to the originally requested URL (or dashboard)
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    navigate(from ?? "/dashboard", { replace: true });
  };

  return <AuthModal onAuthSuccess={onAuthSuccess} />;
}
