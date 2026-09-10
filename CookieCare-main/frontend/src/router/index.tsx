/**
 * router/index.tsx — Application route tree.
 *
 * Structure:
 *   /login                  → AuthPage  (public, no layout)
 *   /                       → ProtectedRoute
 *     /                     → AppLayout  (persistent shell — sidebar never remounts)
 *       /dashboard          → DashboardHome
 *       /analyze            → InteractAnalyze
 *       /drafting           → DraftAgreement
 *       /ask-lawyer         → AskAILawyer
 *       /negotiate          → NegotiateHub
 *       /compare            → LORAAI (compare mode)
 *       /vault              → LibraryManager
 *       /queue              → QueueManager
 *       /workspace          → LORAAI (workspace mode)
 *       /cookie-scanner     → CookieScanner
 *       /dpa-reviewer       → DPAReviewer
 *       /vendor-review      → VendorReview
 *       /vulnerability-scanner → VulnerabilityScannerView
 *       /ai-ethics          → AIEthicsScore
 *       /ai-tools-inventory → AIToolsInventory
 *       /settings           → SettingsView
 *       /admin              → AdminRoute
 *         /admin            → AdminPanel
 *   *                       → redirect to /dashboard
 */

import { createBrowserRouter, Navigate } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import AdminRoute from "./AdminRoute";
import AppLayout from "./AppLayout";
import AuthPage from "../features/auth/AuthPage";

import DashboardHome from "../features/dashboard/DashboardHome";
import CookieScanner from "../features/cookieScanner";
import InteractAnalyze from "../features/analyze";
import DraftAgreement from "../features/drafting";
import AskAILawyer from "../features/askAILawyer";
import NegotiateHub from "../features/negotiate";
import QueueManager from "../features/queue";
import LibraryManager from "../features/vault";
import VulnerabilityScannerView from "../features/vulnerabilityScanner";
import DPAReviewer from "../features/dpaReviewer";
import VendorReview from "../features/vendorReview";
import AIEthicsScore from "../features/aiEthics";
import AIToolsInventory from "../features/aiToolsInventory";
import LORAAI from "../features/randtrustAI";
import SettingsView from "../features/settings";
import AdminPanel from "../features/admin";

export const router = createBrowserRouter([
  // ── Public ────────────────────────────────────────────────────────────────
  {
    path: "/login",
    element: <AuthPage />,
  },

  // ── Protected (persistent layout) ─────────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Index → dashboard
          { index: true, element: <Navigate to="/dashboard" replace /> },

          { path: "dashboard",    element: <DashboardHome /> },
          { path: "analyze",      element: <InteractAnalyze /> },
          { path: "drafting",     element: <DraftAgreement /> },
          { path: "ask-lawyer",   element: <AskAILawyer /> },
          { path: "negotiate",    element: <NegotiateHub /> },
          { path: "compare",      element: <LORAAI mode="compare" /> },
          { path: "vault",        element: <LibraryManager /> },
          { path: "queue",        element: <QueueManager /> },
          { path: "workspace",    element: <LORAAI mode="workspace" /> },
          { path: "cookie-scanner",         element: <CookieScanner /> },
          { path: "dpa-reviewer",           element: <DPAReviewer /> },
          { path: "vendor-review",          element: <VendorReview /> },
          { path: "vulnerability-scanner",  element: <VulnerabilityScannerView /> },
          { path: "ai-ethics",              element: <AIEthicsScore /> },
          { path: "ai-tools-inventory",     element: <AIToolsInventory /> },
          { path: "settings",               element: <SettingsView /> },

          // Admin — second role guard, nested so AppLayout still renders
          {
            element: <AdminRoute />,
            children: [
              { path: "admin", element: <AdminPanel /> },
            ],
          },

          // Catch-all for authenticated users
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },

  // ── Public catch-all — redirect to login (router handles auth redirect) ───
  { path: "*", element: <Navigate to="/login" replace /> },
]);
