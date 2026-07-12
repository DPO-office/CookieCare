import React, { useState } from "react";

interface CreateDocModalProps {
  onCancel: () => void;
  onSubmit: (title: string, type: "NDA" | "DPA" | "SLA" | "Custom") => void;
}

export default function CreateDocModal({ onCancel, onSubmit }: CreateDocModalProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"NDA" | "DPA" | "SLA" | "Custom">("NDA");

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-gray-200 rounded-[20px] p-7 shadow-xl max-w-sm w-full">
        <h3 className="text-[15px] font-bold text-gray-900 mb-1">New compliance draft</h3>
        <p className="text-[12px] text-gray-500 mb-6">Initialize a new legal agreement template.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(newTitle, newType);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Agreement title</label>
            <input
              id="create-doc-title-input"
              type="text"
              required
              placeholder="e.g. Acme Corp NDA 2026"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Legal template</label>
            <select
              id="create-doc-type-select"
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-100 cursor-pointer"
            >
              <option value="NDA">Mutual NDA (Non-disclosure)</option>
              <option value="DPA">GPDR DPA (Data Processing)</option>
              <option value="SLA">Service Level Performance SLA</option>
              <option value="Custom">Blank Custom Slate</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              id="create-doc-cancel-btn"
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="create-doc-submit-btn"
              type="submit"
              className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-[13px] font-semibold hover:bg-gray-800 transition shadow-xs cursor-pointer"
            >
              Load Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
