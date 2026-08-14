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
}: AnalysisOptionsMenuProps) {
  return (
    <div
      className="analyze-options-panel absolute left-0 top-[calc(100%+10px)] z-50 w-80"
      role="dialog"
      aria-label="Analysis options"
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
    </div>
  );
}
