import React from "react";
import { Brain } from "lucide-react";
import { ProcessingOverlay } from "../../../shared/components/ProcessingOverlay";
import type { AnalysisStep } from "../types";

interface EthicsAnalyzingStateProps {
  fileNames: string[];
  steps: AnalysisStep[];
}

export function EthicsAnalyzingState({ fileNames, steps }: EthicsAnalyzingStateProps) {
  const primaryName = fileNames[0] ?? "AI Documentation";
  const extraCount  = fileNames.length > 1 ? fileNames.length - 1 : 0;
  const displayName = extraCount > 0 ? `${primaryName} +${extraCount} more` : primaryName;

  return (
    <ProcessingOverlay
      mode="page"
      title="Evaluating AI Ethics"
      subtitle="Evaluating your AI system against responsible AI principles and governance best practices. This typically takes a few moments depending on the uploaded documentation."
      estimatedTime="15–45 seconds"
      keepOpenNote="Keep this tab open until assessment is complete"
      steps={steps}
      files={[{ name: displayName, subLabel: "AI Documentation", badge: "Evaluating" }]}
      fileIcon={<Brain className="w-4 h-4 text-blue-600" />}
    />
  );
}
