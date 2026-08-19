import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type {
  CritiqueIssue,
  CritiqueTarget,
  FixItem,
} from "../../models/critique-report.js";
import type { Finding, FindingStatus } from "../../models/finding.js";
import type { ReportSectionId } from "../../models/intent.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { isKnownRiskCategory } from "../../skills/registry.js";
import {
  normalizeReportSections,
  reportOutputContainsSection,
  reportSectionsInOrder,
} from "../../prompts/report-sections.js";
import { deriveRequirementStatus } from "../act/requirement-status-policy.js";
import { resolveRule } from "../act/check-against-rule.js";
import { getSpanFromState } from "../act/execute-act-plan.js";

const FINDING_STATUSES = new Set<FindingStatus>([
  "present",
  "absent_expected",
  "insufficient_evidence",
  "not_covered",
]);

const REPORT_SECTIONS = new Set<ReportSectionId>([
  "scope",
  "conclusion",
  "scope_and_conclusion",
  "chapeau_particulars",
  "requirements_detail",
  "qualifications",
  "recommendations",
  "missing_materials",
]);

const RIGOR_PATTERN =
  /\b(rigorous|exhaustive|clause[- ]by[- ]clause|complete verification|deep verification|strict verification)\b/i;

export interface CritiqueLiteResult {
  executionComplete: boolean;
  structurallyValid: boolean;
  structuralIssues: CritiqueIssue[];
  results: CritiqueIssue[];
  fixPlan: FixItem[];
  deepCritiqueRequired: boolean;
  deepCritiqueTargets: CritiqueTarget[];
  skeletonMismatch: boolean;
  criticalFactSurfaced: boolean;
}

/**
 * Cheap invariant validation. This function is deliberately synchronous and
 * contains no LLM/provider dependency.
 */
export function runCritiqueLite(state: AnalysisState): CritiqueLiteResult {
  const results: CritiqueIssue[] = [];
  const fixes: FixItem[] = [];
  const targets: CritiqueTarget[] = [];
  const findings = state.findings;
  const workUnits = state.plan?.workUnits ?? [];

  validateWorkUnits(workUnits, results, fixes);
  validateFindings(state, findings, results, fixes);
  validateTaxonomyAndRules(state, findings, results, fixes);
  validateCapabilityCoverage(findings, workUnits, results, fixes);
  validateRequirements(state, findings, workUnits, results, fixes, targets);
  validateRequirementMappings(state, results);
  validateReportSpec(state, results, fixes);
  collectMaterialityAndRigorTargets(state, findings, workUnits, targets);

  const executionComplete = workUnits.every(isTerminal);
  const structuralIssues = results.filter(
    (issue) => issue.status === "fail" || issue.status === "missing"
  );
  const incompleteUnits = results.filter(
    (issue) =>
      issue.itemId.startsWith("complete:") && issue.status === "missing"
  ).length;
  const skeletonMismatch =
    workUnits.length > 0 &&
    incompleteUnits > Math.max(1, Math.floor(workUnits.length / 2));
  const criticalFactSurfaced = hasCriticalUnanswerableFact(state);

  return {
    executionComplete,
    structurallyValid: structuralIssues.length === 0,
    structuralIssues,
    results,
    fixPlan: dedupeFixes(fixes),
    deepCritiqueRequired: targets.length > 0,
    deepCritiqueTargets: dedupeTargets(targets),
    skeletonMismatch,
    criticalFactSurfaced,
  };
}

