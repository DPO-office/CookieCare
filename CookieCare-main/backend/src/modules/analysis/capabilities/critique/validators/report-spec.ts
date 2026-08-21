import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import type { ReportSectionId } from "../../../models/intent.js";
import {
  ALL_REPORT_SECTION_IDS,
  normalizeReportSections,
  reportOutputContainsSection,
  reportSectionsInOrder,
} from "../../../prompts/report-sections.js";

const REPORT_SECTIONS = new Set<ReportSectionId>(ALL_REPORT_SECTION_IDS);

function requiredReportSections(state: AnalysisState): ReportSectionId[] {
  const spec = state.plan?.reportSpec;
  if (!spec) return [];
  const assessments = state.requirementAssessments ?? [];
  const sections = normalizeReportSections(spec.sections);
  return sections.filter((section) => {
    switch (section) {
      case "scope":
        return true;
      case "conclusion":
        return true;
      case "requirements_detail":
        return assessments.length > 0;
      case "qualifications":
        return assessments.some(
          (assessment) =>
            assessment.status === "partial" ||
            assessment.status === "cannot_determine"
        );
      case "recommendations":
        return assessments.some((assessment) => assessment.recommendation);
      case "missing_materials":
        return assessments.some(
          (assessment) => assessment.status === "cannot_determine"
        );
      case "chapeau_particulars":
        return assessments.some((assessment) =>
          /(subject|duration|nature|purpose|categor)/i.test(
            assessment.requirementId
          )
        );
      default:
        return false;
    }
  });
}

export function validateReportSpec(
  state: AnalysisState,
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  const spec = state.plan?.reportSpec;
  if (!spec) return;
  const unknown = spec.sections.filter((section) => !REPORT_SECTIONS.has(section));
  const unique = new Set(spec.sections).size === spec.sections.length;
  const contractOk = unknown.length === 0 && unique;
  results.push({
    itemId: "report-spec:contract",
    status: contractOk ? "pass" : "fail",
    evidenceVerified: contractOk,
    workUnitId: "wu-render",
    detail: contractOk
      ? undefined
      : `Invalid ReportSpec sections: ${unknown.join(", ") || "duplicates"}`,
  });
  if (!contractOk) {
    fixes.push({
      workUnitId: "wu-render",
      instruction: "Render only known, unique ReportSpec sections in declared order",
      sourceItemId: "report-spec:contract",
    });
  }

  if (!state.renderedOutput?.trim()) {
    results.push({
      itemId: "report-output:missing",
      status: "missing",
      evidenceVerified: false,
      workUnitId: "wu-render",
      detail: "Renderer produced no output",
    });
    fixes.push({
      workUnitId: "wu-render",
      instruction: "Produce a structurally valid report",
      sourceItemId: "report-output:missing",
    });
    return;
  }

  if ((state.requirementAssessments ?? []).length === 0) return;
  const output = state.renderedOutput ?? "";
  const required = requiredReportSections(state);
  const missing = required.filter((section) => !reportOutputContainsSection(output, section));
  const ordered = reportSectionsInOrder(output, required);
  const outputOk = missing.length === 0 && ordered;
  results.push({
    itemId: "report-output:contract",
    status: outputOk ? "pass" : "fail",
    evidenceVerified: outputOk,
    workUnitId: "wu-render",
    detail: outputOk
      ? undefined
      : missing.length > 0
        ? `Required report sections missing: ${missing.join(", ")}`
        : "Report sections do not follow ReportSpec ordering",
  });
  if (!outputOk) {
    const truncated = Boolean(state.synthesisMeta?.truncated);
    fixes.push({
      workUnitId: "wu-render",
      instruction: truncated
        ? "Prior synthesis truncated; raise ceiling and complete missing ReportSpec sections"
        : "Render required ReportSpec sections using their declared labels and order",
      sourceItemId: "report-output:contract",
      previousAttemptFeedback: truncated
        ? `prior synthesis truncated at maxOutputTokens=${state.synthesisMeta?.maxOutputTokens}; raise ceiling and complete missing sections: ${missing.join(", ") || "ordering"}`
        : undefined,
    });
  }

  // Dynamic outline validation (user-shaped analysis subsections).
  if (outputOk && spec.outline?.length) {
    const outlineAnalysisItems = spec.outline.filter(
      (item) => item.role === "analysis" || item.role === "chapeau_particulars"
    );
    const outputLower = output.toLowerCase();

    const missing: string[] = [];
    const indices: number[] = [];
    for (const item of outlineAnalysisItems) {
      const idx = outputLower.indexOf(item.heading.toLowerCase());
      if (idx < 0) {
        missing.push(item.heading);
      } else {
        indices.push(idx);
      }
    }

    const ordered =
      indices.length === outlineAnalysisItems.length &&
      indices.every((pos, i) => i === 0 || pos > indices[i - 1]!);

    const ok = missing.length === 0 && ordered;
    results.push({
      itemId: "outline-analysis:contract",
      status: ok ? "pass" : "fail",
      evidenceVerified: ok,
      workUnitId: "wu-render",
      detail: ok
        ? undefined
        : missing.length > 0
          ? `Missing outline analysis headings: ${missing.join(", ")}`
          : "Outline analysis headings are not in the declared order",
    });

    if (!ok) {
      fixes.push({
        workUnitId: "wu-render",
        instruction:
          "Under the Requirements detail section, render the analysis outline headings verbatim and in the declared order (use the headings from the PLAN outline).",
        sourceItemId: "outline-analysis:contract",
      });
    }
  }
}
