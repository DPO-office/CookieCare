// ─── DropOverlay ──────────────────────────────────────────────────────────────
// Full-surface overlay rendered inside the Composer when a drag is active.

interface DropOverlayProps {
  active: boolean;
}

export function DropOverlay({ active }: DropOverlayProps) {
  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[22px] pointer-events-none"
      style={{
        background: "rgba(0, 0, 0, 0.04)",
        border: "2px dashed rgba(0, 0, 0, 0.12)",
      }}
    >
      <p className="text-[13px] font-medium text-[#52525B]">Drop to attach</p>
      <p className="text-[12px] mt-1 text-[#A1A1AA]">PDF, DOCX, TXT</p>
    </div>
  );
}