function validateCapabilityCoverage(
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  for (const unit of workUnits) {
    if (unit.tool === "check_against_rule") {
      const ruleId = String(unit.input.ruleId ?? "");
      if (!ruleId) continue;
      const covered = findings.some(
        (finding) =>
          finding.workUnitId === unit.workUnitId ||
          (finding.kind === "compliance" && finding.ruleId === ruleId)
      );
      const issueId = `regime:${ruleId}`;
      results.push({
        itemId: issueId,
        status: covered ? "pass" : "missing",
        evidenceVerified: covered,
        workUnitId: unit.workUnitId,
        detail: covered ? undefined : `No compliance finding for rule ${ruleId}`,
      });
      if (!covered) {
        fixes.push({
          workUnitId: unit.workUnitId,
          instruction: `Evaluate scheduled rule ${ruleId}`,
          sourceItemId: issueId,
        });
      }
    }

    if (unit.tool === "evaluate_matrix_row") {
      const rowId = String(unit.input.rowId ?? "");
      if (!rowId) continue;
      const covered = findings.some(
        (finding) =>
          finding.workUnitId === unit.workUnitId ||
          finding.matrixRowId === rowId
      );
      const issueId = `focus-matrix:${rowId}`;
      results.push({
        itemId: issueId,
        status: covered ? "pass" : "missing",
        evidenceVerified: covered,
        workUnitId: unit.workUnitId,
        detail: covered ? undefined : `No finding for matrix row ${rowId}`,
      });
      if (!covered) {
        fixes.push({
          workUnitId: unit.workUnitId,
          instruction: `Evaluate matrix row ${rowId}`,
          sourceItemId: issueId,
        });
      }
    }
  }
}

function validateWorkUnits(
  units: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  for (const unit of units) {
    const terminal = isTerminal(unit);
    results.push({
      itemId: `complete:${unit.workUnitId}`,
      status: terminal ? "pass" : "missing",
      evidenceVerified: terminal,
      workUnitId: unit.workUnitId,
      detail: terminal
        ? unit.completionNote
        : "Work unit did not reach an allowed terminal status",
    });
    if (!terminal) {
      fixes.push({
        workUnitId: unit.workUnitId,
        instruction: `Re-run ${unit.tool}; unit did not complete`,
        sourceItemId: `complete:${unit.workUnitId}`,
      });
    } else if (unit.status === "failed") {
      const issueId = `execution-failed:${unit.workUnitId}`;
      results.push({
        itemId: issueId,
        status: "fail",
        evidenceVerified: false,
        workUnitId: unit.workUnitId,
        detail: unit.completionNote ?? "Work unit execution failed",
      });
      fixes.push({
        workUnitId: unit.workUnitId,
        instruction: `Retry failed ${unit.tool} work unit`,
        sourceItemId: issueId,
      });
    }
  }
}

