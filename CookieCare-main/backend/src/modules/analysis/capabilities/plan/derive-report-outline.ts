import type {
  IntentClassification,
  ReportOutlineItem,
  ReportSectionId,
  ReportSectionRole,
} from "../../models/intent.js";
import type { PackageOutlineExtra } from "../../models/evidence-package.js";
import { groupAssessmentsForReport } from "../act/group-assessments.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import {
  isAnalysisOutlineRole,
  roleForSectionId,
  suggestedHeading,
} from "../../prompts/report-sections.js";
import {
  canonicalRequirementId,
  collapseToCanonicalRequirementIds,
  requirementIdsEquivalent,
} from "../../shared/requirement-identity.js";

function specHas(sections: ReportSectionId[], ...ids: ReportSectionId[]): boolean {
  const set = new Set(sections);
  return ids.some((id) => set.has(id));
}

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
  if (!extra.requirementTags?.length) return extra.artifactTypes?.length ? [] : [];
  const matched = requirementIds.filter((id) =>
    extra.requirementTags!.some((tag) => idMatchesRequirementTag(id, tag))
  );
  // Outline joins assessments by id — store PLAN-shaped canonical keys so
  // package-native findings (`duration`) meet PLAN assessments.
  return collapseToCanonicalRequirementIds(matched, { expandUmbrellas: false });
}

/** Tag match with separators — `subject_matter` must not swallow `pkg.subject_matter_defined`. */
export function idMatchesRequirementTag(id: string, tag: string): boolean {
  if (!tag) return false;
  if (id === tag) return true;
  if (requirementIdsEquivalent(id, tag)) return true;
  if (id.startsWith(`${tag}.`) || id.startsWith(`${tag}_`)) return true;
  if (id.includes(`.${tag}.`) || id.endsWith(`.${tag}`)) return true;
  const canon = canonicalRequirementId(id);
  if (canon === tag || canon.startsWith(`${tag}_`) || canon.startsWith(`${tag}.`)) {
    return true;
  }
  return false;
}

function extraRole(extra: PackageOutlineExtra): ReportSectionRole {
  if (extra.sectionId) return roleForSectionId(extra.sectionId);
  const heading = extra.heading.toLowerCase();
  if (heading.includes("particular") || heading.includes("chapeau")) {
    return "chapeau_particulars";
  }
  return "analysis";
}

function extraSectionId(extra: PackageOutlineExtra): ReportSectionId {
  if (extra.sectionId) return extra.sectionId;
  const role = extraRole(extra);
  if (role === "chapeau_particulars") return "chapeau_particulars";
  return "key_findings";
}

function remainingSectionId(sections: ReportSectionId[]): ReportSectionId {
  if (specHas(sections, "key_findings")) return "key_findings";
  if (specHas(sections, "requirements_matrix")) return "requirements_matrix";
  return "requirements_detail";
}

function openingItem(sections: ReportSectionId[]): ReportOutlineItem {
  const useSummary = specHas(sections, "executive_summary");
  const sectionId: ReportSectionId = useSummary ? "executive_summary" : "scope";
  return {
    id: sectionId,
    role: roleForSectionId(sectionId),
    sectionId,
    heading: suggestedHeading(sectionId),
    requirementIds: [],
    source: "deterministic",
  };
}

function staticItem(
  sectionId: ReportSectionId,
  requirementIds: string[] = []
): ReportOutlineItem {
  return {
    id: sectionId,
    role: roleForSectionId(sectionId),
    sectionId,
    heading: suggestedHeading(sectionId),
    requirementIds,
    source: "deterministic",
  };
}

