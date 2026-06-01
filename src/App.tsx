import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import AuthModal from "./components/AuthModal";
import AdminPanel from "./components/AdminPanel";
import DashboardHome from "./components/DashboardHome";
import CookieScanner from "./components/CookieScanner";
import LegalReview from "./components/LegalReview";
import VulnerabilityScanner from "./components/VulnerabilityScanner";
import SettingsView from "./components/Settings";
import { apiUrl } from "./config";
import { LegalDocument } from "./types";
import { ShieldCheck, LogIn, Lock } from "lucide-react";

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

  // Sync session authentication
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

  // Fetch documents for logged-in sessions
  const fetchDocuments = async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/documents"), {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to load documents ledger. Status: ${res.status}. Response: ${text.substring(0, 500)}`);
        if (res.status === 401 || res.status === 403) {
          handleLogout();
        }
        return;
      }
      const data = await res.json();
      setDocuments(data);
      // Sync active document selection
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

  useEffect(() => {
    fetchDocuments();
  }, [authToken]);

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

  // Calculate quick metrics for dashboard cards
  const totalDocsCount = documents.length;
  const pendingSigsCount = documents.reduce((sum, doc) => {
    const isSigned = doc.signatures && doc.signatures.length > 0 && doc.signatures.every(s => s.status === "signed");
    return sum + (isSigned ? 0 : (doc.signatures?.length || 0));
  }, 0);
  const redlinesPendingCount = documents.reduce((sum, doc) => {
    return sum + (doc.redlines?.filter(r => r.status === "pending").length || 0);
  }, 0);

  const stats = {
    totalDocs: totalDocsCount,
    pendingSigs: pendingSigsCount,
    redlinesPending: redlinesPendingCount
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-gray-50">
      
      {/* 1. LEFT SIDE NAVIGATION */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={currentUser} 
        onLogout={handleLogout} 
      />

      {/* 2. MAIN HUB INTERACTION PANE */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {activeTab === "dashboard" && (
          <DashboardHome 
            userName={currentUser.name} 
            setActiveTab={setActiveTab} 
            stats={stats}
            documents={documents}
          />
        )}

        {activeTab === "cookie-scanner" && (
          <CookieScanner 
            authToken={authToken}
          />
        )}

        {activeTab === "legal-review" && (
          <LegalReview 
            documents={documents}
            activeDocument={activeDocument}
            authToken={authToken}
            onRefresh={fetchDocuments}
            onSelectDocument={setActiveDocument}
          />
        )}

        {activeTab === "vulnerability-scanner" && (
          <VulnerabilityScanner 
            authToken={authToken}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView 
            user={currentUser}
          />
        )}

        {activeTab === "admin-panel" && currentUser.role === "ADMIN" && (
          <AdminPanel
            authToken={authToken}
          />
        )}
      </main>

      {/* 3. HIDDEN ADMIN DOT */}
      <footer className="fixed bottom-2 right-2 opacity-0 hover:opacity-100 transition-opacity">
        <button
          onClick={() => {
            window.history.pushState({}, "", "/demo-admin-panel");
            setActiveTab("admin-panel");
          }}
          className="w-1 h-1 bg-gray-300 rounded-full cursor-default"
          title="Admin Access"
        />
      </footer>

    </div>
  );
}
