import React, { useState } from "react";
import { X, Upload, Check, AlertCircle } from "lucide-react";
import { LibraryTabId, LibraryItemSource } from "../types";

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
  /**
   * Called when a file is selected with the chosen source value.
   * The modal owns the scope state internally; the parent only receives the
   * final value at upload time.
   */
  onFileSelect: (file: File, source: LibraryItemSource) => void;
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

function getTabLabel(tab: LibraryTabId): string {
  if (tab === "rulebook") return "AI Rulebook";
  if (tab === "templates") return "Templates";
  return "Clauses";
}

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
  // The modal owns its own scope state so it doesn't depend on page-level state.
  // Defaults to 'private' every time the modal opens (reset happens via key prop
  // or when parent closes/reopens the modal).
  const [scope, setScope] = useState<LibraryItemSource>("private");

  const title = getIngestTitle(activeTab);
  const hint = getIngestHint(activeTab);
  const isRulebook = activeTab === "rulebook";
  const isTemplates = activeTab === "templates";

  return (
    <div className="vlt-overlay">
      <div className="vlt-modal" style={{ maxWidth: 480 }}>
        {/* Top gradient accent */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, #E4E4E7, transparent)",
          }}
        />

        <div style={{ padding: "24px 24px 24px" }}>
          {/* Close */}
          <button
            onClick={onClose}
            className="vlt-icon-btn"
            style={{ position: "absolute", right: 16, top: 16 }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>

          {/* Header */}
          <div
            style={{
              paddingBottom: 18,
              borderBottom: "1px solid var(--border-light)",
              marginBottom: 20,
            }}
          >
            <p className="vlt-overline" style={{ marginBottom: 5 }}>{getTabLabel(activeTab)}</p>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
                lineHeight: 1.15,
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-muted)",
                marginTop: 5,
                lineHeight: 1.55,
              }}
            >
              {hint}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Who can access this? — Templates, Clauses and AI Rulebook ── */}
            {(isTemplates || isRulebook || activeTab === "clauses") && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Who can access this?
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["private", "org"] as const).map((opt) => {
                    const isSelected = scope === opt;
                    const labelText =
                      opt === "private" ? "My Private Space" : "My organisation";
                    return (
                      <label
                        key={opt}
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "9px 12px",
                          borderRadius: 12,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? "#111827" : "#667085",
                          border: `1.5px solid ${isSelected ? "#4F5BD9" : "rgba(16,24,40,0.10)"}`,
                          background: isSelected ? "#F5F6FF" : "#FAFAFA",
                          transition:
                            "border-color 160ms ease, background 160ms ease, color 160ms ease",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="radio"
                          name="vaultIngestScope"
                          value={opt}
                          checked={isSelected}
                          onChange={() => setScope(opt)}
                          style={{
                            accentColor: "#4F5BD9",
                            width: 15,
                            height: 15,
                            flexShrink: 0,
                            cursor: "pointer",
                          }}
                        />
                        {labelText}
                      </label>
                    );
                  })}
                </div>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    marginTop: 7,
                    lineHeight: 1.5,
                  }}
                >
                  {scope === "org"
                    ? "Items are stored centrally for your organisation. Access is granted by team or organisation membership and each member's read / write / admin role — never tied to a single person."
                    : "Items stored in your private space are only visible to you."}
                </p>
              </div>
            )}

            {/* Contract type */}
            {!isRulebook && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Contract type{" "}
                  {isTemplates ? (
                    <span style={{ color: "rgba(239,68,68,0.75)" }}>*</span>
                  ) : (
                    <span
                      style={{
                        color: "var(--text-faint)",
                        textTransform: "none",
                        fontWeight: 400,
                        letterSpacing: 0,
                      }}
                    >
                      (optional)
                    </span>
                  )}
                </label>
                <select
                  value={vaultContractType}
                  onChange={(e) => onChangeContractType(e.target.value)}
                  className="vlt-input"
                  style={{ cursor: "pointer" }}
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
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Jurisdiction{" "}
                  <span
                    style={{
                      color: "var(--text-faint)",
                      textTransform: "none",
                      fontWeight: 400,
                      letterSpacing: 0,
                    }}
                  >
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={vaultJurisdiction}
                  onChange={(e) => onChangeJurisdiction(e.target.value)}
                  placeholder="e.g. Delaware"
                  className="vlt-input"
                />
              </div>
            )}

            {/* Drop zone */}
            <label className="vlt-dropzone" style={{ display: "block" }}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                style={{ display: "none" }}
                disabled={
                  uploadStatus === "uploading" || (isTemplates && !vaultContractType)
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSelect(file, scope);
                }}
              />
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: "rgba(16,24,40,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <Upload style={{ width: 18, height: 18, color: "var(--text-faint)" }} />
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Drop or click to upload
              </p>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>PDF, DOCX, TXT, Markdown</p>
            </label>

            {/* Status: uploading */}
            {uploadStatus === "uploading" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13,
                  background: "rgba(33,117,217,0.05)",
                  border: "1px solid rgba(33,117,217,0.12)",
                  borderRadius: 16,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid var(--accent)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.75s linear infinite",
                      flexShrink: 0,
                    }}
                  />
                  <span>{uploadProgressMessage || getProcessingMessage(activeTab)}</span>
                </div>
                <div className="vlt-progress-track">
                  <div
                    className="vlt-progress-fill"
                    style={{ width: `${Math.max(8, uploadProgressPercent)}%` }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "rgba(33,117,217,0.65)",
                    gap: 12,
                  }}
                >
                  <span>{getRowHint(activeTab)}</span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {Math.round(uploadProgressPercent)}%
                  </span>
                </div>
              </div>
            )}

            {/* Status: success */}
            {uploadStatus === "success" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#047857",
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.18)",
                  borderRadius: 14,
                  padding: "10px 14px",
                }}
              >
                <Check style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
                <span>{uploadResultMessage || "Ingest completed."}</span>
              </div>
            )}

            {/* Status: error */}
            {uploadStatus === "error" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#DC2626",
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.16)",
                  borderRadius: 14,
                  padding: "10px 14px",
                }}
              >
                <AlertCircle style={{ width: 14, height: 14, color: "#EF4444", flexShrink: 0 }} />
                <span>{uploadError || "Upload failed."}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              paddingTop: 20,
              marginTop: 20,
              borderTop: "1px solid var(--border-light)",
            }}
          >
            <button type="button" onClick={onClose} className="vlt-btn-ghost">
              {uploadStatus === "uploading" ? "Close (keeps processing)" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
