import React from "react";
import { X, FileCode, Globe, Trash2 } from "lucide-react";
import { LibraryItem, LibraryTabId } from "../types";
import { TagChips } from "./TagChips";

interface ItemDetailViewProps {
  item: LibraryItem;
  onClose: () => void;
  /** Returns true if the item was actually deleted, false if cancelled or failed. */
  onDelete: (id: string, type: LibraryTabId, e: React.MouseEvent) => Promise<boolean>;
}

export function ItemDetailView({ item, onClose, onDelete }: ItemDetailViewProps) {
  return (
    <div className="vlt-overlay">
      <div className="vlt-modal" style={{ maxWidth: 520 }}>
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
                background: "rgba(33,117,217,0.07)",
                border: "1px solid rgba(33,117,217,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileCode style={{ width: 18, height: 18, color: "var(--accent)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="vlt-overline" style={{ marginBottom: 3 }}>{item.type}</p>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                }}
              >
                {item.name}
              </h3>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginTop: 3,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                }}
              >
                {item.id}
              </p>
            </div>
          </div>

          {/* Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxHeight: 340,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {/* Description */}
            <div>
              <p className="vlt-overline" style={{ marginBottom: 6 }}>Description</p>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--text-secondary)",
                  background: "#F7F8FB",
                  boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.06)",
                  borderRadius: 14,
                  padding: "10px 14px",
                  lineHeight: 1.6,
                }}
              >
                {item.description}
              </p>
            </div>

            {/* Details / URL */}
            {item.details && (
              <div>
                <p className="vlt-overline" style={{ marginBottom: 6 }}>
                  {item.type === "websites" ? "URL" : "Content"}
                </p>
                {item.type === "websites" ? (
                  <a
                    href={String(item.details)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      color: "var(--accent)",
                      background: "rgba(33,117,217,0.05)",
                      border: "1px solid rgba(33,117,217,0.12)",
                      borderRadius: 14,
                      padding: "10px 14px",
                      textDecoration: "none",
                      overflow: "hidden",
                    }}
                  >
                    <Globe style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(item.details)}
                    </span>
                  </a>
                ) : (
                  <pre
                    style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      padding: "10px 14px",
                      background: "#F7F8FB",
                      boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.06)",
                      borderRadius: 14,
                      color: "var(--text-secondary)",
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      margin: 0,
                    }}
                  >
                    {typeof item.details === "string"
                      ? item.details
                      : JSON.stringify(item.details, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Tags + Created by */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                borderTop: "1px solid var(--border-light)",
                paddingTop: 16,
              }}
            >
              <div>
                <p className="vlt-overline" style={{ marginBottom: 6 }}>Tags</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <TagChips tags={item.tags} maxVisible={6} />
                </div>
              </div>
              <div>
                <p className="vlt-overline" style={{ marginBottom: 6 }}>Created by</p>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {item.createdBy}
                </span>
              </div>
            </div>
          </div>

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
                const deleted = await onDelete(item.id, item.type as LibraryTabId, e);
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
              Delete
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
