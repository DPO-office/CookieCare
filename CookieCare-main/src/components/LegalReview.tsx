import React, { useState, useCallback } from "react";
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
  onSelectDocument,
}: LegalReviewProps) {
  const [subTab, setSubTab] = useState<"analyze" | "draft" | "negotiate" | "ask" | "queue" | "library">("analyze");

  // Tracks which draft to pre-open in the editor when navigating from Vault → Draft Templates
  const [openDraftId, setOpenDraftId] = useState<string | undefined>(undefined);

  const handleOpenInDraftEditor = useCallback((doc: LegalDocument) => {
    setOpenDraftId(doc.id);
    setSubTab("draft");
  }, []);

  const tabsInfo = [
    { id: "analyze"  as const, label: "Analyze Agreement",  desc: "Clarity risk audits & compliance gaps breakdown",        icon: SearchCode   },
    { id: "draft"    as const, label: "Draft Templates",     desc: "Craft terms using system smart templates",               icon: FileEdit     },
    { id: "negotiate"as const, label: "Negotiate Redlines",  desc: "Track proposals, version histories & audit logs",        icon: BalanceIcon  },
    { id: "ask"      as const, label: "Consult AI Lawyer",   desc: "Immediate advisory answering compliance queries",        icon: MessageSquare},
    { id: "queue"    as const, label: "Active Queue",        desc: "Monitor automated generation pipeline jobs",             icon: Clock        },
    { id: "library"  as const, label: "Vault Repository",    desc: "Encrypted store for cloud legal documents",              icon: FolderLock   },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">

      {/* NAVIGATION HEADER */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 shrink-0">
        <div className="mb-5">
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Legal Review Suite</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Smart contract analysis, drafting, and negotiation workflows.</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tabsInfo.map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`legal-subtab-${tab.id}`}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium transition-all rounded-xl cursor-pointer ${
                  isActive
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
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
            initialDocumentId={openDraftId}
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
            onOpenInDraftEditor={handleOpenInDraftEditor}
          />
        )}
      </div>

    </div>
  );
}
