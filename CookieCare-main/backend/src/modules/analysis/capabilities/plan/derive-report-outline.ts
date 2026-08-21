import type {
  IntentClassification,
  ReportOutlineItem,
  ReportSectionId,
  ReportSectionRole,
} from "../../models/intent.js";
import type { PackageOutlineExtra } from "../../models/evidence-package.js";
import { groupAssessmentsForReport } from "../act/group-assessments.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";

const SCOPE: ReportSectionRole = "scope";
const ANALYSIS: ReportSectionRole = "analysis";
const CHAPEAU: ReportSectionRole = "chapeau_particulars";
const QUALIFICATIONS: ReportSectionRole = "qualifications";
const RECOMMENDATIONS: ReportSectionRole = "recommendations";
const MISSING_MATERIALS: ReportSectionRole = "missing_materials";
const CONCLUSION: ReportSectionRole = "conclusion";

const DEEP_CONTAINS_MISSING_MATERIALS: Set<string> = new Set(["deep"]);

function buildPseudoAssessments(
  requirementIds: string[]
): RequirementAssessment[] {
  return requirementIds.map((id) => ({
    requirementId: id,
    supportingFindingIds: [],
    summary: "",
    status: "covered",
  }));
}

function requirementsForExtra(
  extra: PackageOutlineExtra,
  requirementIds: string[]
): string[] {
  if (!extra.requirementTags?.length) return [];
  return requirementIds.filter((id) =>
    extra.requirementTags!.some(
      (tag) => id === tag || id.includes(tag) || id.startsWith(`${tag}.`)
    )
  );
}

/**
 * Deterministic outline builder driven by ReportSpec sections and package extras.
 */
export function deriveReportOutline(
  intent: IntentClassification,
  reportType: string,
  depth: string,
  sections?: ReportSectionId[],
  outlineExtras: PackageOutlineExtra[] = []
): ReportOutlineItem[] {
  const effectiveDepth = depth ?? intent.depth ?? "standard";
  const isQA = reportType === "qa_answer";
  const isNarrow = effectiveDepth === "narrow";
  const requirementCount = intent.requirements?.length ?? 0;
  const requirementIds = (intent.requirements ?? []).map((r) => r.id);
  const specSections = sections ?? [];

  if (isNarrow || (isQA && requirementCount <= 1)) {
    return [
      {
        id: "scope",
        role: SCOPE,
        heading: "Scope",
        requirementIds: [],
        source: "deterministic",
      },
      {
        id: "conclusion",
        role: CONCLUSION,
        heading: "Conclusion",
        requirementIds: [],
        source: "deterministic",
      },
    ];
  }

  const used = new Set<string>();
  const outline: ReportOutlineItem[] = [];

  // Always emit Scope alone. Legacy scope_and_conclusion expands to Scope here
  // and a separate Conclusion at the end — never a combined early verdict.
  if (specSections.includes("scope") || specSections.includes("scope_and_conclusion")) {
    outline.push({
      id: "scope",
      role: SCOPE,
      heading: "Scope",
      requirementIds: [],
      source: "deterministic",
    });
  }

  for (const extra of outlineExtras) {
    const memberIds = requirementsForExtra(extra, requirementIds);
    if (memberIds.length === 0) continue;
    const role =
      extra.heading.toLowerCase().includes("particular") ||
      extra.heading.toLowerCase().includes("chapeau")
        ? CHAPEAU
        : ANALYSIS;
    outline.push({
      id: `analysis.${extra.heading.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      role,
      heading: extra.heading,
      requirementIds: memberIds,
      source: "deterministic",
    });
    for (const id of memberIds) used.add(id);
  }

  const remaining = requirementIds.filter((id) => !used.has(id));
  const analysisGroups = groupAssessmentsForReport(
    buildPseudoAssessments(remaining)
  );

  for (const group of analysisGroups) {
    if (group.members.length === 0) continue;
    const memberIds = group.members.map((m) => m.requirementId);
    outline.push({
      id: `analysis.${group.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      role: ANALYSIS,
      heading: group.title,
      requirementIds: memberIds,
      source: "deterministic",
    });
  }

  if (
    specSections.includes("qualifications") ||
    effectiveDepth !== "narrow"
  ) {
    outline.push({
      id: "qualifications",
      role: QUALIFICATIONS,
      heading: "Qualifications",
      requirementIds: [],
      source: "deterministic",
    });
  }

  if (specSections.includes("recommendations") || effectiveDepth !== "narrow") {
    outline.push({
      id: "recommendations",
      role: RECOMMENDATIONS,
      heading: "Recommendations",
      requirementIds: [],
      source: "deterministic",
    });
  }

  if (
    DEEP_CONTAINS_MISSING_MATERIALS.has(effectiveDepth) &&
    specSections.includes("missing_materials")
  ) {
    outline.push({
      id: "missing_materials",
      role: MISSING_MATERIALS,
      heading: "Missing materials",
      requirementIds: [],
      source: "deterministic",
    });
  }

  if (
    specSections.includes("conclusion") ||
    specSections.includes("scope_and_conclusion")
  ) {
    outline.push({
      id: "conclusion",
      role: CONCLUSION,
      heading: "Conclusion",
      requirementIds: [],
      source: "deterministic",
    });
  }

  return outline;
}
