import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type {
  CritiqueTarget,
  FixItem,
} from "../../../models/critique-report.js";
import type { Finding } from "../../../models/finding.js";
import { normalizeWhitespaceLower } from "../../../shared/text-normalize.js";

export function packageUnitForRequirement(
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

export function packageIdForUnit(
  workUnitId: string | undefined,
  workUnits: AnalysisWorkUnit[]
): string | undefined {
  if (!workUnitId) return undefined;
  const packageId = workUnits.find(
    (unit) => unit.workUnitId === workUnitId
  )?.input.packageId;
  return typeof packageId === "string" ? packageId : undefined;
}

export function addFindingFix(
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

export function addTarget(targets: CritiqueTarget[], target: CritiqueTarget): void {
  if (!target.workUnitId) return;
  targets.push(target);
}

export function isTerminal(unit: AnalysisWorkUnit): boolean {
  return (
    unit.status === "done" ||
    unit.status === "failed" ||
    unit.status === "skipped"
  );
}

export function normalize(value: string): string {
  return normalizeWhitespaceLower(value);
}

export function dedupeTargets(targets: CritiqueTarget[]): CritiqueTarget[] {
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
