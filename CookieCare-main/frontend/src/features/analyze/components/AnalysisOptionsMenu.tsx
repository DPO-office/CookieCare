import { DocumentMode, AnswerStyle } from "../types";

interface AnalysisOptionsMenuProps {
  documentMode: DocumentMode;
  answerStyle: AnswerStyle;
  onSetDocumentMode: (mode: DocumentMode) => void;
  onSetAnswerStyle: (style: AnswerStyle) => void;
  onClose: () => void;
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
      className="w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-[#FAFAFA]"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
            selected ? "border-[#18181B] bg-[#18181B]" : "border-[#D4D4D8] bg-transparent"
          }`}
        >
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#18181B]">{label}</p>
          <p className="text-[11.5px] mt-0.5 leading-relaxed text-[#A1A1AA]">
            {description}
          </p>
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
}: AnalysisOptionsMenuProps) {
  return (
    <div
      className="analyze-options-panel absolute left-0 top-[calc(100%+8px)] z-50 w-72 p-2"
      role="dialog"
      aria-label="Analysis options"
    >
      <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
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

      <div className="my-2 mx-3 border-t border-[#F0F0F0]" />

      <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
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
    </div>
  );
}
