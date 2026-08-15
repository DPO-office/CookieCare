import React from "react";
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
  illustration = "ring",
}: AiProgressOverlayProps) {
  return (
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
  );
}
