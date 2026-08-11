// ─── CompareHero ──────────────────────────────────────────────────────────────
// Modal header — badge, title, subtitle, close button.
// Typography and badge patterns mirror the RandTrust AI landing page exactly.

import { X, GitCompare } from "lucide-react";
import { motion } from "motion/react";

interface CompareHeroProps {
  onClose: () => void;
}

export function CompareHero({ onClose }: CompareHeroProps) {
  return (
    <div className="flex items-start justify-between gap-4">

      {/* ── Left: badge + title + subtitle ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
      >
       
        <h2
          id="compare-modal-title"
          className="font-bold leading-tight mb-3"
          style={{
            fontSize: "clamp(1.45rem, 3vw, 1.85rem)",
            letterSpacing: "-0.035em",
            color: "rgba(255,255,255,0.95)",
            lineHeight: 1.12,
            textShadow: "0 0 80px rgba(33,117,217,0.14), 0 1px 16px rgba(0,0,0,0.4)",
          }}
        >
          Compare Agreements
        </h2>

        {/* Subtitle */}
        <p
          className="text-[13px] leading-relaxed"
          style={{
            color: "rgba(255,255,255,0.33)",
            maxWidth: 420,
            lineHeight: 1.65,
          }}
        >
          Upload two agreements and let AI identify legal, business,
          and&nbsp;compliance differences.
        </p>
      </motion.div>

      {/* ── Close button — same ghost style as Composer toolbar ─────────── */}
      <motion.button
        onClick={onClose}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl outline-none transition-colors duration-150"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.30)",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background  = "rgba(255,255,255,0.09)";
          el.style.borderColor = "rgba(255,255,255,0.14)";
          el.style.color       = "rgba(255,255,255,0.72)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background  = "rgba(255,255,255,0.05)";
          el.style.borderColor = "rgba(255,255,255,0.08)";
          el.style.color       = "rgba(255,255,255,0.30)";
        }}
        aria-label="Close modal"
      >
        <X className="w-3.5 h-3.5" />
      </motion.button>

    </div>
  );
}
