import React from "react";
import { ProcessingOverlay } from "../../../shared/components/ProcessingOverlay";
import type { AnalysisStep } from "../types";

interface DPAAnalyzingStateProps {
  fileName: string;
  steps: AnalysisStep[];
}

export function DPAAnalyzingState({ fileName, steps }: DPAAnalyzingStateProps) {
  return (
    <ProcessingOverlay
      mode="page"
      title="Analyzing your DPA"
      subtitle="Reviewing your agreement against GDPR requirements and compliance best practices."
      estimatedTime="10–30 seconds"
      steps={steps}
      files={[{ name: fileName, subLabel: "Data Processing Agreement", badge: "Reviewing" }]}
    />
  );
}
