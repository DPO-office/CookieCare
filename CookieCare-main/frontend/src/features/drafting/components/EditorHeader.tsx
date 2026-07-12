import React from "react";
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  Lock,
  CheckCircle2,
  Copy,
  FileDown,
  Printer,
  Save,
  Loader2,
} from "lucide-react";
import { LegalDocument } from "../../../shared/types";

interface EditorHeaderProps {
  selectedDoc: LegalDocument;
  documents: LegalDocument[];
  isSaving: boolean;
  savingMsg: string;
  isFullySigned: boolean;
  onBack: () => void;
  onSelectDoc: (doc: LegalDocument) => void;
  onCopyToClipboard: () => void;
  onExport: () => void;
  onPrint: () => void;
  onSaveClick: () => void;
  onDelete: () => void;
  onAiGenerate: () => void;
}

export default function EditorHeader({
  selectedDoc,
  documents,
  isSaving,
  savingMsg,
  isFullySigned,
  onBack,
  onSelectDoc,
  onCopyToClipboard,
  onExport,
  onPrint,
  onSaveClick,
}: EditorHeaderProps) {
  return (
    <header className="px-5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 select-none" style={{ height: "52px" }}>

      {/* Left: navigation + document identity */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-900 transition-colors group shrink-0"
          title="Back to generator"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span className="text-[12px] font-medium hidden sm:inline">Back</span>
        </button>

        <span className="w-px h-4 bg-gray-200 shrink-0" />

        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-400 shrink-0" />

          {documents.length > 1 ? (
            <div className="flex items-center gap-1 min-w-0">
              <select
                value={selectedDoc?.id || ""}
                onChange={(e) => {
                  const found = documents.find((d) => d.id === e.target.value);
                  if (found) onSelectDoc(found);
                }}
                className="bg-transparent border-none text-[13px] font-semibold text-gray-900 focus:outline-none cursor-pointer truncate max-w-[300px] py-0 leading-none"
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.title}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 pointer-events-none" />
            </div>
          ) : (
            <h1 className="text-[13px] font-semibold text-gray-900 truncate max-w-[300px]">
              {selectedDoc.title}
            </h1>
          )}

          {isFullySigned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              Sealed
            </span>
          )}
        </div>
      </div>

      {/* Right: document actions */}
      <div className="flex items-center gap-1 shrink-0">

        {isSaving ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 mr-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden sm:inline">Saving…</span>
          </span>
        ) : savingMsg ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 mr-2">
            <CheckCircle2 className="w-3 h-3" />
            <span className="hidden sm:inline">Saved</span>
          </span>
        ) : null}

        <span className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

        <button
          type="button"
          onClick={onCopyToClipboard}
          title="Copy to clipboard"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-gray-500 text-[12px] font-medium hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Copy</span>
        </button>

        <button
          type="button"
          onClick={onExport}
          title="Download as Word"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-gray-500 text-[12px] font-medium hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Word</span>
        </button>

        <button
          type="button"
          onClick={onPrint}
          title="Download as PDF"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-gray-500 text-[12px] font-medium hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">PDF</span>
        </button>

        <button
          type="button"
          onClick={onSaveClick}
          disabled={isSaving || isFullySigned}
          title={isFullySigned ? "Document is sealed" : "Save draft"}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-1 shadow-xs"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isFullySigned ? "Locked" : "Save"}</span>
        </button>

      </div>
    </header>
  );
}
