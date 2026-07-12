import React from "react";

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-gray-200 rounded-[20px] p-7 shadow-xl max-w-sm w-full">
        <h3 className="text-[15px] font-bold text-gray-900 mb-1">Save draft</h3>
        <p className="text-[12px] text-gray-500 mb-6">Give this draft a name to save it to your vault.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draftNameInput.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Draft name <span className="text-rose-400 normal-case font-normal">*</span>
            </label>
            <input
              id="save-draft-name-input"
              type="text"
              required
              autoFocus
              placeholder="e.g. Acme Corp NDA Final"
              value={draftNameInput}
              onChange={(e) => setDraftNameInput(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              id="save-draft-cancel-btn"
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="save-draft-submit-btn"
              type="submit"
              disabled={!draftNameInput.trim()}
              className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-[13px] font-semibold hover:bg-gray-800 transition shadow-xs cursor-pointer disabled:opacity-40"
            >
              Save Draft
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
