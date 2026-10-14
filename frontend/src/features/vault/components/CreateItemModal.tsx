import React, { useState } from "react";
import { X } from "lucide-react";
import { LibraryTabId, LibraryItemSource } from "../types";
import { TabConfig } from "../constants";

interface CreateItemModalProps {
  activeTab: LibraryTabId;
  activeTabInfo: TabConfig;
  formName: string;
  formDescription: string;
  formTags: string;
  formDetails: string;
  onChangeName: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeTags: (v: string) => void;
  onChangeDetails: (v: string) => void;
  /**
   * Called on submit. The second argument carries the chosen source
   * ('private' | 'org') for Templates, Clauses, and AI Rulebook.
   * For all other tabs it is always 'private'.
   */
  onSubmit: (e: React.FormEvent, source: LibraryItemSource) => void;
  onClose: () => void;
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--text-muted)",
        marginBottom: 7,
      }}
    >
      {text}{required && <span style={{ color: "rgba(239,68,68,0.75)", marginLeft: 3 }}>*</span>}
    </label>
  );
}

export function CreateItemModal({
  activeTab,
  activeTabInfo,
  formName,
  formDescription,
  formTags,
  formDetails,
  onChangeName,
  onChangeDescription,
  onChangeTags,
  onChangeDetails,
  onSubmit,
  onClose,
}: CreateItemModalProps) {
  // Scope is relevant for Templates, Clauses, and AI Rulebook; defaults to 'private'.
  const [scope, setScope] = useState<LibraryItemSource>("private");
  const isTemplates = activeTab === "templates";
  const isClauses = activeTab === "clauses";
  const isRulebook = activeTab === "rulebook";
  // Show the scope selector for any of the three types that support private/org.
  const showScopeSelector = isTemplates || isClauses || isRulebook;

  return (
    <div className="vlt-overlay">
      <div className="vlt-modal" style={{ maxWidth: 500 }}>
        {/* Top accent glow */}
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

          <form onSubmit={(e) => onSubmit(e, showScopeSelector ? scope : "private")}>
            {/* Header */}
            <div style={{ paddingBottom: 18, borderBottom: "1px solid var(--border-light)", marginBottom: 20 }}>
              <p className="vlt-overline" style={{ marginBottom: 5 }}>{activeTabInfo.label}</p>
              <h3
                style={{
                  fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em",
                  color: "var(--text-primary)", lineHeight: 1.15,
                }}
              >
                {activeTabInfo.buttonWord}
              </h3>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.55 }}>
                Add a new {activeTabInfo.label.toLowerCase()} to your workspace.
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* ── Who can access this? — Templates, Clauses, and AI Rulebook ── */}
              {showScopeSelector && (
                <div>
                  <Label text="Who can access this?" />
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
                            name="createItemScope"
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
                      ? "Items are stored centrally for your organisation. Access is granted by team or organisation membership."
                      : "Items stored in your private space are only visible to you."}
                  </p>
                </div>
              )}

              <div>
                <Label text="Name" required />
                <input
                  type="text"
                  required
                  placeholder="Enter a name"
                  value={formName}
                  onChange={(e) => onChangeName(e.target.value)}
                  className="vlt-input"
                />
              </div>

              <div>
                <Label text="Description" />
                <input
                  type="text"
                  placeholder="Brief scope description"
                  value={formDescription}
                  onChange={(e) => onChangeDescription(e.target.value)}
                  className="vlt-input"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label text="Tag" />
                  <input
                    type="text"
                    placeholder="e.g. GDPR"
                    value={formTags}
                    onChange={(e) => onChangeTags(e.target.value)}
                    className="vlt-input"
                  />
                </div>
                <div>
                  <Label text="Category" />
                  <input
                    type="text"
                    disabled
                    value={activeTabInfo.label}
                    className="vlt-input"
                    style={{ opacity: 0.35, cursor: "not-allowed" }}
                  />
                </div>
              </div>

              {activeTab !== "files" && activeTab !== "tags" && (
                <div>
                  <Label text={activeTab === "websites" ? "URL" : "Content / Instructions"} required />
                  <textarea
                    rows={4}
                    required
                    placeholder={activeTab === "websites" ? "https://..." : "Enter directive instructions..."}
                    value={formDetails}
                    onChange={(e) => onChangeDetails(e.target.value)}
                    className="vlt-input"
                    style={{
                      resize: "none",
                      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
                      fontSize: 12.5, lineHeight: 1.65,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex", justifyContent: "flex-end", gap: 8,
                paddingTop: 20, marginTop: 20,
                borderTop: "1px solid var(--border-light)",
              }}
            >
              <button type="button" onClick={onClose} className="vlt-btn-ghost">Cancel</button>
              <button type="submit" className="vlt-btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
