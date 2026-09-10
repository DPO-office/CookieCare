import React from "react";
import {
  Folder,
  Globe,
  FileText,
  Sparkles,
  BookOpen,
  ArrowUpDown,
  Check,
  Copy,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { LibraryItem, LibraryTabId } from "../types";
import { TagChips } from "./TagChips";
import { PaginationFooter } from "./PaginationFooter";

interface LibraryItemsTableProps {
  items: LibraryItem[];
  activeTab: LibraryTabId;
  currentPage: number;
  totalPages: number;
  recordsPerPage: number;
  sortField: keyof LibraryItem;
  sortDirection: "asc" | "desc";
  copiedId: string | null;
  activeTabLabel: string;
  onSort: (field: keyof LibraryItem) => void;
  onRowClick: (item: LibraryItem) => void;
  onCopyId: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onOpen?: (item: LibraryItem, e: React.MouseEvent) => void;
  openingId?: string | null;
  onPageChange: (page: number) => void;
  onRecordsPerPageChange: (n: number) => void;
}

function ItemIcon({ type }: { type: LibraryItem["type"] }) {
  const icon = (() => {
    const cls = "h-3.5 w-3.5 text-[#4F5BD9]";
    switch (type) {
      case "files":
        return <Folder className={cls} strokeWidth={1.75} />;
      case "prompts":
        return <Sparkles className={cls} strokeWidth={1.75} />;
      case "questions":
        return <BookOpen className={cls} strokeWidth={1.75} />;
      case "websites":
        return <Globe className={cls} strokeWidth={1.75} />;
      default:
        return <FileText className={cls} strokeWidth={1.75} />;
    }
  })();

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF]">
      {icon}
    </span>
  );
}

function ProcessStatusBadge({ item }: { item: LibraryItem }) {
  if (!item.details) return null;
  try {
    const details = typeof item.details === "string" ? JSON.parse(item.details) : item.details;
    const status = String(details?.status || "").toLowerCase();
    if (status === "processing") return <ProcessingPill />;
    if (status === "failed") return <FailedPill />;
  } catch { /* ignore */ }
  const tagsLower = String(item.tags || "").toLowerCase();
  if (tagsLower.includes("processing")) return <ProcessingPill />;
  if (tagsLower.includes("failed")) return <FailedPill />;
  return null;
}

