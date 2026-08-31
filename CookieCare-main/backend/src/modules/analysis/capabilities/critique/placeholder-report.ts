import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  PlaceholderReport,
  PlaceholderReportKind,
} from "../../models/critique-report.js";

export const PLACEHOLDER_OUTPUT_PATTERNS = [
  "No analysis package available",
  "Not supported",
  "cannot be analysed",
  "cannot be analyzed",
  "no analysis package exists",
];

function isHeadingsOnly(body: string): boolean {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  if (lines.length > 8) return false;
  return lines.every((line) => /^#+\s/.test(line) || line.length < 4);
}

/**
 * Detect placeholder or empty rendered output (P7 §8).
 */
export function detectPlaceholderOutput(state: AnalysisState): PlaceholderReport {
  const renderUnit = state.plan?.workUnits.find((u) => u.tool === "render_output");
  if (renderUnit && renderUnit.status !== "done") {
    return { detected: false };
  }

  const output = state.renderedOutput?.trim() ?? "";
  const assessments = state.requirementAssessments ?? [];
  const requirements = state.intent?.requirements ?? state.plan?.intent.requirements ?? [];

  if (!output) {
    return {
      detected: true,
      kind: "empty_body",
      detail: "Renderer produced empty output",
    };
  }

  for (const pattern of PLACEHOLDER_OUTPUT_PATTERNS) {
    if (output.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        detected: true,
        kind: "placeholder_text",
        detail: `Output contains placeholder phrase: ${pattern}`,
      };
    }
  }

  if (requirements.length > 0 && assessments.length > 0) {
    const allNotCovered = assessments.every(
      (a) =>
        a.status === "missing" ||
        (a.supportingFindingIds.length === 0 &&
          a.status !== "covered" &&
          a.status !== "partial")
    );
    if (allNotCovered) {
      return {
        detected: true,
        kind: "all_not_covered",
        detail: "All requirement assessments are missing or without supporting findings",
      };
    }
  }

  if (output.length <= 120 && isHeadingsOnly(output)) {
    return {
      detected: true,
      kind: "headings_only",
      detail: "Rendered output contains only headings with no substantive content",
    };
  }

  return { detected: false };
}
