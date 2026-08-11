import { ReactNode, CSSProperties } from "react";

const SHELL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "min(94vw, 1160px)",
  height: "min(88vh, 720px)",
  flexShrink: 0,
  background: "#ffffff",
  borderRadius: 22,
  border: "1px solid #ebebeb",
  overflow: "hidden",
  boxShadow:
    "0 4px 6px -1px rgba(0,0,0,0.06), 0 24px 48px -12px rgba(0,0,0,0.14)",
};

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
  borderRight: "1px solid #f0f0f0",
  background: "#fafafa",
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
  borderRight: "1px solid #f0f0f0",
  background: "#ffffff",
};

const COL_PREVIEW: CSSProperties = {
  flex: "0 0 380px",
  width: 380,
  minWidth: 380,
  maxWidth: 380,
  minHeight: 0,
  overflow: "hidden",
  background: "#fafafa",
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

export function libraryModalShellProps(): { style: CSSProperties; className: string } {
  return { style: SHELL_STYLE, className: "lib-modal-shell-root" };
}
