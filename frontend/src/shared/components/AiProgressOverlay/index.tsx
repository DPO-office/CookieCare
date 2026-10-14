import React from "react";
import { ArrowLeft } from "lucide-react";
import { ProcessingOverlay } from "../ProcessingOverlay";

interface AiProgressOverlayProps {
  visible: boolean;
  message?: string;
  error?: string;
  label?: string;
  subtitle?: string;
  /** 0–100 determinate progress; omit for indeterminate. */
  progress?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
  /** Back button shown while processing (not error state) */
  onCancel?: () => void;
  illustration?: "ring" | "scan";
}

export default function AiProgressOverlay({
  visible,
  message,
  error,
  label = "AI Processing",
  subtitle,
  progress,
  onRetry,
  onDismiss,
  onCancel,
  illustration = "ring",
}: AiProgressOverlayProps) {
  return (
    <>
      <ProcessingOverlay
        mode="dialog"
        visible={visible}
        title={label}
        subtitle={subtitle}
        statusMessage={message}
        progress={progress}
        error={error || undefined}
        onRetry={onRetry}
        onDismiss={onDismiss}
        illustration={illustration}
      />
      {visible && !error && onCancel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: "20px 24px",
            pointerEvents: "none",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              pointerEvents: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              borderRadius: 999,
              border: "1.5px solid rgba(16,24,40,0.12)",
              background: "#fff",
              color: "#344054",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(16,24,40,0.08)",
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} strokeWidth={2} />
            Back
          </button>
        </div>
      )}
    </>
  );
}
