// ─── CompareDocumentsModal ────────────────────────────────────────────────────
// Premium glassmorphism modal. Phase 1 — UI only.
// The modal border carries the same rotating blue/purple conic-gradient glow
// as the LORA AI Composer's BorderBeam.

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CompareHero } from "./CompareHero";
import { AgreementUploadCard } from "./AgreementUploadCard";
import { CompareFooter } from "./CompareFooter";
import { SLOT_CONFIG } from "../constants";
import type { CompareFile, AgreementSlot } from "../types";

interface CompareDocumentsModalProps {
  isOpen: boolean;
  original: CompareFile | null;
  revised: CompareFile | null;
  canCompare: boolean;
  onClose: () => void;
  onFileSelect: (slot: AgreementSlot, file: File) => void;
  onRemove: (slot: AgreementSlot) => void;
  onReplace: (slot: AgreementSlot, file: File) => void;
  onCompare: () => void;
}

export function CompareDocumentsModal({
  isOpen,
  original,
  revised,
  canCompare,
  onClose,
  onFileSelect,
  onRemove,
  onReplace,
  onCompare,
}: CompareDocumentsModalProps) {
  const closeFnRef = useRef(onClose);
  closeFnRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFnRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ───────────────────────────────────────────────── */}
          <motion.div
            key="compare-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="fixed inset-0 z-50"
            style={{
              background: "rgba(4,6,10,0.65)",
              backdropFilter: "blur(20px) saturate(150%)",
              WebkitBackdropFilter: "blur(20px) saturate(150%)",
            }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ── Modal panel ─────────────────────────────────────────────── */}
          {/* max-w-[920px] — wider for generous card breathing room */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-5 pointer-events-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-modal-title"
          >
            <motion.div
              key="compare-panel"
              initial={{ opacity: 0, scale: 0.93, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full pointer-events-auto"
              style={{ maxWidth: 920 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Far ambient glow behind panel */}
              <div
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  inset: -60,
                  borderRadius: 48,
                  background:
                    "radial-gradient(ellipse 60% 50% at 50% -5%, rgba(33,117,217,0.18) 0%, transparent 70%)",
                  filter: "blur(40px)",
                }}
              />

              {/* ── Glass panel — glow ring wrapper ──────────────────────── */}
              {/*
                The outer div is position:relative and clips the rotating
                conic beam to the rounded border edge, exactly like BorderBeam
                on the Composer input box.
              */}
              <div className="relative rounded-3xl" style={{ padding: 1 }}>

                {/* Rotating conic-gradient border beam */}
                <ModalGlowRing />

                {/* Actual glass surface sits inside the 1 px glow wrapper */}
                <div
                  className="relative rounded-3xl overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(168deg, rgba(14,17,23,0.94) 0%, rgba(9,11,16,0.98) 100%)",
                    boxShadow:
                      "0 4px 24px rgba(0,0,0,0.55), " +
                      "0 24px 80px rgba(0,0,0,0.60), " +
                      "inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                {/* Top prismatic sheen */}
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: 1,
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 20%, rgba(33,117,217,0.36) 50%, rgba(255,255,255,0.10) 80%, transparent 100%)",
                  }}
                />

                {/* Noise grain for glass depth */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.032'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "repeat",
                    backgroundSize: "180px",
                    opacity: 0.55,
                    mixBlendMode: "overlay",
                  }}
                />

                {/* ── Content — extra padding for spacious feel ─────────── */}
                <div className="relative z-10 px-9 pt-9 pb-8 sm:px-11 sm:pt-10 sm:pb-9">

                  <CompareHero onClose={onClose} />

                  <div
                    className="my-8"
                    style={{
                      height: 1,
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 15%, rgba(255,255,255,0.07) 85%, transparent 100%)",
                    }}
                  />

                  {/* Upload cards */}
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
                    className="flex flex-col sm:flex-row gap-0 items-stretch"
                  >
                    <AgreementUploadCard
                      slot="original"
                      label={SLOT_CONFIG.original.label}
                      description={SLOT_CONFIG.original.description}
                      file={original}
                      onFileSelect={onFileSelect}
                      onRemove={onRemove}
                      onReplace={onReplace}
                    />

                    <VsDivider bothFilled={Boolean(original && revised)} />

                    <AgreementUploadCard
                      slot="revised"
                      label={SLOT_CONFIG.revised.label}
                      description={SLOT_CONFIG.revised.description}
                      file={revised}
                      onFileSelect={onFileSelect}
                      onRemove={onRemove}
                      onReplace={onReplace}
                    />
                  </motion.div>

                  <CompareFooter
                    original={original}
                    revised={revised}
                    onCompare={onCompare}
                  />
                </div>
                </div>{/* end glass surface */}
              </div>{/* end glow ring wrapper */}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── ModalGlowRing ─────────────────────────────────────────────────────────────
