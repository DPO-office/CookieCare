import type { AnalysisState, RepairContext } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import {
  buildActGraphDetailed,
} from "./build-act-graph.js";
import { pacLog } from "../../../utils/pac-log.js";

const PACKAGE_TOOLS = new Set([
  "evaluate_package",
  "inventory_provisions",
  "extract_shared_evidence",
]);

/**
 * Targeted package-shape repair: re-resolve packages against existing skills
 * (no classifyIntent / full PLAN) and inject missing package units.
 * Successful unrelated findings and done units are preserved.
 */
export function applyPackageShapeRepair(state: AnalysisState): AnalysisState {
  const plan = state.plan;
  const repair = state.repairContext;
  if (!plan || !repair || repair.kind !== "package_shape") return state;
  if (!state.intent || !state.activeSkills?.length) return state;

  const extract = plan.workUnits.find((u) => u.tool === "extract_clauses");
  const docId = String(
    extract?.input.docId ?? state.request.documentIds[0] ?? ""
  );
  if (!docId) return state;

  const referenceDocId =
    typeof extract?.input.referenceDocId === "string"
      ? extract.input.referenceDocId
      : undefined;

  const fresh = buildActGraphDetailed({
    docId,
    instruction: state.request.instruction,
    skills: state.activeSkills,
    intent: state.intent,
    reportSpec: plan.reportSpec,
    focus: plan.focus,
    referenceDocId,
  });

  const existingById = new Map(
    plan.workUnits.map((unit) => [unit.workUnitId, unit])
  );
  const affectedPackageIds = new Set(
    repair.affectedPackageIds.length > 0
      ? repair.affectedPackageIds
      : fresh.packageResolution.packages.map((p) => p.pkg.id)
  );
  const affectedRequirementIds = new Set(repair.affectedRequirementIds);

  const filterByListedPackages = repair.affectedPackageIds.length > 0;
  const injected: AnalysisWorkUnit[] = [];
  for (const unit of fresh.workUnits) {
    if (!PACKAGE_TOOLS.has(unit.tool)) continue;
    const packageId = String(unit.input.packageId ?? "");
    if (filterByListedPackages && packageId && !affectedPackageIds.has(packageId)) {
      continue;
    }
    const existing = existingById.get(unit.workUnitId);
    if (existing) {
      const shouldRedo =
        existing.status !== "done" ||
        (packageId && affectedPackageIds.has(packageId)) ||
        !filterByListedPackages ||
        (unit.requirementIds ?? []).some((id) => affectedRequirementIds.has(id));
      if (shouldRedo) {
        existingById.set(unit.workUnitId, {
          ...existing,
          ...unit,
          status: "flagged",
          input: { ...unit.input },
        });
      }
      continue;
    }
    injected.push({ ...unit, status: "flagged" });
  }

  const affectedStillUnsupported =
    repair.affectedRequirementIds.length > 0 &&
    repair.affectedRequirementIds.every((id) => {
      const path = fresh.packageResolution.requirementPaths.find(
        (p) => p.requirementId === id
      );
      const mapped = fresh.packageResolution.requirementToPackageId[id];
      return (
        !mapped &&
        (!path ||
          path.status === "not_supported" ||
          path.status === "needs_replan")
      );
    });

  if (injected.length === 0 && affectedStillUnsupported) {
    pacLog("package-shape repair skipped: unsatisfiable under current skills", {
      requirements: repair.affectedRequirementIds,
      packages: fresh.packageResolution.packages.length,
    });
    return state;
  }

  let workUnits = [...existingById.values(), ...injected];

  // Ensure aggregate / derive / render re-run after package repair.
  const packageLeaves = workUnits
    .filter(
      (u) =>
        (u.tool === "evaluate_package" || u.tool === "inventory_provisions") &&
        (u.status === "flagged" || u.status === "pending")
    )
    .map((u) => u.workUnitId);

  workUnits = workUnits.map((unit) => {
    if (unit.tool === "derive_risk" || unit.tool === "aggregate_requirements") {
      const dependsOn =
        packageLeaves.length > 0
          ? [...new Set([...unit.dependsOn.filter((d) => d !== "wu-extract"), ...packageLeaves])]
          : unit.dependsOn;
      // Keep extract dependency if present.
      const withExtract = unit.dependsOn.includes("wu-extract")
        ? [...new Set(["wu-extract", ...dependsOn])]
        : dependsOn;
      return { ...unit, status: "flagged" as const, dependsOn: withExtract };
    }
    if (unit.tool === "render_output") {
      return { ...unit, status: "flagged" as const };
    }
    return unit;
  });

  // Drop findings only for affected requirements / work units being redone.
  const redoUnitIds = new Set(
    workUnits
      .filter((u) => u.status === "flagged" && PACKAGE_TOOLS.has(u.tool))
      .map((u) => u.workUnitId)
  );
  const findings = state.findings.filter((finding) => {
    if (finding.status === "not_covered") return true;
    if (finding.workUnitId && redoUnitIds.has(finding.workUnitId)) return false;
    if (
      finding.requirementId &&
      affectedRequirementIds.size > 0 &&
      affectedRequirementIds.has(finding.requirementId)
    ) {
      return false;
    }
    return true;
  });

  const fixItems = workUnits
    .filter(
      (u) =>
        u.status === "flagged" &&
        (PACKAGE_TOOLS.has(u.tool) ||
          u.tool === "aggregate_requirements" ||
          u.tool === "derive_risk" ||
          u.tool === "render_output")
    )
    .map((u) => ({
      workUnitId: u.workUnitId,
      instruction: `Targeted package-shape repair for ${u.tool}`,
      sourceItemId: "alignment:targeted_redo",
      requirementId: u.requirementIds?.[0],
      previousAttemptFeedback: repair.critiqueIssueDetails.join("; "),
    }));

  pacLog("package-shape repair", {
    injected: injected.length,
    flagged: fixItems.length,
    packages: fresh.packageResolution.packages.length,
    paths: fresh.packageResolution.requirementPaths.length,
  });

  return {
    ...state,
    findings,
    plan: {
      ...plan,
      workUnits,
      requirementExecutionPaths: fresh.packageResolution.requirementPaths,
    },
    fixPlan: {
      items: fixItems,
      targetedOnly: true,
    },
  };
}

/** Build RepairContext from alignment targeted_redo issues. */
export function repairContextFromAlignment(
  state: AnalysisState,
  issues: Array<{
    action: string;
    requirementId?: string;
    packageId?: string;
    detail: string;
  }>
): RepairContext | null {
  const targeted = issues.filter((i) => i.action === "targeted_redo");
  if (targeted.length === 0) return null;
  return {
    analysisId: state.request.sessionId,
    kind: "package_shape",
    affectedRequirementIds: [
      ...new Set(
        targeted
          .map((i) => i.requirementId)
          .filter((id): id is string => Boolean(id))
      ),
    ],
    affectedPackageIds: [
      ...new Set(
        targeted
          .map((i) => i.packageId)
          .filter((id): id is string => Boolean(id))
      ),
    ],
    critiqueIssueDetails: targeted.map((i) => i.detail),
    preserveFindingsOutsideAffected: true,
  };
}
