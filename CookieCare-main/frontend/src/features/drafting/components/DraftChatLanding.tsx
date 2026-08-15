import { useState } from "react";
import { DRAFT_PAGE_STYLES } from "../styles/draftPageStyles";
import { DraftComposer, DraftComposerDoc } from "./DraftComposer";
import { DraftContextStrip } from "./DraftContextStrip";
import { DraftLibraryItem } from "../hooks/useDraftLibrary";
import { DraftPromptLibraryModal } from "./DraftPromptLibraryModal";
import type { DraftPrompt } from "../constants";

export interface DraftChatLandingProps {
  instructions: string;
  onSetInstructions: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  attachedFileName?: string;
  vaultDocuments?: DraftComposerDoc[];
  onRemoveVaultDocument?: (id: string) => void;
  onOpenVault?: () => void;
  template?: DraftLibraryItem | null;
  playbook?: DraftLibraryItem | null;
  clauses: DraftLibraryItem[];
  onOpenTemplate: () => void;
  onOpenPlaybook: () => void;
  onOpenClauses: () => void;
  onClearTemplate: () => void;
  onClearPlaybook: () => void;
  onRemoveClause: (id: string) => void;
  isStreaming?: boolean;
  isParsing?: boolean;
  draftError?: string;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  starterPrompts: DraftPrompt[];
  customPrompts: DraftPrompt[];
  onAddPrompt: (title: string, prompt: string) => Promise<unknown>;
  onRemovePrompt: (id: string) => void;
}

export default function DraftChatLanding({
  instructions,
  onSetInstructions,
  onSubmit,
  onFileSelect,
  onRemoveFile,
  attachedFileName,
  vaultDocuments,
  onRemoveVaultDocument,
  onOpenVault,
  template,
  playbook,
  clauses,
  onOpenTemplate,
  onOpenPlaybook,
  onOpenClauses,
  onClearTemplate,
  onClearPlaybook,
  onRemoveClause,
  isStreaming = false,
  isParsing = false,
  draftError,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  starterPrompts,
  customPrompts,
  onAddPrompt,
  onRemovePrompt,
}: DraftChatLandingProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  const applyPrompts = (texts: string[]) => {
    const next = texts.join("\n\n");
    onSetInstructions(instructions.trim() ? `${instructions.trim()}\n\n${next}` : next);
    setLibraryOpen(false);
  };

  return (
    <>
      <style>{DRAFT_PAGE_STYLES}</style>
      <div className="dpa-results-bg draft-page flex flex-1 flex-col min-h-0 overflow-hidden font-sans">
        <div className="flex flex-1 flex-col items-center justify-center min-h-0 px-6 py-8 overflow-y-auto">
          <p className="draft-rise-1 mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
            Legal Space · Draft
          </p>
          <h1 className="draft-rise-1 draft-heading text-center">
            What would you like to draft?
          </h1>
          <p className="draft-rise-1 mt-2 max-w-lg text-center text-[14px] leading-relaxed text-dark-200">
            Describe the agreement, attach a document, and optionally choose a template, playbook, or clauses.
          </p>

          <div className="draft-rise-2 mt-8 w-full" style={{ maxWidth: 720 }}>
            <DraftComposer
              value={instructions}
              onChange={onSetInstructions}
              onSubmit={onSubmit}
              onFileSelect={onFileSelect}
              attachedFileName={attachedFileName}
              onRemoveFile={onRemoveFile}
              vaultDocuments={vaultDocuments}
              onRemoveVaultDocument={onRemoveVaultDocument}
              onOpenVault={onOpenVault}
              hasContext={!!template || !!playbook || clauses.length > 0}
              isLoading={isStreaming}
              isParsing={isParsing}
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />

            <DraftContextStrip
              template={template}
              playbook={playbook}
              clauses={clauses}
              onOpenTemplate={onOpenTemplate}
              onOpenPlaybook={onOpenPlaybook}
              onOpenClauses={onOpenClauses}
              onClearTemplate={onClearTemplate}
              onClearPlaybook={onClearPlaybook}
              onRemoveClause={onRemoveClause}
              disabled={isStreaming || isParsing}
            />

            {draftError && (
              <p className="mt-3 text-center text-[13px] text-badge-red-text" role="alert">
                {draftError}
              </p>
            )}

            <div className="mt-6 flex flex-col items-center">
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="draft-link mt-1"
              >
                Browse prompt library
              </button>
            </div>
          </div>
        </div>
      </div>
      {libraryOpen && (
        <DraftPromptLibraryModal
          starterPrompts={starterPrompts}
          customPrompts={customPrompts}
          onApply={applyPrompts}
          onAdd={onAddPrompt}
          onRemove={onRemovePrompt}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </>
  );
}
