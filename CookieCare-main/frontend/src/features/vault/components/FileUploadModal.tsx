import React, { useState, useRef, useEffect } from "react";
import { X, Upload, FileText, FolderOpen, Check, XCircle, AlertCircle, ChevronDown, Folder } from "lucide-react";
import { LibraryItem, VaultPendingUpload } from "../types";
import { VAULT_UPLOAD_ACCEPT } from "../constants";

interface FileUploadModalProps {
  uploadStatus: "idle" | "uploading" | "success" | "error";
  uploadError: string | null;
  uploadResultMessage: string | null;
  uploadProgressPercent: number;
  uploadProgressMessage: string | null;
  pendingVaultFiles: VaultPendingUpload[];
  vaultBatchError: string | null;
  suggestedVaultFolderName: string;
  formFolderTarget: string;
  folders: LibraryItem[];
  onChangeFolderTarget: (id: string) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

function formatUploadSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Label({ text }: { text: string }) {
  return (
    <label
      style={{
        display: "block", fontSize: 10.5, fontWeight: 600,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 7,
      }}
    >
      {text}
    </label>
  );
}

function FolderDropdown({
  value,
  folders,
  disabled,
  onChange,
}: {
  value: string;
  folders: LibraryItem[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = folders.find((f) => f.id === value);
  const label = selected
    ? `${selected.name} (${selected.fileList?.length || 0} files)`
    : "Select a folder…";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#FFFFFF",
          border: "none",
          borderRadius: 14,
          padding: "10px 14px",
          fontSize: 13.5,
          fontWeight: value ? 500 : 400,
          color: value ? "var(--text-primary)" : "var(--text-faint)",
          boxShadow: open
            ? "0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08)"
            : "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "box-shadow 180ms ease",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        {value && (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Folder style={{ width: 12, height: 12, color: "#F59E0B" }} />
          </div>
        )}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <ChevronDown
          style={{
            width: 14,
            height: 14,
            color: "var(--text-muted)",
            flexShrink: 0,
            transition: "transform 180ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 60,
            background: "#FFFFFF",
            borderRadius: 16,
            boxShadow: "0 4px 6px rgba(16,24,40,0.04), 0 12px 32px rgba(16,24,40,0.10), 0 0 0 1px rgba(16,24,40,0.07)",
            overflow: "hidden",
            animation: "vlt-rise 0.18s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {folders.length === 0 ? (
            <div
              style={{
                padding: "16px 16px",
                fontSize: 13,
                color: "var(--text-faint)",
                textAlign: "center",
              }}
            >
              No folders yet
            </div>
          ) : (
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {folders.map((fld) => {
                const isActive = fld.id === value;
                return (
                  <button
                    key={fld.id}
                    type="button"
                    onClick={() => {
                      onChange(fld.id);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "none",
                      background: isActive ? "#EEF2FF" : "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = "#F7F8FB";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: isActive ? "rgba(79,91,217,0.10)" : "rgba(251,191,36,0.08)",
                        border: `1px solid ${isActive ? "rgba(79,91,217,0.18)" : "rgba(251,191,36,0.18)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Folder
                        style={{
                          width: 13,
                          height: 13,
                          color: isActive ? "var(--accent)" : "#F59E0B",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? "var(--accent)" : "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {fld.name}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: isActive ? "rgba(79,91,217,0.55)" : "var(--text-faint)",
                          marginTop: 1,
                        }}
                      >
                        {fld.fileList?.length || 0} files
                      </p>
                    </div>
                    {isActive && (
                      <Check
                        style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileUploadModal({
  uploadStatus,
  uploadError,
  uploadResultMessage,
  uploadProgressPercent,
  uploadProgressMessage,
  pendingVaultFiles,
  vaultBatchError,
  suggestedVaultFolderName,
  formFolderTarget,
  folders,
  onChangeFolderTarget,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onSubmit,
  onClose,
}: FileUploadModalProps) {
  const pendingCount = pendingVaultFiles.filter(
    (f) => f.status === "pending" || f.status === "error"
  ).length;

  return (
    <div className="vlt-overlay">
      <div className="vlt-modal" style={{ maxWidth: 520 }}>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #E4E4E7, transparent)" }} />

        <div style={{ padding: "24px" }}>
          <button
            disabled={uploadStatus === "uploading"}
            onClick={onClose}
            className="vlt-icon-btn"
            style={{ position: "absolute", right: 16, top: 16 }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>

          {/* Header */}
          <div style={{ paddingBottom: 18, borderBottom: "1px solid var(--border-light)", marginBottom: 20 }}>
            <p className="vlt-overline" style={{ marginBottom: 5 }}>Vault</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
              Upload documents
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.55 }}>
              Add multiple documents or a whole folder to the vault.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Folder target */}
            {suggestedVaultFolderName ? (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  border: "1px solid rgba(251,191,36,0.18)",
                  background: "rgba(251,191,36,0.06)",
                  borderRadius: 14, padding: "10px 14px",
                }}
              >
                <FolderOpen style={{ width: 15, height: 15, color: "rgba(251,191,36,0.70)", flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 11, color: "rgba(251,191,36,0.55)", fontWeight: 500, marginBottom: 1 }}>
                    Root folder will be created automatically
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(251,191,36,0.85)", letterSpacing: "-0.01em" }}>
                    {suggestedVaultFolderName}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Label text="Target folder" />
                <FolderDropdown
                  value={formFolderTarget}
                  folders={folders}
                  disabled={uploadStatus === "uploading"}
                  onChange={onChangeFolderTarget}
                />
              </div>
            )}

            {/* Drop zone */}
            <div
              className="vlt-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploadStatus !== "uploading" && e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files);
              }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <Upload style={{ width: 17, height: 17, color: "var(--text-muted)" }} />
              </div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Drop documents here
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                PDF, DOCX, DOC, TXT, MD, CSV, JSON · 25 MB each
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
                <label className="vlt-btn-ghost" style={{ cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 9 }}>
                  <FileText style={{ width: 12, height: 12 }} />
                  Browse files
                  <input type="file" accept={VAULT_UPLOAD_ACCEPT} multiple className="hidden" disabled={uploadStatus === "uploading"} onChange={(e) => { if (e.target.files) onAddFiles(e.target.files); e.target.value = ""; }} />
                </label>
                <label className="vlt-btn-ghost" style={{ cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 9 }}>
                  <FolderOpen style={{ width: 12, height: 12 }} />
                  Upload folder
                  <input type="file" accept={VAULT_UPLOAD_ACCEPT} className="hidden" disabled={uploadStatus === "uploading"} {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => { if (e.target.files) { onAddFiles(e.target.files); onChangeFolderTarget("__uploaded_folder__"); } e.target.value = ""; }} />
                </label>
              </div>
            </div>

            {/* Batch error */}
            {vaultBatchError && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "10px 12px" }}>
                <AlertCircle style={{ width: 14, height: 14, color: "rgba(251,191,36,0.65)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12.5, color: "rgba(251,191,36,0.75)", lineHeight: 1.55 }}>{vaultBatchError}</span>
              </div>
            )}

            {/* File queue */}
            {pendingVaultFiles.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    {pendingVaultFiles.length} selected
                  </span>
                  {uploadStatus !== "uploading" && (
                    <button onClick={onClearFiles} style={{ fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
                      Clear all
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {pendingVaultFiles.map((item) => {
                    const isDone = item.status === "done";
                    const isErr = item.status === "error";
                    const isBusy = item.status === "uploading" || item.status === "processing";
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          border: `1px solid ${isDone ? "rgba(16,185,129,0.25)" : isErr ? "rgba(239,68,68,0.25)" : isBusy ? "var(--border)" : "var(--border-light)"}`,
                          background: isDone ? "rgba(16,185,129,0.06)" : isErr ? "rgba(239,68,68,0.06)" : isBusy ? "var(--surface-hover)" : "#FFFFFF",
                          borderRadius: 10, padding: "7px 10px",
                        }}
                      >
                        {isDone
                          ? <Check style={{ width: 12, height: 12, color: "rgba(16,185,129,0.85)", flexShrink: 0 }} />
                          : isErr
                          ? <XCircle style={{ width: 12, height: 12, color: "rgba(239,68,68,0.75)", flexShrink: 0 }} />
                          : isBusy
                          ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid var(--ink)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                          : <FileText style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />}
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }} title={item.relativePath || item.file.name}>
                          {item.relativePath || item.file.name}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>
                          {formatUploadSize(item.file.size)}
                        </span>
                        {uploadStatus !== "uploading" && !isDone && (
                          <button onClick={() => onRemoveFile(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", lineHeight: 0 }}>
                            <XCircle style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status */}
            {uploadStatus === "uploading" && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--ink)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{uploadProgressMessage || "Uploading and indexing documents…"}</span>
                </div>
                <div className="vlt-progress-track">
                  <div className="vlt-progress-fill" style={{ width: `${uploadProgressPercent}%` }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {Math.round(uploadProgressPercent)}%
                </div>
              </div>
            )}
            {uploadStatus === "success" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 12, padding: "10px 14px" }}>
                <Check style={{ width: 14, height: 14, color: "rgba(16,185,129,0.80)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(16,185,129,0.80)" }}>{uploadResultMessage || "File uploaded and parsed successfully!"}</span>
              </div>
            )}
            {uploadStatus === "error" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.14)", borderRadius: 12, padding: "10px 14px" }}>
                <AlertCircle style={{ width: 14, height: 14, color: "rgba(239,68,68,0.75)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "rgba(239,68,68,0.75)" }}>{uploadError || "Upload failed."}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 20, marginTop: 20, borderTop: "1px solid var(--border-light)" }}>
            <button type="button" disabled={uploadStatus === "uploading"} onClick={onClose} className="vlt-btn-ghost">Cancel</button>
            <button
              type="button"
              disabled={uploadStatus === "uploading" || pendingCount === 0 || (!formFolderTarget && !suggestedVaultFolderName)}
              onClick={onSubmit}
              className="vlt-btn-primary"
            >
              {uploadStatus === "uploading" ? "Uploading…" : `Upload ${pendingCount} file${pendingCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
