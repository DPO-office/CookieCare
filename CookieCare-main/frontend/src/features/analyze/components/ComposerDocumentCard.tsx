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
}

/** Context chip — same visual language as Ask Lawyer ComposerBar chips. */
export function ComposerDocumentCard({ document: doc, onRemove }: ComposerDocumentCardProps) {
  const Icon = docIcon(doc.type);

  return (
    <span className="score-badge max-w-[11rem] select-none bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate" title={doc.title}>
        {doc.title}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${doc.title}`}
        className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[#4F5BD9] transition-colors hover:bg-white/70 hover:text-[#B54A45] focus-visible:outline-none"
      >
        <X className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
}
