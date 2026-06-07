import React, { useState } from "react";
import { SearchCode, FileEdit, Scale, MessageSquare, FolderLock, Clock, Scale as BalanceIcon } from "lucide-react";
import DraftAgreement from "./DraftAgreement";
import InteractAnalyze from "./InteractAnalyze";
import NegotiateHub from "./NegotiateHub";
import AskAILawyer from "./AskAILawyer";
import QueueManager from "./QueueManager";
import LibraryManager from "./LibraryManager";
import { LegalDocument } from "../types";

interface LegalReviewProps {
  documents: LegalDocument[];
  activeDocument: LegalDocument | null;
  authToken: string;
  onRefresh: () => Promise<void>;
  onSelectDocument: (doc: LegalDocument | null) => void;
}

export default function LegalReview({
  documents,
  activeDocument,
  authToken,
  onRefresh,
  onSelectDocument
}: LegalReviewProps) {
  const [subTab, setSubTab] = useState<"analyze" | "draft" | "negotiate" | "ask" | "queue" | "library">("analyze");

  const tabsInfo = [
    { id: "analyze" as const, label: "Analyze Agreement", desc: "Clarity risk audits & compliance gaps breakdown", icon: SearchCode },
    { id: "draft" as const, label: "Draft Templates", desc: "Craft terms using system smart templates", icon: FileEdit },
    { id: "negotiate" as const, label: "Negotiate Redlines", desc: "Track proposals, version histories & audit logs", icon: BalanceIcon },
    { id: "ask" as const, label: "Consult AI Lawyer", desc: "Immediate advisory answering compliance queries", icon: MessageSquare },
    { id: "queue" as const, label: "Active Queue", desc: "Monitor automated generation pipeline jobs", icon: Clock },
    { id: "library" as const, label: "Vault Repository", desc: "Encrypted store for cloud legal documents", icon: FolderLock }
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      
      {/* TWO-TIER NAVIGATION HEADER */}
      <div className="bg-white border-b border-gray-200 px-10 py-5 shrink-0">
        <div className="mb-4">
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Legal Review Suite</h1>
          <p className="text-xs text-gray-500 font-mono tracking-wider uppercase mt-0.5">Integrate smart parameters, liability buffers & policy terms</p>
        </div>

        {/* Tab Selection Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {tabsInfo.map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`legal-subtab-${tab.id}`}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center space-x-2 px-4.5 py-2.5 text-xs font-semibold tracking-tight transition-all border rounded-none uppercase font-mono cursor-pointer ${
                  isActive
                    ? "bg-black text-white border-black font-extrabold shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RENDER DYNAMIC ACTIVE SUB MODULE CANVAS */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {subTab === "analyze" && (
          <InteractAnalyze
            documents={documents}
            activeDocument={activeDocument}
            authToken={authToken}
            onRefresh={onRefresh}
            onSelectDocument={onSelectDocument}
          />
        )}

        {subTab === "draft" && (
          <DraftAgreement
            documents={documents}
            authToken={authToken}
            onRefresh={onRefresh}
            onSelectDocument={onSelectDocument}
          />
        )}

        {subTab === "negotiate" && (
          <NegotiateHub
            documents={documents}
            activeDocument={activeDocument}
            authToken={authToken}
            onRefresh={onRefresh}
            onSelectDocument={onSelectDocument}
          />
        )}

        {subTab === "ask" && (
          <AskAILawyer
            documents={documents}
            authToken={authToken}
          />
        )}

        {subTab === "queue" && (
          <QueueManager />
        )}

        {subTab === "library" && (
          <LibraryManager
            documents={documents}
            authToken={authToken}
            onRefresh={onRefresh}
          />
        )}
      </div>

    </div>
  );
}
