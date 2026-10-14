/**
 * AppContext.tsx — Global application state mounted above the router.
 *
 * Lives outside <RouterProvider> so authToken, currentUser, documents, and
 * activeDocument survive every route transition without re-fetching.
 *
 * Consumers call useAppContext() anywhere in the tree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiUrl } from "../config";
import type { LegalDocument } from "../shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface AppContextValue {
  // Auth
  authToken: string | null;
  currentUser: AppUser | null;
  isAdmin: boolean;
  handleAuthSuccess: (token: string, user: AppUser) => void;
  handleLogout: () => void;

  // Documents
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  setActiveDocument: (doc: LegalDocument | null) => void;
  fetchDocuments: () => Promise<void>;

  // Cross-feature navigation state (replaces openDraftId prop-drilling)
  openDraftId: string | undefined;
  setOpenDraftId: (id: string | undefined) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // ── Auth state (hydrated synchronously from localStorage) ─────────────────
  const [authToken, setAuthToken] = useState<string | null>(
    () => localStorage.getItem("lex_token")
  );
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const cached = localStorage.getItem("lex_user");
    try {
      return cached ? (JSON.parse(cached) as AppUser) : null;
    } catch {
      return null;
    }
  });

  // ── Document state ─────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<LegalDocument | null>(null);

  // ── Cross-feature navigation state ────────────────────────────────────────
  const [openDraftId, setOpenDraftId] = useState<string | undefined>(undefined);

  // ── Auth handlers ──────────────────────────────────────────────────────────

  const handleAuthSuccess = useCallback((token: string, user: AppUser) => {
    localStorage.setItem("lex_token", token);
    localStorage.setItem("lex_user", JSON.stringify(user));
    setAuthToken(token);
    setCurrentUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("lex_token");
    localStorage.removeItem("lex_user");
    setAuthToken(null);
    setCurrentUser(null);
    setDocuments([]);
    setActiveDocument(null);
    setOpenDraftId(undefined);
    // ProtectedRoute watches authToken and redirects to /login automatically.
  }, []);

  // ── Document fetching ──────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl("/api/documents"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          handleLogout();
        }
        return;
      }
      const json = await res.json();
      // The /api/documents endpoint returns a paginated envelope: { data: LegalDocument[], pagination: {...} }
      // Fall back to treating the response itself as an array for backwards compatibility.
      const data: LegalDocument[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      setDocuments(data);
      // Keep activeDocument reference fresh
      setActiveDocument((prev) => {
        if (!prev) return data[0] ?? null;
        return data.find((d) => d.id === prev.id) ?? prev;
      });
    } catch (err) {
      console.error("[AppContext] fetchDocuments failed:", err);
    }
  }, [authToken, handleLogout]);

  // Fetch once when authToken becomes available (login or page refresh)
  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  // ── Context value ──────────────────────────────────────────────────────────

  const value: AppContextValue = {
    authToken,
    currentUser,
    isAdmin: currentUser?.role === "ADMIN",
    handleAuthSuccess,
    handleLogout,
    documents,
    activeDocument,
    setActiveDocument,
    fetchDocuments,
    openDraftId,
    setOpenDraftId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>");
  }
  return ctx;
}