function validateFindings(
  state: AnalysisState,
  findings: Finding[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  const ids = new Set<string>();
  for (const finding of findings) {
    const idOk = Boolean(finding.findingId) && !ids.has(finding.findingId);
    ids.add(finding.findingId);
    results.push({
      itemId: `finding-id:${finding.findingId}`,
      status: idOk ? "pass" : "fail",
      evidenceVerified: idOk,
      findingId: finding.findingId,
      workUnitId: finding.workUnitId,
      detail: idOk ? undefined : "Finding id is missing or duplicated",
    });

    const statusOk = FINDING_STATUSES.has(finding.status);
    results.push({
      itemId: `finding-status:${finding.findingId}`,
      status: statusOk ? "pass" : "fail",
      evidenceVerified: statusOk,
      findingId: finding.findingId,
      workUnitId: finding.workUnitId,
      detail: statusOk ? undefined : `Invalid finding status ${finding.status}`,
    });
    if (!statusOk) addFindingFix(fixes, finding, "Emit a valid Finding status");

    if (finding.unverified || finding.orgPlaybook) continue;

    if (
      finding.status === "present" &&
      (finding.kind === "risk" || finding.kind === "compliance") &&
      finding.evidence.length === 0
    ) {
      const issueId = `evidence-missing:${finding.findingId}`;
      results.push({
        itemId: issueId,
        status: "fail",
        evidenceVerified: false,
        findingId: finding.findingId,
        workUnitId: finding.workUnitId,
        detail: "Present risk/compliance finding lacks evidence",
      });
      addFindingFix(fixes, finding, "Re-extract evidence for the finding", issueId);
      continue;
    }

    for (const evidence of finding.evidence) {
      const doc = state.workspace.documents.find(
        (candidate) => candidate.docId === evidence.locator.docId
      );
      const span = getSpanFromState(state, evidence.locator);
      const quote = normalize(evidence.quotedText);
      const verified =
        Boolean(doc) &&
        Boolean(span) &&
        Boolean(quote) &&
        (normalize(span ?? "").includes(quote) ||
          normalize(doc?.fullText ?? "").includes(quote));
      const issueId = `locator:${finding.findingId}:${evidence.locator.structuralPath}`;
      results.push({
        itemId: issueId,
        status: verified ? "pass" : "fail",
        evidenceVerified: verified,
        evidenceQuote: evidence.quotedText,
        findingId: finding.findingId,
        workUnitId: finding.workUnitId,
        detail: verified
          ? undefined
          : !doc
            ? "Referenced evidence document does not exist"
            : !span
              ? "Evidence locator does not resolve"
              : "Evidence quote is inconsistent with its source span/document",
      });
      if (!verified) {
        addFindingFix(
          fixes,
          finding,
          "Repair the evidence locator and verbatim quote",
          issueId
        );
      }
    }
  }
}

function validateTaxonomyAndRules(
  state: AnalysisState,
  findings: Finding[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  const activeCategories = new Set(
    state.mergedRiskCategories ??
      state.activeSkills?.flatMap((skill) =>
        skill.riskCategories.map((risk) => risk.category)
      ) ??
      []
  );
  for (const finding of findings) {
    if (
      finding.kind !== "risk" &&
      finding.kind !== "compliance"
    ) {
      continue;
    }

    const taxonomyOk =
      finding.unverified ||
      finding.orgPlaybook ||
      activeCategories.has(finding.category) ||
      isKnownRiskCategory(finding.category);
    const taxonomyId = `taxonomy:${finding.findingId}`;
    results.push({
      itemId: taxonomyId,
      status: taxonomyOk ? "pass" : "fail",
      evidenceVerified: taxonomyOk,
      findingId: finding.findingId,
      workUnitId: finding.workUnitId,
      detail: taxonomyOk
        ? undefined
        : `Unknown category ${finding.category} for active skills`,
    });
    if (!taxonomyOk) {
      addFindingFix(
        fixes,
        finding,
        "Reclassify the finding into the active taxonomy",
        taxonomyId
      );
    }

    if (
      finding.kind === "compliance" &&
      finding.ruleId &&
      finding.ruleSourceTier !== "P" &&
      finding.ruleSourceTier !== "C" &&
      !finding.unverified
    ) {
      const ruleOk = Boolean(
        resolveRule(state.activeSkillIds ?? [], finding.ruleId)?.rule.ruleText
      );
      const ruleId = `rule-cite:${finding.findingId}`;
      results.push({
        itemId: ruleId,
        status: ruleOk ? "pass" : "fail",
        evidenceVerified: ruleOk,
        findingId: finding.findingId,
        workUnitId: finding.workUnitId,
        detail: ruleOk
          ? undefined
          : `Authored rule ${finding.ruleId} does not resolve`,
      });
      if (!ruleOk) {
        addFindingFix(
          fixes,
          finding,
          `Re-evaluate against a valid authored rule for ${finding.ruleId}`,
          ruleId
        );
      }
    }
  }
}

function validateRequirements(
  state: AnalysisState,
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[],
  targets: CritiqueTarget[]
): void {
  const assessments = state.requirementAssessments ?? [];
  const assessmentById = new Map(
    assessments.map((assessment) => [assessment.requirementId, assessment])
  );
  const findingById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const requiredIds = new Set(
    (state.plan?.intent.requirements ?? [])
      .filter((requirement) => requirement.priority === "required")
      .map((requirement) => requirement.id)
  );
  for (const required of state.plan?.focus?.requirements ?? []) {
    requiredIds.add(required.id);
  }

  for (const requirementId of requiredIds) {
    const assessment = assessmentById.get(requirementId);
    const validTerminalWithoutEvidence =
      assessment?.status === "not_applicable" ||
      assessment?.status === "cannot_determine";
    const covered =
      Boolean(assessment) &&
      (assessment!.supportingFindingIds.length > 0 ||
        validTerminalWithoutEvidence);
    const issueId = `requirement-coverage:${requirementId}`;
    results.push({
      itemId: issueId,
      status: covered ? "pass" : "missing",
      evidenceVerified: covered,
      workUnitId: packageUnitForRequirement(requirementId, findings, workUnits),
      detail: covered
        ? undefined
        : `Required requirement ${requirementId} lacks a valid assessment/finding`,
    });
    if (!covered) {
      const workUnitId = packageUnitForRequirement(
        requirementId,
        findings,
        workUnits
      );
      if (workUnitId) {
        fixes.push({
          workUnitId,
          instruction: `Evaluate required requirement ${requirementId}`,
          sourceItemId: issueId,
        });
      }
    }
  }

  for (const assessment of assessments) {
    const linked = assessment.supportingFindingIds
      .map((id) => findingById.get(id))
      .filter((finding): finding is Finding => Boolean(finding));
    const referencesValid =
      new Set(assessment.supportingFindingIds).size ===
        assessment.supportingFindingIds.length &&
      linked.length === assessment.supportingFindingIds.length &&
      linked.every(
        (finding) =>
          !finding.requirementId ||
          finding.requirementId === assessment.requirementId
      );
    const referenceId = `requirement-refs:${assessment.requirementId}`;
    results.push({
      itemId: referenceId,
      status: referencesValid ? "pass" : "fail",
      evidenceVerified: referencesValid,
      workUnitId: packageUnitForRequirement(
        assessment.requirementId,
        linked,
        workUnits
      ),
      detail: referencesValid
        ? undefined
        : "RequirementAssessment contains missing, duplicate, or cross-requirement Finding references",
    });

    const derived = deriveRequirementStatus(linked);
    const statusConsistent = derived === assessment.status;
    const consistencyId = `requirement-consistency:${assessment.requirementId}`;
    results.push({
      itemId: consistencyId,
      status: statusConsistent ? "pass" : "ambiguous",
      evidenceVerified: statusConsistent,
      findingId: linked[0]?.findingId,
      workUnitId: packageUnitForRequirement(
        assessment.requirementId,
        linked,
        workUnits
      ),
      detail: statusConsistent
        ? undefined
        : `Assessment status ${assessment.status} conflicts with derived status ${derived}`,
    });
    if (!statusConsistent) {
      addTarget(targets, {
        requirementId: assessment.requirementId,
        findingId: linked[0]?.findingId,
        workUnitId:
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ) ?? "",
        evidencePackageId: packageIdForUnit(
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ),
          workUnits
        ),
        reason: "internal_inconsistency",
        instruction: `Resolve assessment/Finding status conflict for ${assessment.requirementId}`,
      });
    }

    const statuses = new Set(linked.map((finding) => finding.status));
    if (statuses.has("present") && statuses.has("absent_expected")) {
      addTarget(targets, {
        requirementId: assessment.requirementId,
        findingId: linked.find((finding) => finding.status === "present")?.findingId,
        workUnitId:
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ) ?? "",
        evidencePackageId: packageIdForUnit(
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ),
          workUnits
        ),
        reason: "conflicting_evidence",
        instruction: `Verify conflicting evidence for ${assessment.requirementId}`,
      });
    }
  }
}

