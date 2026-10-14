import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationFooterProps {
  totalItems: number;
  currentPage: number;
  totalPages: number;
  recordsPerPage: number;
  onPageChange: (page: number) => void;
  onRecordsPerPageChange: (n: number) => void;
}

const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: disabled ? "#F7F8FB" : "#FFFFFF",
  border: "none",
  boxShadow: disabled ? "none" : "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)",
  color: disabled ? "#98A2B3" : "#667085",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.7 : 1,
});

export function PaginationFooter({
  totalItems,
  currentPage,
  totalPages,
  recordsPerPage,
  onPageChange,
  onRecordsPerPageChange,
}: PaginationFooterProps) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-light)",
        padding: "10px 20px",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {totalItems} {totalItems === 1 ? "entry" : "entries"}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Per page</span>
          <select
            value={recordsPerPage}
            onChange={(e) => {
              onRecordsPerPageChange(Number(e.target.value));
              onPageChange(1);
            }}
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
              outline: "none",
              fontFamily: "inherit",
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(1)}
            style={navBtnStyle(currentPage === 1)}
          >
            <ChevronsLeft style={{ width: 12, height: 12 }} />
          </button>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            style={navBtnStyle(currentPage === 1)}
          >
            <ChevronLeft style={{ width: 12, height: 12 }} />
          </button>

          <span
            style={{
              padding: "0 10px",
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}
          >
            {currentPage}
            <span style={{ color: "var(--text-faint)", fontWeight: 400, margin: "0 4px" }}>of</span>
            {totalPages}
          </span>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            style={navBtnStyle(currentPage === totalPages)}
          >
            <ChevronRight style={{ width: 12, height: 12 }} />
          </button>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(totalPages)}
            style={navBtnStyle(currentPage === totalPages)}
          >
            <ChevronsRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
