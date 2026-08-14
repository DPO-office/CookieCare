import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./shared/layout";
import { SidebarProvider, SidebarInset } from "./shared/layout/Sidebar";
import AuthModal from "./features/auth";
import AdminPanel from "./features/admin";
import DashboardHome from "./features/dashboard";
import CookieScanner from "./features/cookieScanner";
import InteractAnalyze from "./features/analyze";
import DraftAgreement from "./features/drafting";
import AskAILawyer from "./features/askAILawyer";
import NegotiateHub from "./features/negotiate";
import QueueManager from "./features/queue";
import LibraryManager from "./features/vault";
import VulnerabilityScannerView from "./features/vulnerabilityScanner";
import DPAReviewer from "./features/dpaReviewer";
import VendorReview from "./features/vendorReview";
import AIEthicsScore from "./features/aiEthics";
import AIToolsInventory from "./features/aiToolsInventory";
import LORAAI from "./features/randtrustAI";
import SettingsView from "./features/settings";
import { apiUrl } from "./config";
import { LegalDocument } from "./shared/types";

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem("lex_token"));
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string; role?: string } | null>(() => {
    const cached = localStorage.getItem("lex_user");
    return cached ? JSON.parse(cached) : null;
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    return window.location.pathname === "/demo-admin-panel" ? "admin-panel" : "dashboard";
  });
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(false);

  const [openDraftId, setOpenDraftId] = useState<string | undefined>(undefined);

  const handleOpenInDraftEditor = useCallback((doc: LegalDocument) => {
    setOpenDraftId(doc.id);
    setActiveTab("legal-draft");
  }, []);

  const handleAuthSuccess = (token: string, user: { id: string; email: string; name: string; role?: string }) => {
    localStorage.setItem("lex_token", token);
    localStorage.setItem("lex_user", JSON.stringify(user));
    setAuthToken(token);
    setCurrentUser(user);
    if (window.location.pathname === "/demo-admin-panel") {
      setActiveTab("admin-panel");
    } else {
      setActiveTab("dashboard");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("lex_token");
    localStorage.removeItem("lex_user");
    setAuthToken(null);
    setCurrentUser(null);
    setDocuments([]);
    setActiveDocument(null);
    setActiveTab("dashboard");
  };

  const fetchDocuments = async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/documents"), {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to load documents ledger. Status: ${res.status}. Response: ${text.substring(0, 500)}`);
        if (res.status === 401 || res.status === 403) handleLogout();
        return;
      }
      const data = await res.json();
      setDocuments(data);
      if (data.length > 0) {
        if (!activeDocument) {
          setActiveDocument(data[0]);
        } else {
          const freshActive = data.find((d: LegalDocument) => d.id === activeDocument.id);
          if (freshActive) setActiveDocument(freshActive);
        }
      }
    } catch (err) {
      console.error("Failed to load documents ledger", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, [authToken]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/demo-admin-panel") {
        setActiveTab("admin-panel");
      } else {
        setActiveTab("dashboard");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (!authToken || !currentUser) {
    return <AuthModal onAuthSuccess={handleAuthSuccess} />;
  }

  const isAdmin = currentUser.role === "ADMIN";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden font-sans app-shell">

        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        <SidebarInset>
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {activeTab === "dashboard" && (
          <DashboardHome
            userName={currentUser.name}
            setActiveTab={setActiveTab}
            documents={documents}
            authToken={authToken}
          />
        )}

        {activeTab === "cookie-scanner" && (
          <CookieScanner authToken={authToken} />
        )}

        {activeTab === "legal-review" && (
          <InteractAnalyze
            documents={documents}
            activeDocument={activeDocument}
            authToken={authToken}
            onRefresh={fetchDocuments}
            onSelectDocument={setActiveDocument}
          />
        )}

        {activeTab === "legal-compare" && (
          <LORAAI
            authToken={authToken}
            user={currentUser}
            mode="compare"
          />
        )}

        {activeTab === "legal-draft" && (
          <DraftAgreement
            documents={documents}
            authToken={authToken}
            onRefresh={fetchDocuments}
            onSelectDocument={setActiveDocument}
            initialDocumentId={openDraftId}
          />
        )}

        {activeTab === "legal-ask-ai" && (
          <AskAILawyer
            authToken={authToken}
            documents={documents}
          />
        )}

        {activeTab === "legal-negotiate" && (
          <NegotiateHub
            documents={documents}
            activeDocument={activeDocument}
            authToken={authToken}
            onRefresh={fetchDocuments}
            onSelectDocument={setActiveDocument}
          />
        )}

        {activeTab === "legal-queue" && (
          <QueueManager />
        )}

        {activeTab === "legal-vault" && (
          <LibraryManager
            authToken={authToken}
            onRefresh={fetchDocuments}
            onOpenInDraftEditor={handleOpenInDraftEditor}
          />
        )}

        {activeTab === "dpa-reviewer" && (
          <DPAReviewer authToken={authToken} />
        )}

        {activeTab === "vendor-review" && (
          <VendorReview authToken={authToken} />
        )}

        {activeTab === "ai-ethics" && (
          <AIEthicsScore authToken={authToken} />
        )}

        {activeTab === "ai-tools-inventory" && (
          <AIToolsInventory authToken={authToken} />
        )}

        {activeTab === "vulnerability-scanner" && (
          <VulnerabilityScannerView authToken={authToken} />
        )}

        {activeTab === "admin-panel" && currentUser.role === "ADMIN" && (
          <AdminPanel authToken={authToken} />
        )}

        {activeTab === "LORA-ai" && (
          <LORAAI
            authToken={authToken}
            user={currentUser}
            mode="workspace"
            onNavigateToCompare={() => setActiveTab("legal-compare")}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView user={currentUser} />
        )}
          </main>
        </SidebarInset>

      </div>
    </SidebarProvider>
  );
}
