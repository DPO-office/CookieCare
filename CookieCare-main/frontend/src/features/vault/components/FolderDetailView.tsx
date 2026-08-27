import React from "react";
import { X, Folder, Upload, AlertCircle, FileText, Trash2 } from "lucide-react";
import { LibraryItem } from "../types";

interface FolderDetailViewProps {
  folder: LibraryItem;
  onClose: () => void;
  onAddFiles: (folderId: string) => void;
  onDeleteFile: (folderId: string, fileId: string) => void;
  /** Returns true if the folder was actually deleted, false if cancelled or failed. */
  onDeleteFolder: (id: string, e: React.MouseEvent) => Promise<boolean>;
}

export function FolderDetailView({
  folder,
  onClose,
  onAddFiles,
  onDeleteFile,
  onDeleteFolder,
}: FolderDetailViewProps) {
  return (
    <div className="vlt-overlay">
      <div className="vlt-modal" style={{ maxWidth: 640 }}>
        {/* Top gradient accent */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, #E4E4E7, transparent)",
          }}
        />

        <div style={{ padding: "24px 24px 24px" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              paddingBottom: 18,
              borderBottom: "1px solid var(--border-light)",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Folder style={{ width: 18, height: 18, color: "#F59E0B" }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="vlt-overline" style={{ marginBottom: 3 }}>Folder</p>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {folder.name}
              </h3>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--text-faint)",
                  marginTop: 2,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                }}
              >
                {folder.id} · By {folder.createdBy}
              </p>
            </div>
            {/* Actions — Add files + Close, side by side, no overlap */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => onAddFiles(folder.id)}
                className="vlt-btn-primary"
              >
                <Upload style={{ width: 13, height: 13 }} />
                Add files
              </button>
              <button
                onClick={onClose}
                className="vlt-icon-btn"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Files section label */}
          <div style={{ marginBottom: 10 }}>
            <p className="vlt-overline">
              Files{" "}
              <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>
                ({folder.fileList?.length || 0})
              </span>
            </p>
          </div>

          {/* File list or empty state */}
          {!folder.fileList || folder.fileList.length === 0 ? (
            <div
              style={{
                borderRadius: 20,
                background: "#F7F8FB",
                boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.06)",
                padding: "40px 24px",
                textAlign: "center",
              }}
            >
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
                <AlertCircle style={{ width: 18, height: 18, color: "#C0C8D8" }} />
              </div>
              <p
                style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}
              >
                No files yet
              </p>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
                Use the button above to upload files.
              </p>
            </div>
          ) : (
            <div
              style={{
                maxHeight: 272,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                borderRadius: 20,
                background: "#F7F8FB",
                boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.06)",
                padding: "10px",
              }}
            >
              {folder.fileList.map((file, idx) => (
                <div
                  key={file.id ?? idx}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: 14,
                    boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "box-shadow 130ms ease",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: "rgba(33,117,217,0.07)",
                        border: "1px solid rgba(33,117,217,0.14)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <FileText style={{ width: 15, height: 15, color: "var(--accent)" }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {file.name}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--text-faint)",
                          marginTop: 1,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {file.size} · {file.type}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span className="vlt-status-synced">Synced</span>
                    <button
                      title={file.id ? "Delete file" : "Cannot delete — file ID unavailable"}
                      disabled={!file.id}
                      onClick={() => {
                        if (file.id) onDeleteFile(folder.id, file.id);
                      }}
                      className="vlt-icon-btn danger"
                      style={!file.id ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 18,
              borderTop: "1px solid var(--border-light)",
              marginTop: 20,
            }}
          >
            <button
              onClick={async (e) => {
                const deleted = await onDeleteFolder(folder.id, e);
                if (deleted) onClose();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                color: "#EF4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "color 150ms ease",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#DC2626")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#EF4444")}
            >
              <Trash2 style={{ width: 13, height: 13 }} />
              Delete folder
            </button>
            <button onClick={onClose} className="vlt-btn-ghost">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
