import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import type { Finding, FindingStatus } from "../../../models/finding.js";
import { isKnownRiskCategory } from "../../../skills/runtime/catalog/registry.js";
import { resolveRule } from "../../act/check-against-rule.js";
import { getSpanFromState } from "../../act/execute-act-plan.js";
import { addFindingFix, isTerminal, normalize } from "./shared.js";

const FINDING_STATUSES = new Set<FindingStatus>([
  "present",
  "absent_expected",
  "insufficient_evidence",
  "not_covered",
]);

export function validateFindings(
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

    // Requirement-id stamping (ACT-Phase 1): every user-facing compliance/risk
    // finding must be stamped with the requirementId it establishes/gaps by
    // the time it leaves ACT — `requirementId` stays optional on the type
    // itself (handlers emit raw findings before the generic stamp helpers in
    // act-utils.ts enrich them), so this is where the "required" property
    // from the ACT rebuild plan is actually enforced.
    if (
      (finding.kind === "compliance" || finding.kind === "risk") &&
      finding.visibility !== "internal" &&
      !finding.requirementId
    ) {
      const issueId = `requirement-id-stamp:${finding.findingId}`;
      results.push({
        itemId: issueId,
        status: "fail",
        evidenceVerified: false,
        findingId: finding.findingId,
        workUnitId: finding.workUnitId,
        detail: "User-facing compliance/risk finding is missing requirementId",
      });
      addFindingFix(
        fixes,
        finding,
        "Stamp the finding with the requirementId it establishes",
        issueId
      );
    }

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

export function validateTaxonomyAndRules(
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

export function validateCapabilityCoverage(
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[]
): void {
  for (const unit of workUnits) {
    // A terminal rule/matrix unit with zero findings is a valid outcome
    // ("no violation detected" / "rule does not apply") — not a structural gap.
    // Non-terminal units are already flagged by validateWorkUnits.
    if (!isTerminal(unit)) continue;

    if (unit.tool === "check_against_rule") {
      const ruleId = String(unit.input.ruleId ?? "");
      if (!ruleId) continue;
      const covered = findings.some(
        (finding) =>
          finding.workUnitId === unit.workUnitId ||
          (finding.kind === "compliance" && finding.ruleId === ruleId)
      );
      results.push({
        itemId: `regime:${ruleId}`,
        status: "pass",
        evidenceVerified: covered,
        workUnitId: unit.workUnitId,
        detail: covered
          ? undefined
          : `Rule ${ruleId} evaluated; no violation surfaced`,
      });
    }

    if (unit.tool === "evaluate_matrix_row") {
      const rowId = String(unit.input.rowId ?? "");
      if (!rowId) continue;
      const covered = findings.some(
        (finding) =>
          finding.workUnitId === unit.workUnitId ||
          finding.matrixRowId === rowId
      );
      results.push({
        itemId: `focus-matrix:${rowId}`,
        status: "pass",
        evidenceVerified: covered,
        workUnitId: unit.workUnitId,
        detail: covered ? undefined : `Matrix row ${rowId} evaluated; no addressing finding surfaced`,
      });
    }
  }
}
