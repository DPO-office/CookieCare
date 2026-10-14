// ─── AgreementUploadCard ──────────────────────────────────────────────────────
// Upload card — same glass, glow-ring, and spacing DNA as the LORA AI
// Composer input box.  Each card represents exactly one agreement slot.

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, CheckCircle2, RefreshCw, X } from "lucide-react";
import type { CompareFile, AgreementSlot } from "../types";
import { ACCEPTED_EXTENSIONS } from "../constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgreementUploadCardProps {
  slot: AgreementSlot;
  label: string;
  description: string;
  file: CompareFile | null;
  onFileSelect: (slot: AgreementSlot, file: File) => void;
  onRemove: (slot: AgreementSlot) => void;
  onReplace: (slot: AgreementSlot, file: File) => void;
}

// ── Shared card height — increased for spacious premium feel ─────────────────
const CARD_MIN_H = 272;

// ── Component ─────────────────────────────────────────────────────────────────

export function AgreementUploadCard({
  slot,
  label,
  description,
  file,
  onFileSelect,
  onRemove,
  onReplace,
}: AgreementUploadCardProps) {
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered,  setIsHovered]  = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files)[0];
      if (!dropped) return;
      file ? onReplace(slot, dropped) : onFileSelect(slot, dropped);
    },
    [slot, file, onFileSelect, onReplace],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFileSelect(slot, selected);
      e.target.value = "";
    },
    [slot, onFileSelect],
  );

  const handleReplaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onReplace(slot, selected);
      e.target.value = "";
    },
    [slot, onReplace],
  );

  const glowing = isDragging || isHovered;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3.5">

      {/* ── Slot label ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <span
          className="text-[10.5px] font-bold tracking-widest uppercase select-none"
          style={{ color: "rgba(255,255,255,0.30)", letterSpacing: "0.15em" }}
        >
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
      </div>

      <AnimatePresence mode="wait">

        {/* ══ EMPTY STATE ═══════════════════════════════════════════════════ */}
        {!file && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1"
          >
            <motion.div
              animate={{ scale: isDragging ? 1.016 : 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="relative"
              style={{ minHeight: CARD_MIN_H }}
            >
              {/* Animated glow ring — always on at 18 % opacity, brightens on hover/drag */}
              <GlowRing active={glowing} drag={isDragging} />

              {/* Card surface */}
              <div
                role="button"
                tabIndex={0}
                aria-label={`Upload ${label}`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="relative flex flex-col items-center justify-center rounded-2xl cursor-pointer outline-none overflow-hidden select-none"
                style={{
                  minHeight: CARD_MIN_H,
                  background: isDragging
                    ? "rgba(33,117,217,0.10)"
                    : isHovered
                    ? "rgba(255,255,255,0.038)"
                    : "rgba(8,10,14,0.76)",
                  border: "1px solid",
                  borderColor: isDragging
                    ? "rgba(33,117,217,0.50)"
                    : isHovered
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.075)",
                  boxShadow: isDragging
                    ? "0 0 0 3px rgba(33,117,217,0.16), 0 0 64px -12px rgba(33,117,217,0.32), 0 4px 6px rgba(0,0,0,0.35), 0 28px 60px -18px rgba(0,0,0,0.72)"
                    : isHovered
                    ? "0 0 0 3px rgba(255,255,255,0.04), 0 4px 6px rgba(0,0,0,0.30), 0 28px 60px -18px rgba(0,0,0,0.68)"
                    : "0 4px 6px rgba(0,0,0,0.35), 0 28px 60px -18px rgba(0,0,0,0.72)",
                  transition: "background 240ms ease, border-color 240ms ease, box-shadow 240ms ease",
                }}
              >
                {/* Inner top highlight */}
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                  style={{
                    background: isDragging
                      ? "linear-gradient(90deg, transparent 10%, rgba(33,117,217,0.38) 50%, transparent 90%)"
                      : "linear-gradient(90deg, transparent 20%, rgba(255,255,255,0.06) 50%, transparent 80%)",
                    transition: "background 280ms ease",
                  }}
                />

                {/* Bottom radial bloom */}
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 pointer-events-none"
                  style={{
                    transform: "translateX(-50%)",
                    width: "75%",
                    height: 72,
                    background: isDragging
                      ? "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(33,117,217,0.24) 0%, transparent 100%)"
                      : isHovered
                      ? "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(33,117,217,0.09) 0%, transparent 100%)"
                      : "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(33,117,217,0.04) 0%, transparent 100%)",
                    filter: "blur(14px)",
                    transition: "background 280ms ease",
                  }}
                />

                {/* Upload icon — springs up on drag */}
                <motion.div
                  animate={{ y: isDragging ? -8 : 0, scale: isDragging ? 1.10 : 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className="relative z-10 mb-6"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: isDragging
                        ? "rgba(33,117,217,0.20)"
                        : isHovered
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.045)",
                      border: "1px solid",
                      borderColor: isDragging
                        ? "rgba(33,117,217,0.42)"
                        : isHovered
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0.08)",
                      boxShadow: isDragging
                        ? "0 0 24px -4px rgba(33,117,217,0.45)"
                        : isHovered
                        ? "0 0 14px -6px rgba(33,117,217,0.18)"
                        : "none",
                      transition: "all 240ms ease",
                    }}
                  >
                    <UploadCloud
                      className="w-6 h-6"
                      style={{
                        color: isDragging
                          ? "rgba(33,117,217,1)"
                          : isHovered
                          ? "rgba(255,255,255,0.45)"
                          : "rgba(255,255,255,0.26)",
                        transition: "color 240ms ease",
                      }}
                    />
                  </div>
                </motion.div>

                {/* Copy */}
                <div className="relative z-10 text-center px-8">
                  <p
                    className="text-[13.5px] font-medium mb-2 leading-snug"
                    style={{
                      color: isDragging
                        ? "rgba(255,255,255,0.85)"
                        : isHovered
                        ? "rgba(255,255,255,0.58)"
                        : "rgba(255,255,255,0.45)",
                      transition: "color 240ms ease",
                    }}
                  >
                    {isDragging ? "Drop to upload" : "Drop file here"}
                  </p>

                  {!isDragging && (
                    <p
                      className="text-[12px] mb-6"
                      style={{ color: "rgba(255,255,255,0.20)" }}
                    >
                      or click to browse
                    </p>
                  )}

                  {!isDragging && (
                    <motion.span
                      animate={{
                        background: isHovered
                          ? "rgba(33,117,217,0.18)"
                          : "rgba(33,117,217,0.09)",
                        borderColor: isHovered
                          ? "rgba(33,117,217,0.36)"
                          : "rgba(33,117,217,0.20)",
                      }}
                      transition={{ duration: 0.2 }}
                      className="inline-flex items-center px-4 py-1.5 rounded-lg text-[11.5px] font-medium"
                      style={{
                        border: "1px solid",
                        color: "rgba(33,117,217,0.88)",
                      }}
                    >
                      Browse file
                    </motion.span>
                  )}
                </div>

                {/* Format hint */}
                <p
                  className="absolute bottom-5 left-0 right-0 text-center text-[10px] z-10 select-none"
                  style={{ color: "rgba(255,255,255,0.12)" }}
                >
                  PDF · DOC · DOCX · TXT — up to 50 MB
                </p>
              </div>
            </motion.div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={handleFileChange}
            />
          </motion.div>
        )}

        {/* ══ UPLOADED STATE ════════════════════════════════════════════════ */}
        {file && (
          <motion.div
            key="uploaded"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1"
          >
            {/*
              Uploaded card keeps the same GlowRing but slowed to 6 s and
              clamped to a constant soft blue, communicating "active/ready"
              without being distracting.
            */}
            <div
              className="relative"
              style={{ minHeight: CARD_MIN_H }}
            >
              <GlowRing active={true} drag={false} uploaded={true} />

              <div
                className="relative flex flex-col items-center justify-center rounded-2xl overflow-hidden"
                style={{
                  minHeight: CARD_MIN_H,
                  background: "rgba(8,10,14,0.82)",
                  border: "1px solid rgba(33,117,217,0.22)",
                  boxShadow:
                    "0 0 0 3px rgba(33,117,217,0.08), " +
                    "0 0 48px -14px rgba(33,117,217,0.30), " +
                    "0 4px 6px rgba(0,0,0,0.35), " +
                    "0 28px 60px -18px rgba(0,0,0,0.72)",
                }}
              >
                {/* Top sheen */}
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 10%, rgba(33,117,217,0.32) 50%, transparent 90%)",
                  }}
                />

                {/* Bottom bloom */}
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 pointer-events-none"
                  style={{
                    transform: "translateX(-50%)",
                    width: "75%",
                    height: 72,
                    background:
                      "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(33,117,217,0.12) 0%, transparent 100%)",
                    filter: "blur(14px)",
                  }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center px-8 w-full">

                  {/* File icon + success badge */}
                  <div className="relative mb-6">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 20 }}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{
                        background: "rgba(33,117,217,0.12)",
                        border: "1px solid rgba(33,117,217,0.26)",
                        boxShadow: "0 0 22px -4px rgba(33,117,217,0.30)",
                      }}
                    >
                      <FileText className="w-6 h-6" style={{ color: "rgba(33,117,217,0.88)" }} />
                    </motion.div>

                    {/* Success tick — pops in with a spring */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.22, type: "spring", stiffness: 380, damping: 18 }}
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(34,197,94,0.90)",
                        boxShadow: "0 0 0 2.5px rgba(8,10,14,0.92), 0 0 10px -2px rgba(34,197,94,0.45)",
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />
                    </motion.div>
                  </div>

                  {/* File name + size */}
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14, duration: 0.26 }}
                    className="text-center mb-6 w-full"
                    style={{ maxWidth: 200 }}
                  >
                    <p
                      className="text-[13.5px] font-semibold truncate leading-snug mb-1.5"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      title={file.name}
                    >
                      {file.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                      {formatFileSize(file.size)}
                      <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
                      <span style={{ color: "rgba(34,197,94,0.72)" }}>Ready</span>
                    </p>
                  </motion.div>

                  {/* Actions */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    <GhostButton
                      icon={<RefreshCw className="w-3 h-3" />}
                      label="Replace"
                      onClick={() => replaceInputRef.current?.click()}
                      aria="Replace file"
                    />
                    <GhostButton
                      icon={<X className="w-3 h-3" />}
                      label="Remove"
                      onClick={() => onRemove(slot)}
                      aria="Remove file"
                      danger
                    />
                  </motion.div>
                </div>
              </div>
            </div>

            <input
              ref={replaceInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={handleReplaceChange}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── GlowRing ──────────────────────────────────────────────────────────────────
// Animated conic-gradient border beam — always spinning at a visible opacity.
// Matches the ModalGlowRing on the modal border and BorderBeam on the Composer.
//
// Opacity levels:
//   idle     → 0.55  (always clearly visible — this is the "always on" glow)
//   hover    → 0.80  (noticeably brighter on mouse-over)
//   drag     → 1.00  (full intensity, fastest spin)
//   uploaded → 0.65  (pure blue, slow spin — "ready" state)

function GlowRing({
  active,
  drag,
  uploaded = false,
}: {
  active: boolean;
  drag: boolean;
  uploaded?: boolean;
}) {
  const opacity  = drag ? 1.0 : uploaded ? 0.65 : active ? 0.82 : 0.55;
  const duration = drag ? 2.2 : uploaded ? 5.0 : 3.2;   // 3.2 s = same as modal + Composer
  const gradient = drag
    ? "conic-gradient(from 0deg, transparent 0%, rgba(33,117,217,0.95) 18%, rgba(139,92,246,0.65) 36%, transparent 55%)"
    : uploaded
    ? "conic-gradient(from 0deg, transparent 0%, rgba(33,117,217,0.80) 20%, rgba(33,117,217,0.40) 42%, transparent 62%)"
    : "conic-gradient(from 0deg, transparent 0%, rgba(33,117,217,0.75) 18%, rgba(139,92,246,0.45) 36%, transparent 55%)";

  return (
    <div
      aria-hidden="true"
      className="absolute -inset-[1px] rounded-2xl pointer-events-none overflow-hidden"
      style={{ zIndex: 1 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          borderRadius: 17,
          background: gradient,
          opacity,
          WebkitMaskImage: "linear-gradient(#000,#000), linear-gradient(#000,#000)",
          WebkitMaskSize: "calc(100% - 2px) calc(100% - 2px), 100% 100%",
          WebkitMaskPosition: "1px 1px, 0 0",
          WebkitMaskComposite: "xor",
          maskImage: "linear-gradient(#000,#000), linear-gradient(#000,#000)",
          maskSize: "calc(100% - 2px) calc(100% - 2px), 100% 100%",
          maskPosition: "1px 1px, 0 0",
          maskComposite: "exclude",
          transition: "opacity 280ms ease",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// ── GhostButton ───────────────────────────────────────────────────────────────

function GhostButton({
  icon,
  label,
  onClick,
  aria,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  aria: string;
  danger?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-medium outline-none"
      style={{
        background: danger ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.05)",
        border: "1px solid",
        borderColor: danger ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.09)",
        color: danger ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.38)",
        transition: "background 150ms ease, border-color 150ms ease, color 150ms ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = danger ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.09)";
        el.style.borderColor = danger ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.14)";
        el.style.color       = danger ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.70)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = danger ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.05)";
        el.style.borderColor = danger ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.09)";
        el.style.color       = danger ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.38)";
      }}
      aria-label={aria}
    >
      {icon}
      {label}
    </motion.button>
  );
}
