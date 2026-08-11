import { DRAFT_PAGE_STYLES } from "../styles/draftPageStyles";
import { DraftComposer } from "./DraftComposer";

export interface DraftChatLandingProps {
  instructions: string;
  onSetInstructions: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  attachedFileName?: string;
  isStreaming?: boolean;
  isParsing?: boolean;
  draftError?: string;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function DraftChatLanding({
  instructions,
  onSetInstructions,
  onSubmit,
  onFileSelect,
  onRemoveFile,
  attachedFileName,
  isStreaming = false,
  isParsing = false,
  draftError,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
}: DraftChatLandingProps) {
  return (
    <>
      <style>{DRAFT_PAGE_STYLES}</style>
      <div className="draft-page flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6">
          <h1 className="draft-rise-1 draft-heading text-center">
            What would you like to draft?
          </h1>

          <div className="draft-rise-2 w-full mt-8" style={{ maxWidth: 720 }}>
            <DraftComposer
              value={instructions}
              onChange={onSetInstructions}
              onSubmit={onSubmit}
              onFileSelect={onFileSelect}
              attachedFileName={attachedFileName}
              onRemoveFile={onRemoveFile}
              isLoading={isStreaming}
              isParsing={isParsing}
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />

            {draftError && (
              <p
                className="mt-3 text-center text-[13px]"
                style={{ color: "#DC2626" }}
                role="alert"
              >
                {draftError}
              </p>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
