import React from "react";
import { X, Upload, Check, AlertCircle } from "lucide-react";
import { LibraryTabId } from "../types";

interface VaultIngestModalProps {
  activeTab: LibraryTabId;
  uploadStatus: "idle" | "uploading" | "success" | "error";
  uploadError: string | null;
  uploadResultMessage: string | null;
  uploadProgressPercent: number;
  uploadProgressMessage: string | null;
  vaultContractType: string;
  vaultJurisdiction: string;
  onChangeContractType: (v: string) => void;
  onChangeJurisdiction: (v: string) => void;
  onFileSelect: (file: File) => void;
  onClose: () => void;
}

const CONTRACT_TYPES = ["NDA", "MSA", "DPA", "SLA", "SaaS Agreement", "General"];

function getIngestTitle(tab: LibraryTabId): string {
  if (tab === "rulebook") return "Upload playbook";
  if (tab === "templates") return "Upload template";
  return "Upload clause pack";
}

function getIngestHint(tab: LibraryTabId): string {
  if (tab === "rulebook") {
    return "Company-wide playbook PDF/DOCX. Structured into playbook_rules for drafting retrieval (not tied to a single contract type).";
  }
  if (tab === "templates") {
    return "Full agreement PDF/DOCX. Stored as an active contract template for baseline drafting.";
  }
  return "Clause library PDF/DOCX. Extracted into reusable vault clause items (contract type optional).";
}

function getProcessingMessage(tab: LibraryTabId): string {
  if (tab === "rulebook") return "Listed in AI Rulebook — structuring rules…";
  if (tab === "templates") return "Listed in Templates — normalizing…";
  return "Listed in Clauses — structuring…";
}

function getRowHint(tab: LibraryTabId): string {
  if (tab === "rulebook") return "You can close this — the row stays visible while AI works.";
  return "Row appears in the tab while processing continues.";
}

const inputCls =
  "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition";

export function VaultIngestModal({
  activeTab,
  uploadStatus,
  uploadError,
  uploadResultMessage,
  uploadProgressPercent,
  uploadProgressMessage,
  vaultContractType,
  vaultJurisdiction,
  onChangeContractType,
  onChangeJurisdiction,
  onFileSelect,
  onClose,
}: VaultIngestModalProps) {
  const title = getIngestTitle(activeTab);
  const hint = getIngestHint(activeTab);
  const isRulebook = activeTab === "rulebook";
  const isTemplates = activeTab === "templates";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md bg-white border border-gray-100 shadow-2xl rounded-2xl relative overflow-hidden">
        {/* Top accent */}
        <div className="h-1 w-full" style={{ background: "var(--brand-primary)" }} />

        <div className="p-6">
          <button
            onClick={onClose}
            className="absolute right-4 top-5 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="pb-4 border-b border-gray-100 mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
              Vault ingest
            </p>
            <h3 className="font-bold text-lg text-gray-900 tracking-tight">{title}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{hint}</p>
          </div>

          <div className="space-y-4">
            {/* Contract type */}
            {!isRulebook && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Contract type{" "}
                  {isTemplates ? (
                    <span className="text-red-400">*</span>
                  ) : (
                    <span className="text-gray-400 normal-case font-medium">(optional)</span>
                  )}
                </label>
                <select
                  value={vaultContractType}
                  onChange={(e) => onChangeContractType(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  {activeTab === "clauses" && <option value="">General (reusable)</option>}
                  {CONTRACT_TYPES.map((ct) => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Jurisdiction */}
            {!isRulebook && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Jurisdiction <span className="text-gray-400 normal-case font-medium">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vaultJurisdiction}
                  onChange={(e) => onChangeJurisdiction(e.target.value)}
                  placeholder="e.g. Delaware"
                  className={inputCls}
                />
              </div>
            )}

            {/* File drop zone */}
            <label className="block border-2 border-dashed border-gray-200 hover:border-blue-200 hover:bg-blue-50/20 transition-colors p-8 text-center rounded-2xl bg-gray-50 cursor-pointer">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                disabled={
                  uploadStatus === "uploading" ||
                  (isTemplates && !vaultContractType)
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSelect(file);
                }}
              />
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Drop or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, Markdown</p>
            </label>

            {/* Status feedback */}
            {uploadStatus === "uploading" && (
              <div className="space-y-2.5 text-sm bg-blue-50 border border-blue-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-blue-700 font-semibold">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{uploadProgressMessage || getProcessingMessage(activeTab)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.max(8, uploadProgressPercent)}%`,
                      background: "var(--brand-primary)",
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-blue-600/80 gap-3">
                  <span>{getRowHint(activeTab)}</span>
                  <span className="font-mono tabular-nums shrink-0 font-semibold">
                    {Math.round(uploadProgressPercent)}%
                  </span>
                </div>
              </div>
            )}
            {uploadStatus === "success" && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-medium">{uploadResultMessage || "Ingest completed."}</span>
              </div>
            )}
            {uploadStatus === "error" && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{uploadError || "Upload failed."}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2.5 pt-5 border-t border-gray-100 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl text-sm font-medium bg-white hover:bg-gray-50 transition cursor-pointer"
            >
              {uploadStatus === "uploading" ? "Close (keeps processing)" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
