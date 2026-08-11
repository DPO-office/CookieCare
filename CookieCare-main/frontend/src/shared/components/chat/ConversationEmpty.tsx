/**
 * ConversationEmpty — Empty / landing state for AI conversation views.
 *
 * Large centered headline, generous whitespace, composer slot, suggestions.
 * The composer is the hero — headline and suggestions support it.
 * Follows the RandTrust Design System.
 */
import React from "react";
import { motion } from "motion/react";

interface ConversationEmptyProps {
  /** Small badge above the headline */
  badge?: string;
  headline: string;
  subtext?: string;
  /** Composer input rendered below headline/subtext */
  composerSlot?: React.ReactNode;
  /** Grid of suggestion cards */
  suggestionsSlot?: React.ReactNode;
  suggestionsLabel?: string;
}

export function ConversationEmpty({
  badge,
  headline,
  subtext,
  composerSlot,
  suggestionsSlot,
  suggestionsLabel = "Suggested questions",
}: ConversationEmptyProps) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl flex flex-col items-center"
        >
          {/* Badge */}
          {badge && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="mb-5"
            >
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest"
                style={{
                  background: "#EBF2FD",
                  color: "#1A5BAD",
                  border: "1px solid #BFDBFE",
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  letterSpacing: "0.08em",
                }}
              >
                {badge}
              </span>
            </motion.div>
          )}

          {/* Headline — display scale, the most prominent element on the page */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08 }}
            className="text-center mb-4"
            style={{
              fontSize: "clamp(26px, 4vw, 34px)",
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: "-0.03em",
              color: "#111827",
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {typeof headline === "string"
              ? headline.split("\n").map((line, i, arr) => (
                  <React.Fragment key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </React.Fragment>
                ))
              : headline}
          </motion.h1>

          {/* Subtext */}
          {subtext && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.14 }}
              className="text-center leading-relaxed mb-9 max-w-lg"
              style={{
                fontSize: "14px",
                color: "#6B7280",
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
              }}
            >
              {subtext}
            </motion.p>
          )}

          {/* Composer slot — the focal point */}
          {composerSlot && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.18 }}
              className="w-full mb-10"
            >
              {composerSlot}
            </motion.div>
          )}

          {/* Suggestions */}
          {suggestionsSlot && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.26 }}
              className="w-full"
            >
              <p
                className="text-center mb-4"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9CA3AF",
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {suggestionsLabel}
              </p>
              {suggestionsSlot}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default ConversationEmpty;
