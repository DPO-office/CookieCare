import { FileText, FileCode, Folder, X } from "lucide-react";
import { SelectedDocument } from "../documentSelection";

function docIcon(type: SelectedDocument["type"]) {
  switch (type) {
    case "folder":
      return Folder;
    case "draft":
      return FileCode;
    default:
      return FileText;
  }
}

interface ComposerDocumentCardProps {
  document: SelectedDocument;
  onRemove: () => void;
  /** Mark this upload as a playbook/reference for comparison. */
  isPlaybook?: boolean;
  onTogglePlaybook?: () => void;
  showPlaybookToggle?: boolean;
}

/** Context chip — same visual language as Ask Lawyer ComposerBar chips. */
export function ComposerDocumentCard({
  document: doc,
  onRemove,
  isPlaybook = false,
  onTogglePlaybook,
  showPlaybookToggle = false,
}: ComposerDocumentCardProps) {
  const Icon = docIcon(doc.type);

  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md text-[11px] font-medium select-none max-w-[14rem]"
      style={{
        background: isPlaybook ? "#FEF3C7" : "#EBF2FD",
        border: isPlaybook ? "1px solid #FCD34D" : "1px solid #BFDBFE",
        color: isPlaybook ? "#92400E" : "#1A5BAD",
        lineHeight: 1,
      }}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="truncate" title={doc.title}>
        {doc.title}
      </span>
      {showPlaybookToggle && onTogglePlaybook && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlaybook();
          }}
          aria-pressed={isPlaybook}
          aria-label={
            isPlaybook
              ? `Unmark ${doc.title} as playbook`
              : `Mark ${doc.title} as playbook/reference`
          }
          className="px-1 py-0.5 rounded text-[10px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2175D9]"
          style={{
            background: isPlaybook ? "#F59E0B" : "transparent",
            color: isPlaybook ? "#fff" : "#64748B",
          }}
          title="Use as playbook / reference"
        >
          PB
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${doc.title}`}
        className="w-4 h-4 flex items-center justify-center rounded transition-colors duration-100 cursor-pointer ml-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2175D9]"
        style={{ color: isPlaybook ? "#D97706" : "#93C5FD" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "#DC2626";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = isPlaybook ? "#D97706" : "#93C5FD";
        }}
      >
        <X className="w-2.5 h-2.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
}
