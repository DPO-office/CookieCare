import React from "react";
import { FilePen, Copy, Trash2, ExternalLink, ScrollText } from "lucide-react";
import { LegalDocument } from "../../../shared/types";
import { fmtDate } from "../utils";

interface SavedDraftsTableProps {
  drafts: any[];
  onDelete: (id: string, e: React.MouseEvent) => void;
  onOpenInDraftEditor?: (doc: LegalDocument) => void;
}

function HeaderCell({ label, align = "left" }: { label: string; align?: "left" | "center" }) {
  return (
    <th
      style={{
        padding: "10px 20px",
        fontSize: 10.5, fontWeight: 600,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)",
        textAlign: align, whiteSpace: "nowrap",
      }}
    >
      {label}
    </th>
  );
}

export function SavedDraftsTable({ drafts, onDelete, onOpenInDraftEditor }: SavedDraftsTableProps) {
  if (drafts.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: "64px 24px", minHeight: 280 }}
      >
        <div
          style={{
            width: 44, height: 44, borderRadius: 14,
            background: "var(--surface)",
            border: "1px solid var(--border-light)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <ScrollText style={{ width: 18, height: 18, color: "var(--text-faint)" }} />
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          No saved drafts found
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, maxWidth: 280, lineHeight: 1.6 }}>
          Drafts saved from the Draft Templates module will automatically appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
              <HeaderCell label="Draft name" />
              <HeaderCell label="Last updated" align="center" />
              <HeaderCell label="Created" align="center" />
              <HeaderCell label="Actions" align="center" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr
                key={draft.id}
                className="vlt-row group"
              >
                <td style={{ padding: "13px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FilePen style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        letterSpacing: "-0.01em",
                        color: "var(--text-primary)",
                        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {draft.title}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "13px 20px", textAlign: "center", fontSize: 11.5, fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {fmtDate(draft.updated_at)}
                </td>
                <td style={{ padding: "13px 20px", textAlign: "center", fontSize: 11.5, fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {fmtDate(draft.created_at)}
                </td>
                <td style={{ padding: "13px 20px", textAlign: "center" }}>
                  <ActionGroup
                    onOpen={onOpenInDraftEditor ? () => onOpenInDraftEditor(draft as LegalDocument) : undefined}
                    onCopy={() => navigator.clipboard.writeText(draft.id)}
                    onDelete={(e) => onDelete(draft.id, e)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border-light)",
          padding: "10px 20px",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {drafts.length} {drafts.length === 1 ? "entry" : "entries"}
      </div>
    </>
  );
}

function ActionGroup({
  onOpen,
  onCopy,
  onDelete,
}: {
  onOpen?: () => void;
  onCopy: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: visible ? 1 : 0, transition: "opacity 130ms ease" }}
      ref={(el) => {
        if (!el) return;
        const row = el.closest("tr");
        if (!row) return;
        row.addEventListener("mouseenter", () => setVisible(true));
        row.addEventListener("mouseleave", () => setVisible(false));
      }}
    >
      {onOpen && (
        <button
          onClick={onOpen}
          className="vlt-btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11.5, borderRadius: 8 }}
        >
          <ExternalLink style={{ width: 11, height: 11 }} />
          Open
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onCopy(); }} className="vlt-icon-btn">
        <Copy style={{ width: 12, height: 12 }} />
      </button>
      <button onClick={onDelete} className="vlt-icon-btn danger">
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}
