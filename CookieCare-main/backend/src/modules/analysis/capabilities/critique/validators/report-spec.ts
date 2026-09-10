import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import type { ReportSectionId } from "../../../models/intent.js";
import {
  ALL_REPORT_SECTION_IDS,
  isAnalysisOutlineRole,
  normalizeReportSections,
  outlineItemSectionId,
  reportOutputContainsSection,
  reportSectionsInOrder,
} from "../../../prompts/report-sections.js";

const REPORT_SECTIONS = new Set<ReportSectionId>(ALL_REPORT_SECTION_IDS);

const INTERNAL_ID_LEAK =
  /\b(?:wu-[a-z0-9_-]+|f_(?:pkg_|extract_|render_)[a-z0-9_-]+|workUnitId|packageId|requirementId)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function outlineCoversAnalysisSection(
  state: AnalysisState,
  section: ReportSectionId
): boolean {
  return (state.plan?.reportSpec?.outline ?? []).some(
    (item) =>
      isAnalysisOutlineRole(item.role) && outlineItemSectionId(item) === section
  );
}

function h2Index(output: string, heading: string): number {
  const re = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = re.exec(output);
  return match?.index ?? -1;
}

function requiredReportSections(state: AnalysisState): ReportSectionId[] {
  const spec = state.plan?.reportSpec;
  if (!spec) return [];
  const assessments = state.requirementAssessments ?? [];
  const sections = normalizeReportSections(spec.sections);
  return sections.filter((section) => {
    switch (section) {
      case "scope":
      case "executive_summary":
      case "conclusion":
      case "evidence":
        return true;
      case "requirements_detail":
      case "requirements_matrix":
      case "key_findings":
      case "chapeau_particulars":
        if (outlineCoversAnalysisSection(state, section)) return false;
        return assessments.length > 0;
      case "material_gaps":
        return assessments.some(
          (assessment) =>
            assessment.status === "partial" || assessment.status === "missing"
        );
      case "qualifications":
      case "limitations":
        return assessments.some(
          (assessment) =>
            assessment.status === "partial" ||
            assessment.status === "cannot_determine"
        );
      case "recommendations":
        return assessments.some(
          (assessment) =>
            (assessment.status === "missing" || assessment.status === "partial") &&
            Boolean(assessment.recommendation)
        );
      case "missing_materials":
        return assessments.some(
          (assessment) =>
            Boolean(assessment.dependency?.document) ||
            assessment.judgement?.evidenceState === "incorporated"
        );
      case "risk_summary":
        return (state.findings ?? []).some(
          (finding) => finding.kind === "risk" && finding.visibility !== "internal"
        );
      default:
        return false;
    }
  });
}

function leakedInternalIds(output: string): string[] {
  const found = output.match(new RegExp(INTERNAL_ID_LEAK.source, "gi")) ?? [];
  return [...new Set(found)];
}

