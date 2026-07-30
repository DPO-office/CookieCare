/**
 * AiProgressOverlay — thin compatibility shim over ProcessingOverlay.
 *
 * All existing call-sites (CookieScanner, VulnerabilityScanner,
 * InteractAnalyze, DraftingHub, AskAILawyer) continue to work unchanged.
 */
import React from "react";
import { ProcessingOverlay } from "../ProcessingOverlay";

interface AiProgressOverlayProps {
  visible: boolean;
  message?: string;
  error?: string;
  label?: string;
  /** 0–100 determinate progress; omit for indeterminate. */
  progress?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function AiProgressOverlay({
  visible,
  message,
  error,
  label = "AI Processing",
  progress,
  onRetry,
  onDismiss,
}: AiProgressOverlayProps) {
  return (
    <ProcessingOverlay
      mode="dialog"
      visible={visible}
      title={label}
      statusMessage={message}
      progress={progress}
      error={error || undefined}
      onRetry={onRetry}
      onDismiss={onDismiss}
    />
  );
}
