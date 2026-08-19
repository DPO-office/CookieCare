import type {
  IntentClassification,
  ReportOutlineItem,
  ReportSectionRole,
} from "../../models/intent.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { groupAssessmentsForReport } from "../act/group-assessments.js";

const SCOPE: ReportSectionRole = "scope";
const ANALYSIS: ReportSectionRole = "analysis";
const CHAPEAU: ReportSectionRole = "chapeau_particulars";
const QUALIFICATIONS: ReportSectionRole = "qualifications";
const RECOMMENDATIONS: ReportSectionRole = "recommendations";
const MISSING_MATERIALS: ReportSectionRole = "missing_materials";
const CONCLUSION: ReportSectionRole = "conclusion";

const DEEP_CONTAINS_MISSING_MATERIALS: Set<string> = new Set(["deep"]);

function hasAny(idSet: Set<string>, ids: string[]): boolean {
  return ids.some((id) => idSet.has(id));
}

function pickExisting(idSet: Set<string>, ids: string[]): string[] {
  return ids.filter((id) => idSet.has(id));
}

function buildPseudoAssessments(
  requirementIds: string[]
): RequirementAssessment[] {
  // Used ONLY for deterministic theme clustering (title generation).
  // Status/recommendation fields are not semantically meaningful at PLAN time.
  return requirementIds.map((id) => ({
    requirementId: id,
    supportingFindingIds: [],
    summary: "",
    status: "covered",
  }));
}

/**
 * Deterministic outline builder for synthesis.
 *
 * Current implementation focuses on GDPR Art 28-style compliance memos:
 * it splits the analysis into (1) Art 28(3) chapeau particulars and
 * (2) Mandatory Art 28(3) clauses, then clusters any remaining requirements.
 */
export function deriveReportOutline(
  intent: IntentClassification,
  reportType: string,
  depth: string
): ReportOutlineItem[] {
  const effectiveDepth = depth ?? intent.depth ?? "standard";
  const isQA = reportType === "qa_answer";
  const isNarrow = effectiveDepth === "narrow";

  const requirementIds = (intent.requirements ?? []).map((r) => r.id);
  const idSet = new Set(requirementIds);

  // For narrow / Q&A, keep the outline minimal.
  if (isQA || isNarrow) {
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

  // Art 28(3) chapeau cluster (particulars framing).
  const CHAPEAU_REQ_IDS = [
    "subject_matter",
    "duration",
    "nature_and_purpose",
    "nature_purpose",
    "categories_of_data",
    "data_categories",
    "categories_of_data_subjects",
    "data_subject_categories",
    "data_subject_categories",
    "controller_obligations_rights",
    "controller_obligations_and_rights",
  ];

  // Mandatory Art 28(3) clauses cluster.
  const MANDATORY_REQ_IDS = [
    "mandatory_article_28_3_clauses",
    "mandatory_article28_clauses",
    "clause_adequacy",
  ];

  const chapeauIds = pickExisting(idSet, CHAPEAU_REQ_IDS);
  const mandatoryIds = pickExisting(idSet, MANDATORY_REQ_IDS);

  const used = new Set<string>([...chapeauIds, ...mandatoryIds]);
  const remaining = requirementIds.filter((id) => !used.has(id));

  const analysisGroups = groupAssessmentsForReport(buildPseudoAssessments(remaining));

  const outline: ReportOutlineItem[] = [
    {
      id: "scope",
      role: SCOPE,
      heading: "Scope",
      requirementIds: [],
      source: "deterministic",
    },
  ];

  if (chapeauIds.length > 0) {
    outline.push({
      id: "analysis.chapeau_particulars",
      role: CHAPEAU,
      heading: "Processing particulars (Art 28(3) chapeau)",
      requirementIds: chapeauIds,
      source: "deterministic",
    });
  }

  if (mandatoryIds.length > 0) {
    outline.push({
      id: "analysis.mandatory_article28_3_clauses",
      role: ANALYSIS,
      heading: "Mandatory Article 28(3) clauses",
      requirementIds: mandatoryIds,
      source: "deterministic",
    });
  }

  // Any remaining requirements become additional analysis subsections.
  for (const group of analysisGroups) {
    if (group.members.length === 0) continue;
    const memberIds = group.members.map((m) => m.requirementId);
    // Avoid accidentally duplicating the explicit Art 28 clusters above.
    if (memberIds.every((id) => used.has(id))) continue;

    outline.push({
      id: `analysis.${group.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      role: ANALYSIS,
      heading: group.title,
      requirementIds: memberIds,
      source: "deterministic",
    });
  }

  outline.push({
    id: "qualifications",
    role: QUALIFICATIONS,
    heading: "Qualifications",
    requirementIds: [],
    source: "deterministic",
  });
  outline.push({
    id: "recommendations",
    role: RECOMMENDATIONS,
    heading: "Recommendations",
    requirementIds: [],
    source: "deterministic",
  });

  if (DEEP_CONTAINS_MISSING_MATERIALS.has(effectiveDepth)) {
    outline.push({
      id: "missing_materials",
      role: MISSING_MATERIALS,
      heading: "Missing materials",
      requirementIds: [],
      source: "deterministic",
    });
  }

  outline.push({
    id: "conclusion",
    role: CONCLUSION,
    heading: "Conclusion",
    requirementIds: [],
    source: "deterministic",
  });

  return outline;
}