/**
 * Deterministic outline builder driven by ReportSpec sections and package extras.
 * Extras become top-level sections. Qualifications/recommendations are emitted
 * only when present on the spec — not because depth is standard/deep.
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
  const requirementIds = (intent.requirements ?? []).map((r) => r.id);
  const specSections = sections ?? [];

  // Q&A has a different reading order from a memo: answer first, proof second,
  // then only material qualifications. Reuse the existing key-findings role
  // so the answer receives the verified findings, but give it the user-facing
  // heading that matches the task.
  if (isQA) {
    const outline: ReportOutlineItem[] = [
      {
        id: "answer",
        role: "key_findings",
        sectionId: "key_findings",
        heading: "Answer",
        requirementIds,
        source: "deterministic",
      },
    ];
    if (specSections.length === 0 || specHas(specSections, "evidence")) {
      outline.push(staticItem("evidence", requirementIds));
    }
    if (specHas(specSections, "limitations")) {
      outline.push(staticItem("limitations", requirementIds));
    } else if (specHas(specSections, "qualifications")) {
      outline.push(staticItem("qualifications", requirementIds));
    }
    return outline;
  }

  if (isNarrow) {
    const outline: ReportOutlineItem[] = [];
    if (specHas(specSections, "executive_summary", "scope", "scope_and_conclusion")) {
      outline.push(openingItem(specSections));
    } else {
      outline.push(openingItem([]));
    }
    if (specHas(specSections, "evidence")) {
      outline.push(staticItem("evidence"));
    }
    outline.push(staticItem("conclusion"));
    return outline;
  }

  if (intent.compound && intent.subIntents.length > 1) {
    const outline: ReportOutlineItem[] = [openingItem(specSections)];
    for (const [index, facet] of intent.subIntents.entries()) {
      const facetRequirementIds = (facet.requirements ?? []).map(
        (requirement) => requirement.id
      );
      const sectionId: ReportSectionId =
        facet.operation === "risk_flag"
          ? "risk_summary"
          : facet.operation === "compare"
            ? "comparison"
            : "requirements_detail";
      outline.push({
        id: `facet.${index + 1}`,
        role: roleForSectionId(sectionId),
        sectionId,
        heading: facet.description?.trim() || `Analysis ${index + 1}`,
        requirementIds: facetRequirementIds,
        source: "deterministic",
      });
    }
    if (specHas(specSections, "recommendations")) {
      outline.push(staticItem("recommendations"));
    }
    outline.push(staticItem("conclusion"));
    return outline;
  }

  const used = new Set<string>();
  const outline: ReportOutlineItem[] = [];

  if (
    specSections.length === 0 ||
    specHas(specSections, "scope", "executive_summary", "scope_and_conclusion")
  ) {
    outline.push(openingItem(specSections));
  }

  for (const extra of outlineExtras) {
    const memberIds = requirementsForExtra(extra, requirementIds);
    if (memberIds.length === 0 && !extra.artifactTypes?.length) continue;
    const sectionId = extraSectionId(extra);
    outline.push({
      id: `analysis.${extra.heading.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      role: extraRole(extra),
      sectionId,
      heading: extra.heading,
      requirementIds: memberIds,
      artifactTypes: extra.artifactTypes,
      source: "deterministic",
    });
    for (const id of memberIds) used.add(id);
    // Also mark PLAN source ids as used so remainder does not duplicate them.
    for (const planId of requirementIds) {
      if (memberIds.includes(canonicalRequirementId(planId))) used.add(planId);
    }
  }

  const remaining = requirementIds.filter((id) => {
    if (used.has(id)) return false;
    if (used.has(canonicalRequirementId(id))) return false;
    return true;
  });
  const remainingCanonical = collapseToCanonicalRequirementIds(remaining, {
    expandUmbrellas: false,
  }).filter((id) => !used.has(id));
  const remainderId = remainingSectionId(specSections);
  const authoredAnalysisCount = outline.filter((item) =>
    isAnalysisOutlineRole(item.role)
  ).length;

  // Avoid theme-group explosion: package extras already shaped the middle of the
  // report. Leftover requirements become at most one additional analysis section.
  // When there are no extras, keep a small number of theme groups (not one per id).
  if (remainingCanonical.length > 0) {
    const analysisGroups = groupAssessmentsForReport(
      buildPseudoAssessments(remainingCanonical)
    ).filter((group) => group.members.length > 0);
    const maxThemeSections = authoredAnalysisCount > 0 ? 1 : 3;
    const groupsToEmit =
      analysisGroups.length <= maxThemeSections
        ? analysisGroups
        : [
            ...analysisGroups.slice(0, maxThemeSections - 1),
            {
              title:
                authoredAnalysisCount > 0
                  ? suggestedHeading(remainderId)
                  : "Key findings",
              members: analysisGroups
                .slice(maxThemeSections - 1)
                .flatMap((group) => group.members),
              status: "adequate" as const,
            },
          ];

    for (const group of groupsToEmit) {
      const memberIds = group.members.map((m) => m.requirementId);
      outline.push({
        id: `analysis.${group.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        role: roleForSectionId(remainderId),
        sectionId: remainderId,
        heading: group.title,
        requirementIds: memberIds,
        source: "deterministic",
      });
    }
  }

  if (specHas(specSections, "evidence")) {
    outline.push(staticItem("evidence"));
  }
  if (specHas(specSections, "material_gaps")) {
    outline.push(staticItem("material_gaps"));
  }
  if (specHas(specSections, "risk_summary")) {
    outline.push(staticItem("risk_summary"));
  }
  if (specHas(specSections, "limitations")) {
    outline.push(staticItem("limitations"));
  } else if (specHas(specSections, "qualifications")) {
    outline.push(staticItem("qualifications"));
  }
  if (specHas(specSections, "recommendations")) {
    outline.push(staticItem("recommendations"));
  }
  if (specHas(specSections, "missing_materials")) {
    outline.push(staticItem("missing_materials"));
  }
  if (
    specSections.length === 0 ||
    specHas(specSections, "conclusion", "scope_and_conclusion")
  ) {
    outline.push(staticItem("conclusion"));
  }

  return outline;
}
