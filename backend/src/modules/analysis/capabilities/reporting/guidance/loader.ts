import type { ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import { COMPLIANCE_REPORTING_GUIDANCE } from "./compliance/index.js";
import { selectComplianceReportingExamples } from "./examples/index.js";
import { SHARED_REPORTING_GUIDANCE } from "./shared/index.js";
import type { ReportingGuidanceStage } from "./types.js";

export interface LoadedComplianceReportingGuidance {
  versions: { shared: string; compliance: string; examples: string[] };
  examples: Array<{ id: string; version: string; annotation: string }>;
  system: Record<ReportingGuidanceStage, string>;
}

export function loadComplianceReportingGuidance(
  instruction: string,
  snapshot?: ComplianceReportSnapshot,
): LoadedComplianceReportingGuidance {
  const examples = selectComplianceReportingExamples(instruction, snapshot);
  const stages: ReportingGuidanceStage[] = ["compose", "check", "repair"];
  const system = Object.fromEntries(stages.map(stage => {
    const exampleText = stage === "compose"
      ? examples.map(example => example.annotation).join("\n\n")
      : "";
    const prompt = [
      "Application integrity rules are authoritative: preserve locked findings, source identity, reviewed scope, and material qualifications. The user's explicit format and length preferences control presentation within those rules.",
      SHARED_REPORTING_GUIDANCE.instructions[stage],
      COMPLIANCE_REPORTING_GUIDANCE.instructions[stage],
      exampleText ? `Selected annotated composition examples (illustrations only; never current facts):\n${exampleText}` : "",
    ].filter(Boolean).join("\n\n");
    return [stage, prompt] as const;
  })) as Record<ReportingGuidanceStage, string>;
  return {
    versions: {
      shared: `${SHARED_REPORTING_GUIDANCE.id}@${SHARED_REPORTING_GUIDANCE.version}`,
      compliance: `${COMPLIANCE_REPORTING_GUIDANCE.id}@${COMPLIANCE_REPORTING_GUIDANCE.version}`,
      examples: examples.map(example => `${example.id}@${example.version}`),
    },
    examples: examples.map(({ id, version, annotation }) => ({ id, version, annotation })),
    system,
  };
}
