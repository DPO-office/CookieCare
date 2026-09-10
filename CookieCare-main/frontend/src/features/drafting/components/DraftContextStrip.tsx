import { ReactNode } from "react";
import { BookOpen, FileStack, Scale, X } from "lucide-react";
import { DraftLibraryItem } from "../hooks/useDraftLibrary";

interface DraftContextStripProps {
  template?: DraftLibraryItem | null;
  playbook?: DraftLibraryItem | null;
  clauses: DraftLibraryItem[];
  onOpenTemplate: () => void;
  onOpenPlaybook: () => void;
  onOpenClauses: () => void;
  onClearTemplate: () => void;
  onClearPlaybook: () => void;
  onRemoveClause: (id: string) => void;
  disabled?: boolean;
}

function PickerCard({
  label,
  hint,
  icon: Icon,
  onClick,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  icon: typeof BookOpen;
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="draft-context-card flex min-w-0 flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[#98A2B3]">
            {label}
          </span>
          <span className="block truncate text-[13px] font-medium text-[#1a1a1a]">
            {hint}
          </span>
        </span>
      </button>
      {children}
    </div>
  );
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="score-badge max-w-full bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70 hover:text-[#B54A45]"
        aria-label={`Remove ${label}`}
      >
        <X className="h-2.5 w-2.5" strokeWidth={2} />
      </button>
    </span>
  );
}

export function DraftContextStrip({
  template,
  playbook,
  clauses,
  onOpenTemplate,
  onOpenPlaybook,
  onOpenClauses,
  onClearTemplate,
  onClearPlaybook,
  onRemoveClause,
  disabled,
}: DraftContextStripProps) {
  return (
    <div className="draft-rise-2 mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
      <PickerCard
        label="Template"
        hint={template ? "Change template" : "Select a template"}
        icon={FileStack}
        onClick={onOpenTemplate}
        disabled={disabled}
      >
        {template && (
          <div className="flex flex-wrap gap-1.5">
            <Chip label={template.name} onRemove={onClearTemplate} />
          </div>
        )}
      </PickerCard>

      <PickerCard
        label="Playbook"
        hint={playbook ? "Change playbook" : "Select a playbook"}
        icon={BookOpen}
        onClick={onOpenPlaybook}
        disabled={disabled}
      >
        {playbook && (
          <div className="flex flex-wrap gap-1.5">
            <Chip label={playbook.name} onRemove={onClearPlaybook} />
          </div>
        )}
      </PickerCard>

      <PickerCard
        label="Clauses"
        hint={
          clauses.length > 0
            ? `${clauses.length} selected`
            : "Select clauses"
        }
        icon={Scale}
        onClick={onOpenClauses}
        disabled={disabled}
      >
        {clauses.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clauses.map((c) => (
              <Chip key={c.id} label={c.name} onRemove={() => onRemoveClause(c.id)} />
            ))}
          </div>
        )}
      </PickerCard>
    </div>
  );
}
