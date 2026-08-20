import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentMode, AnswerStyle } from "../types";

interface AnalysisOptionsMenuProps {
  documentMode: DocumentMode;
  answerStyle: AnswerStyle;
  onSetDocumentMode: (mode: DocumentMode) => void;
  onSetAnswerStyle: (style: AnswerStyle) => void;
  onClose: () => void;
  /** Ref of the trigger button so the menu can position itself below it */
  anchorRef: React.RefObject<HTMLElement>;
}

function OptionRow({
  selected,
  label,
  description,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[16px] px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-[#F7F8FB]" : "bg-transparent hover:bg-[#F7F8FB]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
            selected ? "border-[#4F5BD9] bg-[#4F5BD9]" : "border-[#D0D5DD] bg-white"
          }`}
        >
          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">{label}</p>
            {selected && (
              <span className="score-badge bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                Selected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-dark-200">{description}</p>
        </div>
      </div>
    </button>
  );
}

export function AnalysisOptionsMenu({
  documentMode,
  answerStyle,
  onSetDocumentMode,
  onSetAnswerStyle,
  onClose,
  anchorRef,
}: AnalysisOptionsMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Compute position below the anchor button, clamped to viewport
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = 320; // w-80
      const gap = 8;

      let left = rect.left;
      // Clamp so the panel doesn't overflow the right edge of the viewport
      if (left + panelWidth > window.innerWidth - 12) {
        left = window.innerWidth - panelWidth - 12;
      }
      // Never go off the left edge
      if (left < 8) left = 8;

      const top = rect.bottom + gap;
      const maxHeight = window.innerHeight - top - 12;

      setCoords({ top, left, maxHeight });
    };

    place();

    window.addEventListener("resize", place, { passive: true });
    window.addEventListener("scroll", place, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="analyze-options-panel"
      role="dialog"
      aria-label="Analysis options"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: 320,
        zIndex: 9999,
        maxHeight: coords.maxHeight,
        overflowY: "auto",
        // Hide scrollbar visually while keeping it functional
        scrollbarWidth: "none",        // Firefox
        msOverflowStyle: "none",       // IE/Edge legacy
      }}
    >
      <p className="px-3 pt-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
        Document mode
      </p>
      <OptionRow
        selected={documentMode === "unified"}
        label="Unified"
        description="All selected documents as one context"
        onClick={() => {
          onSetDocumentMode("unified");
          onClose();
        }}
      />
      <OptionRow
        selected={documentMode === "individual"}
        label="Individual"
        description="Run analysis on each document separately"
        onClick={() => {
          onSetDocumentMode("individual");
          onClose();
        }}
      />

      <div className="mx-3 my-2 border-t border-[rgba(16,24,40,0.06)]" />

      <p className="px-3 pt-1.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
        Output format
      </p>
      <OptionRow
        selected={answerStyle === "narrative"}
        label="Narrative"
        description="Consolidated prose response"
        onClick={() => {
          onSetAnswerStyle("narrative");
          onClose();
        }}
      />
      <OptionRow
        selected={answerStyle === "tabular"}
        label="Tabular"
        description="Structured rows per document"
        onClick={() => {
          onSetAnswerStyle("tabular");
          onClose();
        }}
      />
    </div>,
    document.body
  );
}
