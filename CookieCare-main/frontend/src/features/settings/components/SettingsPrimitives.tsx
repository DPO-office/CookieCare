import React, { useState } from "react";
import { Check, CheckCircle } from "lucide-react";

export function SettingCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc?: string }) {
  return (
    <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <h3 className="font-semibold text-[14px] text-gray-900 leading-tight">{title}</h3>
        {desc && <p className="text-[12px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-[13px] text-gray-900
        focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition
        placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}

export function Select({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-[13px] text-gray-900
        focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition
        appearance-none cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
        ${checked ? "bg-gray-900" : "bg-gray-200"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm
        transition duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export function ToggleRow({ title, desc, checked, onChange }: {
  title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-900 leading-snug">{title}</p>
        {desc && <p className="text-[12px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function SavedIndicator({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return (
    <span className="text-emerald-700 text-[13px] font-medium flex items-center gap-1.5">
      <CheckCircle className="w-4 h-4" /> Saved
    </span>
  );
}

export function useSaved() {
  const [saved, setSaved] = useState(false);
  const trigger = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };
  return [saved, trigger] as const;
}