function emptyRequiredBodies(
  output: string,
  headings: string[]
): string[] {
  const empty: string[] = [];
  for (const heading of headings) {
    const re = new RegExp(
      `^##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|$)`,
      "im"
    );
    const match = output.match(re);
    if (!match) continue;
    if (!match[1] || match[1].trim().length === 0) empty.push(heading);
  }
  return empty;
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
  const compactBluf =
    /^##\s+Bottom line\s*$/im.test(output) &&
    /^##\s+Requirements at a glance\s*$/im.test(output);
  const required = requiredReportSections(state);
  const compactSectionSatisfied = (section: ReportSectionId): boolean => {
    if (!compactBluf) return false;
    if (
      section === "executive_summary" ||
      section === "conclusion" ||
      section === "scope"
    ) {
      return /^##\s+Bottom line\s*$/im.test(output);
    }
    if (
      section === "requirements_matrix" ||
      section === "requirements_detail" ||
      section === "key_findings" ||
      section === "chapeau_particulars"
    ) {
      return /^##\s+Requirements at a glance\s*$/im.test(output);
    }
    if (
      section === "material_gaps" ||
      section === "recommendations" ||
      section === "qualifications" ||
      section === "limitations"
    ) {
      return /^##\s+What needs attention\s*$/im.test(output);
    }
    return false;
  };
  const missing = required.filter(
    (section) =>
      !compactSectionSatisfied(section) &&
      !reportOutputContainsSection(output, section)
  );
  // The compact BLUF renderer has a deliberate fixed reading order and
  // collapses semantic ReportSpec sections into non-duplicative blocks.
  const ordered = compactBluf || reportSectionsInOrder(output, required);
  const leaks = leakedInternalIds(output);
  const outputOk = missing.length === 0 && ordered && leaks.length === 0;
  const compactHint =
    "BLUF report layout is a projection: "
    + "use 'Bottom line' for scope/executive summary/conclusion, "
    + "'Requirements at a glance' for requirements/evidence blocks, and "
    + "'What needs attention' for qualifications/limitations/recommendations.";
  results.push({
    itemId: "report-output:contract",
    status: outputOk ? "pass" : "fail",
    evidenceVerified: outputOk,
    workUnitId: "wu-render",
    detail: outputOk
      ? undefined
      : leaks.length > 0
        ? `Internal identifiers leaked in report: ${leaks.join(", ")}`
        : missing.length > 0
          ? `${compactBluf ? compactHint + " " : ""}Required report sections missing: ${missing.join(", ")}`
          : "Report sections do not follow ReportSpec ordering",
  });
  if (!outputOk) {
    const truncated = Boolean(state.synthesisMeta?.truncated);
    fixes.push({
      workUnitId: "wu-render",
      instruction: truncated
        ? "Prior synthesis truncated; raise ceiling and complete missing ReportSpec sections"
        : compactBluf
          ? `BLUF renderer: keep a strict section projection (${compactHint}) and ensure all required requirement rows are present.`
          : "Render required ReportSpec sections using their declared labels and order",
      sourceItemId: "report-output:contract",
      previousAttemptFeedback: truncated
        ? `prior synthesis truncated at maxOutputTokens=${state.synthesisMeta?.maxOutputTokens}; raise ceiling and complete missing sections: ${missing.join(", ") || "ordering"}`
        : undefined,
    });
  }

  if (spec.outline?.length && !compactBluf) {
    const outlineAnalysisItems = spec.outline.filter((item) =>
      isAnalysisOutlineRole(item.role)
    );
    const missingHeadings: string[] = [];
    const missingIds: string[] = [];
    const indices: number[] = [];
    for (const item of outlineAnalysisItems) {
      const idx = h2Index(output, item.heading);
      if (idx < 0) {
        missingHeadings.push(item.heading);
        missingIds.push(item.id);
      } else {
        indices.push(idx);
      }
    }

    const empty = emptyRequiredBodies(
      output,
      outlineAnalysisItems.map((item) => item.heading)
    );
    const orderedHeadings =
      indices.length === outlineAnalysisItems.length &&
      indices.every((pos, i) => i === 0 || pos > indices[i - 1]!);

    const ok = missingHeadings.length === 0 && orderedHeadings && empty.length === 0;
    results.push({
      itemId: "outline-analysis:contract",
      status: ok ? "pass" : "fail",
      evidenceVerified: ok,
      workUnitId: "wu-render",
      detail: ok
        ? undefined
        : missingHeadings.length > 0
          ? `Missing outline analysis headings: ${missingHeadings.join(", ")}`
          : empty.length > 0
            ? `Empty outline sections: ${empty.join(", ")}`
            : "Outline analysis headings are not in the declared order",
    });

    if (!ok) {
      const retrySectionIds =
        missingIds.length > 0
          ? missingIds
          : empty
              .map((heading) =>
                outlineAnalysisItems.find((item) => item.heading === heading)?.id
              )
              .filter((id): id is string => Boolean(id));
      fixes.push({
        workUnitId: "wu-render",
        instruction:
          "Render the analysis outline headings as top-level ## sections verbatim and in the declared order.",
        sourceItemId: "outline-analysis:contract",
        retrySectionIds: retrySectionIds.length > 0 ? retrySectionIds : undefined,
      });
    }
  }
}

export function outlineSectionIds(state: AnalysisState): string[] {
  return (state.plan?.reportSpec?.outline ?? []).map((item) => item.id);
}
