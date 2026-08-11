/**
 * ChatMessage — User message in the conversation thread.
 *
 * Right-aligned, clean bubble. The user query is shown plainly — no decoration,
 * no avatar. Label above. Follows the RandTrust Design System.
 */
import React from "react";
import { motion } from "motion/react";

interface ChatMessageProps {
  content: string;
  className?: string;
}

export function ChatMessage({ content, className }: ChatMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-end gap-2 ${className ?? ""}`}
    >
      {/* Sender label */}
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#9CA3AF",
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }}
        aria-hidden="true"
      >
        You
      </span>

      {/* Bubble */}
      <div
        className="max-w-[72%] px-4 py-3 rounded-2xl rounded-tr-sm text-[14px] select-text"
        style={{
          background: "#2175D9",
          color: "#FFFFFF",
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          lineHeight: 1.6,
          letterSpacing: "-0.005em",
        }}
      >
        {content}
      </div>
    </motion.div>
  );
}

export default ChatMessage;
