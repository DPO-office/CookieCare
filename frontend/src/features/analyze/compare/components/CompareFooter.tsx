// ─── CompareFooter ────────────────────────────────────────────────────────────
// Status row + Compare Agreements CTA.
// Active button: white surface with white glow — mirrors rt-send-btn.ready.

import { motion, AnimatePresence } from "motion/react";
import { GitCompare, Sparkles } from "lucide-react";
import type { CompareFile } from "../types";

interface CompareFooterProps {
  original: CompareFile | null;
  revised: CompareFile | null;
  onCompare: () => void;
}

export function CompareFooter({ original, revised, onCompare }: CompareFooterProps) {
  const canCompare = Boolean(original && revised);

  const statusText = canCompare
    ? "Both agreements loaded — ready to compare"
    : !original && !revised
    ? "Upload both agreements to begin"
    : `Upload the ${!original ? "original" : "revised"} agreement to continue`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1], delay: 0.30 }}
      className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-7"
      style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}
    >

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <StatusDot active={Boolean(original)} />
          <StatusDot active={Boolean(revised)} />
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={statusText}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.22 }}
            className="text-[11.5px] select-none"
            style={{ color: "rgba(255,255,255,0.24)" }}
          >
            {statusText}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* ── Compare CTA ─────────────────────────────────────────────────── */}
      {/*
        Active:   white surface + white glow — identical to rt-send-btn.ready.
        Disabled: same ghost surface as the inactive send button.
      */}
      <div className="relative">
        {/* White glow bloom behind button — same as rt-send-btn.ready hover */}
        <AnimatePresence>
          {canCompare && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4 }}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                borderRadius: 12,
                background: "rgba(255,255,255,0.14)",
                filter: "blur(16px)",
                transform: "translateY(4px)",
              }}
            />
          )}
        </AnimatePresence>

        <motion.button
          disabled={!canCompare}
          onClick={onCompare}
          whileHover={canCompare ? { scale: 1.06 } : {}}
          whileTap={canCompare ? { scale: 0.97 } : {}}
          className="relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold outline-none select-none"
          style={{
            // Exact rt-send-btn.ready colours
            background: canCompare
              ? "rgba(255,255,255,0.92)"
              : "rgba(255,255,255,0.055)",
            color: canCompare
              ? "#0A0C0F"
              : "rgba(255,255,255,0.18)",
            border: "1px solid transparent",
            boxShadow: canCompare
              ? "0 2px 14px rgba(255,255,255,0.18)"
              : "none",
            cursor: canCompare ? "pointer" : "not-allowed",
            transition:
              "background 150ms ease, color 150ms ease, box-shadow 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!canCompare) return;
            // On hover: slightly stronger white glow — mirrors rt-send-btn.ready:hover
            (e.currentTarget as HTMLElement).style.boxShadow =
              "0 2px 18px rgba(255,255,255,0.26)";
          }}
          onMouseLeave={(e) => {
            if (!canCompare) return;
            (e.currentTarget as HTMLElement).style.boxShadow =
              "0 2px 14px rgba(255,255,255,0.18)";
          }}
          aria-label="Compare agreements"
        >
          {canCompare
            ? <Sparkles className="w-3.5 h-3.5" style={{ opacity: 0.7 }} />
            : <GitCompare className="w-3.5 h-3.5" />
          }
          <span>Compare Agreements</span>
        </motion.button>
      </div>

    </motion.div>
  );
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <motion.div
      animate={{
        background: active ? "rgba(34,197,94,0.88)" : "rgba(255,255,255,0.11)",
        boxShadow: active ? "0 0 7px rgba(34,197,94,0.55)" : "none",
        scale: active ? 1.2 : 1,
      }}
      transition={{ duration: 0.35, type: "spring", stiffness: 280, damping: 20 }}
      className="w-1.5 h-1.5 rounded-full"
    />
  );
}
