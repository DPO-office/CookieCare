import { X } from "lucide-react";

interface SaveDraftModalProps {
  draftNameInput: string;
  setDraftNameInput: (val: string) => void;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

export default function SaveDraftModal({
  draftNameInput,
  setDraftNameInput,
  onCancel,
  onSubmit,
}: SaveDraftModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div
        className="relative w-full max-w-[400px] rounded-[22px] border border-[#EBEBEB] bg-white p-7"
        style={{
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.06), 0 24px 48px -12px rgba(0,0,0,0.14)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-draft-title"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#52525B] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3
          id="save-draft-title"
          className="text-[17px] font-semibold text-[#18181B] tracking-[-0.02em] mb-1"
        >
          Save draft
        </h3>
        <p className="text-[13px] text-[#A1A1AA] leading-relaxed mb-6 pr-6">
          Give this draft a name to save it to your vault.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draftNameInput.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
          }}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="save-draft-name-input"
              className="block text-[11px] font-medium text-[#71717A] tracking-wide mb-2"
            >
              Draft name <span className="text-[#EF4444]">*</span>
            </label>
            <input
              id="save-draft-name-input"
              type="text"
              required
              autoFocus
              placeholder="e.g. Acme Corp NDA Final"
              value={draftNameInput}
              onChange={(e) => setDraftNameInput(e.target.value)}
              className="w-full rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3 text-[14px] text-[#18181B] placeholder:text-[#D4D4D8] outline-none transition-all focus:border-[#D4D4D8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(24,24,27,0.05)]"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              id="save-draft-cancel-btn"
              type="button"
              onClick={onCancel}
              className="flex-1 h-11 rounded-full border border-[#E4E4E7] bg-white text-[13px] font-medium text-[#52525B] hover:bg-[#FAFAFA] hover:border-[#D4D4D8] transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-draft-submit-btn"
              type="submit"
              disabled={!draftNameInput.trim()}
              className="flex-1 h-11 rounded-full bg-[#18181B] text-[13px] font-medium text-white hover:bg-[#27272A] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save draft
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
