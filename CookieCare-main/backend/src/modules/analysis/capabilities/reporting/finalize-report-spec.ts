import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type {
  ReportOutlineItem,
  ReportSectionId,
  ReportSpec,
} from "../../models/intent.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { isMaterialIssueStatus } from "../../models/requirement-assessment.js";
import { hasSkillOrPackageLimitation } from "./limitations-report.js";
import {
  isAnalysisOutlineRole,
  isAnalysisSectionId,
  isCaveatSectionId,
  isOpeningSectionId,
  normalizeReportSections,
  outlineItemSectionId,
  roleForSectionId,
  suggestedHeading,
} from "../../prompts/report-sections.js";

function hasLegalGap(assessments: RequirementAssessment[]): boolean {
  return assessments.some(
    (a) => isMaterialIssueStatus(a.status)
  );
}

function hasIndeterminate(assessments: RequirementAssessment[]): boolean {
  return assessments.some((a) => a.status === "cannot_determine");
}

function matchingAssessments(
  item: ReportOutlineItem,
  assessments: RequirementAssessment[]
): RequirementAssessment[] {
  if (item.requirementIds.length === 0) return [];
  const wanted = new Set(item.requirementIds);
  return assessments.filter((a) => wanted.has(a.requirementId));
}

function hasMatchingArtifact(
  item: ReportOutlineItem,
  state: AnalysisState
): boolean {
  const types = item.artifactTypes ?? [];
  if (types.length === 0) return false;
  return Object.values(state.analysisArtifacts ?? {}).some((artifact) =>
    types.includes(artifact.type)
  );
}

function userFacingRisks(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) => f.kind === "risk" && f.visibility !== "internal"
  );
}

function coverageAppendixWillRender(state: AnalysisState): boolean {
  const release = state.critique?.release;
  return Boolean(release && hasSkillOrPackageLimitation(release));
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
 * Post-ACT prune of the PLAN seed spec. Same logical sections for lite/deep;
 * empty roles are dropped from the findings, not from depth.
 */
export function finalizeReportSpec(state: AnalysisState): ReportSpec {
  const seed = state.plan?.reportSpec;
  const assessments = state.requirementAssessments ?? [];
  const findings = state.findings ?? [];
  if (!seed) {
    return {
      reportType: state.intent?.reportType ?? "regime_compliance_memo",
      depth: state.intent?.depth ?? "standard",
      sections: ["scope", "conclusion"],
      outline: [
        staticItem("scope"),
        staticItem("conclusion"),
      ],
    };
  }

  const legalGap = hasLegalGap(assessments);
  const indeterminate = hasIndeterminate(assessments);
  const risks = userFacingRisks(findings);
  const skipCaveats = coverageAppendixWillRender(state);
  const seedOutline = seed.outline ?? [];
  const kept: ReportOutlineItem[] = [];

  for (const item of seedOutline) {
    const sectionId = outlineItemSectionId(item);
    if (isOpeningSectionId(sectionId) || sectionId === "conclusion") {
      kept.push(item);
      continue;
    }
    if (sectionId === "evidence") {
      kept.push({
        ...item,
        requirementIds:
          item.requirementIds.length > 0
            ? item.requirementIds
            : assessments.map((a) => a.requirementId),
      });
      continue;
    }
    if (isAnalysisOutlineRole(item.role) || isAnalysisSectionId(sectionId)) {
      const matched = matchingAssessments(item, assessments);
      if (matched.length === 0 && !hasMatchingArtifact(item, state)) continue;
      kept.push(item);
      continue;
    }
    if (sectionId === "material_gaps") {
      if (!legalGap) continue;
      kept.push({
        ...item,
        requirementIds: assessments
          .filter((a) => isMaterialIssueStatus(a.status))
          .map((a) => a.requirementId),
      });
      continue;
    }
    if (sectionId === "recommendations") {
      if (!legalGap) continue;
      kept.push({
        ...item,
        requirementIds: assessments
          .filter((a) => isMaterialIssueStatus(a.status))
          .map((a) => a.requirementId),
      });
      continue;
    }
    if (sectionId === "missing_materials") {
      if (!indeterminate) continue;
      kept.push({
        ...item,
        requirementIds: assessments
          .filter((a) => a.status === "cannot_determine")
          .map((a) => a.requirementId),
      });
      continue;
    }
    if (isCaveatSectionId(sectionId)) {
      if (skipCaveats) continue;
      // Prefer a dedicated missing-materials section over repeating the same
      // cannot_determine caveats under Qualifications / Limitations.
      if (
        seed.sections.includes("missing_materials") ||
        kept.some((item) => outlineItemSectionId(item) === "missing_materials")
      ) {
        continue;
      }
      if (!indeterminate) continue;
      kept.push({
        ...item,
        requirementIds: assessments
          .filter((a) => a.status === "cannot_determine")
          .map((a) => a.requirementId),
      });
      continue;
    }
    if (sectionId === "risk_summary") {
      if (risks.length === 0) continue;
      kept.push(item);
      continue;
    }
    kept.push(item);
  }

  const keptIds = new Set(kept.map((item) => outlineItemSectionId(item)));
  const inject = (sectionId: ReportSectionId, predicate: boolean, ids: string[]) => {
    if (!predicate || keptIds.has(sectionId) || !seed.sections.includes(sectionId)) {
      return;
    }
    kept.push(staticItem(sectionId, ids));
    keptIds.add(sectionId);
  };

  inject(
    "material_gaps",
    legalGap,
    assessments
      .filter((a) => isMaterialIssueStatus(a.status))
      .map((a) => a.requirementId)
  );
  inject("risk_summary", risks.length > 0, []);
  inject(
    "recommendations",
    legalGap,
    assessments
      .filter((a) => isMaterialIssueStatus(a.status))
      .map((a) => a.requirementId)
  );
  inject(
    "missing_materials",
    indeterminate,
    assessments
      .filter((a) => a.status === "cannot_determine")
      .map((a) => a.requirementId)
  );

  const sections = normalizeReportSections(
    kept.map((item) => outlineItemSectionId(item))
  );
  const rank = new Map(sections.map((id, index) => [id, index]));
  kept.sort(
    (a, b) =>
      (rank.get(outlineItemSectionId(a)) ?? 99) -
      (rank.get(outlineItemSectionId(b)) ?? 99)
  );

  return {
    ...seed,
    sections,
    outline: kept,
  };
}

export function applyFinalizedReportSpec(
  state: AnalysisState,
  spec: ReportSpec
): AnalysisState {
  if (!state.plan) return state;
  return {
    ...state,
    plan: { ...state.plan, reportSpec: spec },
  };
}