function validateRequirementMappings(
  state: AnalysisState,
  results: CritiqueIssue[]
): void {
  const mappings = state.plan?.focus?.requirementMappings ?? [];
  const byRequirement = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const current = byRequirement.get(mapping.requirementId) ?? new Set<string>();
    const duplicate =
      mapping.capabilityIds.some((id) => current.has(id)) ||
      new Set(mapping.capabilityIds).size !== mapping.capabilityIds.length;
    results.push({
      itemId: `requirement-mapping:${mapping.requirementId}`,
      status: duplicate ? "fail" : "pass",
      evidenceVerified: !duplicate,
      detail: duplicate
        ? `Duplicate capability mapping for requirement ${mapping.requirementId}`
        : undefined,
    });
    for (const id of mapping.capabilityIds) current.add(id);
    byRequirement.set(mapping.requirementId, current);
  }
}

function validateReportSpec(
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
    fixes.push({
      workUnitId: "wu-render",
      instruction:
        "Render required ReportSpec sections using their declared labels and order",
      sourceItemId: "report-output:contract",
    });
  }
}

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

function collectMaterialityAndRigorTargets(
  state: AnalysisState,
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  targets: CritiqueTarget[]
): void {
  for (const finding of findings) {
    if (
      finding.visibility === "internal" ||
      finding.unverified ||
      !finding.workUnitId
    ) {
      continue;
    }
    if (
      finding.severity === "high" &&
      (finding.kind === "risk" || finding.kind === "compliance")
    ) {
      addTarget(targets, targetForFinding(finding, workUnits, "high_materiality"));
    }
    if (
      finding.status === "present" &&
      finding.evidence.length > 0 &&
      finding.evidence.every((evidence) => normalize(evidence.quotedText).length < 16)
    ) {
      addTarget(targets, targetForFinding(finding, workUnits, "weak_evidence"));
    }
  }

  if (!RIGOR_PATTERN.test(state.request.instruction)) return;
  const assessments = state.requirementAssessments ?? [];
  for (const assessment of assessments) {
    const supporting = findings.filter((finding) =>
      assessment.supportingFindingIds.includes(finding.findingId)
    );
    const finding = supporting.find(
      (candidate) =>
        candidate.status === "present" && candidate.visibility !== "internal"
    );
    if (!finding?.workUnitId) continue;
    addTarget(
      targets,
      targetForFinding(
        finding,
        workUnits,
        "explicit_rigor_request",
        assessment.requirementId
      )
    );
  }
}