// Same technique as the BorderBeam component on the Composer input box:
// a rotating conic-gradient masked so only the ~1 px border edge is visible.
// Wraps the entire modal panel for a consistent "AI surface" glow.

function ModalGlowRing() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 rounded-3xl pointer-events-none overflow-hidden"
      style={{ zIndex: 2 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          borderRadius: 24,
          // ocean colorVariant — blue dominant, purple accent
          background:
            "conic-gradient(from 0deg, transparent 0%, rgba(33,117,217,0.75) 18%, rgba(139,92,246,0.45) 36%, transparent 55%)",
          opacity: 0.55,
          // Mask: only show the outermost 1–2 px (the border edge)
          WebkitMaskImage: "linear-gradient(#000,#000), linear-gradient(#000,#000)",
          WebkitMaskSize: "calc(100% - 2px) calc(100% - 2px), 100% 100%",
          WebkitMaskPosition: "1px 1px, 0 0",
          WebkitMaskComposite: "xor",
          maskImage: "linear-gradient(#000,#000), linear-gradient(#000,#000)",
          maskSize: "calc(100% - 2px) calc(100% - 2px), 100% 100%",
          maskPosition: "1px 1px, 0 0",
          maskComposite: "exclude",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// ── VsDivider ──────────────────────────────────────────────────────────────────
// A true visual bridge — the connecting lines extend from one card's mid-point
// to the other's, so the VS badge sits exactly between them with lines that
// feel like they're part of both cards.

function VsDivider({ bothFilled }: { bothFilled: boolean }) {
  return (
    <div
      className="flex flex-row sm:flex-col items-center justify-center flex-shrink-0 sm:px-1"
      style={{ width: "auto", minWidth: 48 }}
    >
      {/* Top / left line */}
      <div
        className="flex-1"
        style={{
          background: bothFilled
            ? "linear-gradient(to bottom, transparent 0%, rgba(33,117,217,0.25) 100%)"
            : "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.08) 100%)",
          width: "100%",
          height: "1px",
          // On desktop, becomes a vertical line
          minHeight: 0,
          transition: "background 400ms ease",
        }}
      />

      {/* VS badge */}
      <motion.div
        animate={{
          borderColor: bothFilled
            ? "rgba(33,117,217,0.30)"
            : "rgba(255,255,255,0.08)",
          color: bothFilled
            ? "rgba(33,117,217,0.55)"
            : "rgba(255,255,255,0.18)",
          background: bothFilled
            ? "rgba(33,117,217,0.07)"
            : "rgba(255,255,255,0.03)",
          boxShadow: bothFilled
            ? "0 0 14px -4px rgba(33,117,217,0.35)"
            : "none",
        }}
        transition={{ duration: 0.4 }}
        className="flex-shrink-0 px-2.5 py-1.5 rounded-full select-none"
        style={{
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          lineHeight: 1,
          border: "1px solid",
        }}
      >
        VS
      </motion.div>

      {/* Bottom / right line */}
      <div
        className="flex-1"
        style={{
          background: bothFilled
            ? "linear-gradient(to bottom, rgba(33,117,217,0.25) 0%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 100%)",
          width: "100%",
          height: "1px",
          minHeight: 0,
          transition: "background 400ms ease",
        }}
      />
    </div>
  );
}