function ProcessingPill() {
  return (
    <span className="vlt-status-processing shrink-0">
      <span
        style={{
          width: 7, height: 7, display: "inline-block",
          borderRadius: "50%", border: "1.5px solid rgba(33,117,217,0.70)",
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Processing
    </span>
  );
}

function FailedPill() {
  return <span className="vlt-status-failed shrink-0">Failed</span>;
}


function SortHeader({
  label,
  field,
  active,
  onClick,
  align = "left",
}: {
  label: string;
  field: keyof LibraryItem;
  active: boolean;
  onClick: (f: keyof LibraryItem) => void;
  align?: "left" | "center" | "right";
}) {  return (
    <th
      onClick={() => onClick(field)}
      style={{
        padding: "10px 20px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: active ? "var(--text-secondary)" : "var(--text-muted)",
        cursor: "pointer",
        textAlign: align,
        userSelect: "none",
        transition: "color 150ms ease",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {label}
        <ArrowUpDown
          style={{
            width: 10, height: 10,
            opacity: active ? 0.9 : 0.35,
            transition: "opacity 150ms",
          }}
        />
      </span>
    </th>
  );
}

export function LibraryItemsTable({
  items,
  activeTab,
  currentPage,
  totalPages,
  recordsPerPage,
  sortField,
  sortDirection: _sd,
  copiedId,
  activeTabLabel,
  onSort,
  onRowClick,
  onCopyId,
  onDelete,
  onOpen,
  openingId,
  onPageChange,
  onRecordsPerPageChange,
}: LibraryItemsTableProps) {
  const indexOfLast = currentPage * recordsPerPage;
  const indexOfFirst = indexOfLast - recordsPerPage;
  const currentRecords = items.slice(indexOfFirst, indexOfLast);

  // Items count is meaningless for single-item tab types — each row is always "1 item".
  const showItemsCol = activeTab !== "prompts" && activeTab !== "questions";

  // Open button is only shown for rulebook and templates tabs.
  const showOpenBtn = (activeTab === "rulebook" || activeTab === "templates") && !!onOpen;

  if (items.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
          <Folder className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="m-0 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
          No {activeTabLabel.toLowerCase()} yet
        </p>
        <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-[#667085]">
          Create your first {activeTabLabel.toLowerCase()} using the button above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: "auto" }} className="vlt-scroll-x">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showItemsCol ? 760 : 700 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
              <SortHeader label="Name" field="name" active={sortField === "name"} onClick={onSort} />
              <SortHeader label="Description" field="description" active={sortField === "description"} onClick={onSort} />
              <SortHeader label="Tags" field="tags" active={sortField === "tags"} onClick={onSort} />
              {showItemsCol && (
                <SortHeader label="Items" field="itemsCount" active={sortField === "itemsCount"} onClick={onSort} align="center" />
              )}
              <SortHeader label="Modified" field="dateModified" active={sortField === "dateModified"} onClick={onSort} align="center" />
              <SortHeader label="Created by" field="createdBy" active={sortField === "createdBy"} onClick={onSort} />
              <th
                style={{
                  padding: "10px 20px", fontSize: 10.5, fontWeight: 600,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((item) => (
              <tr
                key={item.id}
                className="vlt-row group"
                onClick={() => onRowClick(item)}
                style={{ cursor: "pointer" }}
              >
                {/* Name */}
                <td style={{ padding: "13px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ItemIcon type={item.type} />
                    <span
                      style={{
                        fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em",
                        color: "var(--text-primary)",
                        maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                    <ProcessStatusBadge item={item} />
                  </div>
                </td>

                {/* Description */}
                <td
                  style={{
                    padding: "13px 20px", fontSize: 13, lineHeight: 1.5,
                    color: "var(--text-muted)",
                    maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {item.description}
                </td>

                {/* Tags */}
                <td style={{ padding: "13px 20px" }}>
                  <TagChips tags={item.tags} />
                </td>

                {/* Items count */}
                {showItemsCol && (
                <td style={{ padding: "13px 20px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600,
                      background: "var(--surface)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.type === "files" ? item.fileList?.length : item.itemsCount}
                  </span>
                </td>
                )}

                {/* Modified */}
                <td
                  style={{
                    padding: "13px 20px", textAlign: "center",
                    fontSize: 11.5, fontFamily: "monospace",
                    color: "var(--text-muted)",
                  }}
                >
                  {item.dateModified}
                </td>

                {/* Created by */}
                <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--text-secondary)" }}>
                  {item.createdBy}
                </td>

                {/* Actions */}
                <td style={{ padding: "13px 20px", textAlign: "center" }}>
                  <div
                    className="vlt-fade"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      opacity: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                    ref={(el) => {
                      if (!el) return;
                      const row = el.closest("tr");
                      if (!row) return;
                      row.addEventListener("mouseenter", () => { el.style.opacity = "1"; });
                      row.addEventListener("mouseleave", () => { el.style.opacity = "0"; });
                    }}
                  >
                    {showOpenBtn && (
                      <button
                        title="Open document"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen!(item, e);
                        }}
                        className="vlt-icon-btn"
                        disabled={openingId === item.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          color: openingId === item.id ? "var(--text-muted)" : "#4F5BD9",
                          background: openingId === item.id ? "transparent" : "rgba(79,91,217,0.07)",
                          border: "1px solid rgba(79,91,217,0.18)",
                          cursor: openingId === item.id ? "default" : "pointer",
                          transition: "all 150ms ease",
                          flexShrink: 0,
                        }}
                      >
                        {openingId === item.id ? (
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              display: "inline-block",
                              borderRadius: "50%",
                              border: "1.5px solid rgba(79,91,217,0.5)",
                              borderTopColor: "transparent",
                              animation: "spin 0.8s linear infinite",
                            }}
                          />
                        ) : (
                          <ExternalLink style={{ width: 12, height: 12 }} />
                        )}
                      </button>
                    )}
                    <button
                      title="Copy ID"
                      onClick={(e) => onCopyId(item.id, e)}
                      className="vlt-icon-btn"
                    >
                      {copiedId === item.id
                        ? <Check style={{ width: 12, height: 12, color: "rgba(16,185,129,0.85)" }} />
                        : <Copy style={{ width: 12, height: 12 }} />}
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id, e);
                      }}
                      className="vlt-icon-btn danger"
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        totalItems={items.length}
        currentPage={currentPage}
        totalPages={totalPages}
        recordsPerPage={recordsPerPage}
        onPageChange={onPageChange}
        onRecordsPerPageChange={onRecordsPerPageChange}
      />
    </>
  );
}