function targetForFinding(
  finding: Finding,
  workUnits: AnalysisWorkUnit[],
  reason: CritiqueTarget["reason"],
  requirementId = finding.requirementId
): CritiqueTarget {
  return {
    requirementId,
    findingId: finding.findingId,
    workUnitId: finding.workUnitId ?? "",
    evidencePackageId: packageIdForUnit(finding.workUnitId, workUnits),
    reason,
  };
}

function hasCriticalUnanswerableFact(state: AnalysisState): boolean {
  const critical = state.plan?.missingClarifications.some(
    (item) => item.severity === "critical"
  );
  if (!critical) return false;
  const canReportUnknown = (state.requirementAssessments ?? []).some(
    (assessment) =>
      assessment.status === "cannot_determine" ||
      assessment.status === "not_applicable"
  );
  return !canReportUnknown;
}

function packageUnitForRequirement(
  requirementId: string,
  findings: Finding[],
  workUnits: AnalysisWorkUnit[]
): string | undefined {
  const fromFinding = findings.find(
    (finding) =>
      finding.requirementId === requirementId && finding.workUnitId
  )?.workUnitId;
  if (fromFinding) return fromFinding;
  return workUnits.find(
    (unit) =>
      unit.tool === "evaluate_package" &&
      Array.isArray(unit.input.requirementIds) &&
      (unit.input.requirementIds as string[]).includes(requirementId)
  )?.workUnitId;
}

function packageIdForUnit(
  workUnitId: string | undefined,
  workUnits: AnalysisWorkUnit[]
): string | undefined {
  if (!workUnitId) return undefined;
  const packageId = workUnits.find(
    (unit) => unit.workUnitId === workUnitId
  )?.input.packageId;
  return typeof packageId === "string" ? packageId : undefined;
}

function addFindingFix(
  fixes: FixItem[],
  finding: Finding,
  instruction: string,
  sourceItemId = finding.findingId
): void {
  if (!finding.workUnitId) return;
  fixes.push({
    workUnitId: finding.workUnitId,
    instruction,
    sourceItemId,
  });
}

function addTarget(targets: CritiqueTarget[], target: CritiqueTarget): void {
  if (!target.workUnitId) return;
  targets.push(target);
}

function isTerminal(unit: AnalysisWorkUnit): boolean {
  return (
    unit.status === "done" ||
    unit.status === "failed" ||
    unit.status === "skipped"
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeFixes(fixes: FixItem[]): FixItem[] {
  const seen = new Set<string>();
  return fixes.filter((fix) => {
    const key = `${fix.workUnitId}:${fix.sourceItemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeTargets(targets: CritiqueTarget[]): CritiqueTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key =
      target.requirementId ??
      target.findingId ??
      target.workUnitId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
