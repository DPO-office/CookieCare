import React from "react";
import { ProcessingOverlay } from "../../../shared/components/ProcessingOverlay";
import type { AnalysisStep } from "../types";

interface AnalyzingStateProps {
  fileNames: string[];
  steps: AnalysisStep[];
}

export function AnalyzingState({ fileNames, steps }: AnalyzingStateProps) {
  const files =
    fileNames.length > 0
      ? fileNames.map((name) => ({ name, badge: "Reviewing" }))
      : [{ name: "Website scan in progress", badge: "Scanning" }];

  return (
    <ProcessingOverlay
      mode="page"
      title="Analyzing vendor documents"
      subtitle="Reviewing the vendor's privacy, security and compliance documentation. This usually takes a few moments depending on the number and size of uploaded files."
      estimatedTime="15–60 seconds"
      steps={steps}
      files={files}
    />
  );
}
