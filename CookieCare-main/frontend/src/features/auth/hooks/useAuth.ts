import { useState } from "react";
import { AuthUser } from "../types";
import { loginUser, registerUser, googleLoginApi, AuthError } from "../api/authApi";
import { signInWithPopup } from "firebase/auth";
import { getFirebaseAuth, createGoogleProvider, isGoogleAuthConfigured } from "../../../config/firebase";

interface UseAuthOptions {
  onAuthSuccess: (token: string, user: AuthUser) => void;
}

export type AuthViewState = "form" | "pending";

export function useAuth({ onAuthSuccess }: UseAuthOptions) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /** When set to "pending", the AuthModal shows the awaiting-approval screen. */
  const [viewState, setViewState] = useState<AuthViewState>("form");

  // ── Email / password form submit ─────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const data = await loginUser(email, password);
        onAuthSuccess(data.token, data.user);
      } else {
        // Register returns { message, code } — not a token.
        await registerUser(email, password, name);
        setViewState("pending");
      }
    } catch (err: any) {
      if (err instanceof AuthError && err.code === "PENDING_APPROVAL") {
        setViewState("pending");
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Google sign-in ───────────────────────────────────────────────────────

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(getFirebaseAuth(), createGoogleProvider());
      const idToken = await result.user.getIdToken();

      const data = await googleLoginApi(idToken);
      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      // User closed the popup — not an error worth showing
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
        setGoogleLoading(false);
        return;
      }

      if (err instanceof AuthError && err.code === "PENDING_APPROVAL") {
        setViewState("pending");
      } else {
        setError(err.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Return to form from pending screen ───────────────────────────────────

  const backToForm = () => {
    setViewState("form");
    setError(null);
  };

  // ── Demo fill ────────────────────────────────────────────────────────────
  // Credentials are read from Vite env variables so they are never committed
  // to source. Set VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD in your .env.local.

  const fillQuickDemo = () => {
    const demoEmail    = import.meta.env.VITE_DEMO_EMAIL    ?? "";
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD ?? "";
    setEmail(demoEmail);
    setPassword(demoPassword);
    setName("Demo");
    setIsLogin(true);
    setViewState("form");
  };

  return {
    isLogin, setIsLogin, email, setEmail,
    password, setPassword, confirmPassword, setConfirmPassword,
    name, setName, error, loading, googleLoading, isGoogleAuthConfigured,
    viewState, handleSubmit, handleGoogleLogin, backToForm, fillQuickDemo,
  };
}
