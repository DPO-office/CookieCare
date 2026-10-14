import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  CATEGORY_OPTIONS,
  DATA_TYPE_OPTIONS,
  EMPTY_TOOL_FORM,
  RISK_OPTIONS,
  STATUS_OPTIONS,
} from "../constants";
import type { AiTool, AiToolInput } from "../types";
import { PremiumDateField, PremiumSelect } from "./FormControls";
import { INVENTORY_FORM_STYLES } from "../styles/formStyles";

interface ToolFormModalProps {
  open: boolean;
  tool: AiTool | typeof EMPTY_TOOL_FORM | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: AiToolInput) => void;
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="vlt-overline mb-2 block">
      {text}
      {required && <span className="ml-1 text-[#DC2626]">*</span>}
    </label>
  );
}

export function ToolFormModal({ open, tool, saving, onClose, onSave }: ToolFormModalProps) {
  const [form, setForm] = useState<AiToolInput>(EMPTY_TOOL_FORM);

  useEffect(() => {
    if (!open) return;
    if (tool && "id" in tool) {
      setForm({
        name: tool.name,
        vendor: tool.vendor,
        category: tool.category,
        purpose: tool.purpose,
        ownerName: tool.ownerName,
        department: tool.department,
        status: tool.status,
        euRisk: tool.euRisk,
        dataTypes: tool.dataTypes,
        modelName: tool.modelName,
        lastReviewedAt: tool.lastReviewedAt,
      });
    } else {
      setForm(EMPTY_TOOL_FORM);
    }
  }, [open, tool]);

  if (!open) return null;

  const isEdit = Boolean(tool && "id" in tool);

  const toggleDataType = (value: string) => {
    setForm((prev) => ({
      ...prev,
      dataTypes: prev.dataTypes.includes(value)
        ? prev.dataTypes.filter((d) => d !== value)
        : [...prev.dataTypes, value],
    }));
  };

  return (
    <div className="vlt-overlay inv-overlay !items-start overflow-y-auto py-10" onClick={onClose}>
      <style>{INVENTORY_FORM_STYLES}</style>
      <div
        className="vlt-modal inv-modal my-auto max-w-[640px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5">
          <div>
            <p className="vlt-overline mb-1.5">AI Governance</p>
            <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-[#1a1a1a]">
              {isEdit ? "Edit AI tool" : "Register AI tool"}
            </h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#667085]">
              Capture ownership, purpose, data use, and EU AI Act risk class.
            </p>
          </div>
          <button type="button" className="vlt-icon-btn" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mx-7 h-px bg-[rgba(16,24,40,0.06)]" />

        <form
          className="grid grid-cols-1 gap-x-4 gap-y-5 px-7 py-6 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
        >
          <div className="sm:col-span-2">
            <Label text="Tool name" required />
            <input
              required
              className="vlt-input"
              placeholder="e.g. GitHub Copilot"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label text="Vendor / provider" />
            <input
              className="vlt-input"
              placeholder="e.g. Microsoft"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <div>
            <Label text="Model / system" />
            <input
              className="vlt-input"
              placeholder="e.g. GPT-4o"
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
            />
          </div>
          <div>
            <Label text="Category" />
            <PremiumSelect
              value={form.category}
              options={CATEGORY_OPTIONS}
              onChange={(category) => setForm({ ...form, category })}
            />
          </div>
          <div>
            <Label text="Lifecycle status" />
            <PremiumSelect
              value={form.status}
              options={STATUS_OPTIONS}
              onChange={(status) => setForm({ ...form, status })}
            />
          </div>
          <div>
            <Label text="Business owner" />
            <input
              className="vlt-input"
              placeholder="Name"
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            />
          </div>
          <div>
            <Label text="Department" />
            <input
              className="vlt-input"
              placeholder="e.g. Legal"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <div>
            <Label text="EU AI Act risk" />
            <PremiumSelect
              value={form.euRisk}
              options={RISK_OPTIONS}
              onChange={(euRisk) => setForm({ ...form, euRisk })}
            />
          </div>
          <div>
            <Label text="Last reviewed" />
            <PremiumDateField
              value={form.lastReviewedAt}
              onChange={(lastReviewedAt) => setForm({ ...form, lastReviewedAt })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label text="Intended purpose" />
            <textarea
              className="vlt-input inv-textarea"
              placeholder="What this system is used for, and who it affects."
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label text="Data types processed" />
            <div className="flex flex-wrap gap-2">
              {DATA_TYPE_OPTIONS.map((opt) => {
                const on = form.dataTypes.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`inv-chip ${on ? "is-on" : ""}`}
                    onClick={() => toggleDataType(opt)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[rgba(16,24,40,0.06)] pt-5 sm:col-span-2">
            <button type="button" className="vlt-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="vlt-btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add to inventory"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
