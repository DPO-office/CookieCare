import { ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";

const BODY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flex: "1 1 auto",
  minHeight: 0,
  width: "100%",
  overflow: "hidden",
};

const COL_CATEGORIES: CSSProperties = {
  flex: "0 0 260px",
  width: 260,
  minWidth: 260,
  maxWidth: 260,
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  borderRight: "1px solid rgba(16,24,40,0.06)",
  background: "#F7F8FB",
  padding: "20px 16px",
  boxSizing: "border-box",
};

const COL_LIST: CSSProperties = {
  flex: "1 1 0%",
  minWidth: 300,
  width: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRight: "1px solid rgba(16,24,40,0.06)",
  background: "#ffffff",
};

const COL_PREVIEW: CSSProperties = {
  flex: "0 0 360px",
  width: 360,
  minWidth: 360,
  maxWidth: 360,
  minHeight: 0,
  overflow: "hidden",
  background: "#F7F8FB",
  boxSizing: "border-box",
};

const LIST_SCROLL: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  overflowX: "hidden",
  overflowY: "auto",
};

interface LibraryModalColumnsProps {
  categories: ReactNode;
  listHeader: ReactNode;
  listContent: ReactNode;
  previewContent: ReactNode;
}

export function LibraryModalColumns({
  categories,
  listHeader,
  listContent,
  previewContent,
}: LibraryModalColumnsProps) {
  return (
    <div style={BODY_STYLE}>
      <aside style={COL_CATEGORIES}>{categories}</aside>
      <main style={COL_LIST}>
        {listHeader}
        <div style={LIST_SCROLL}>{listContent}</div>
      </main>
      <aside style={COL_PREVIEW}>{previewContent}</aside>
    </div>
  );
}

export function libraryModalShellProps(): { className: string } {
  return { className: "lib-modal-shell-root" };
}

interface LibraryModalOverlayProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "center" | "right";
}

/** Renders on document.body so layout transforms don't offset the dialog. */
export function LibraryModalOverlay({
  label,
  onClose,
  children,
  placement = "center",
}: LibraryModalOverlayProps) {
  return createPortal(
    <div
      className={`lib-modal-overlay${placement === "right" ? " lib-modal-overlay--right" : ""}`}
      aria-modal="true"
      role="dialog"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}
