import type { AnalysisWorkUnit } from "../models/analysis-plan.js";

export function orderByDependency(units: AnalysisWorkUnit[]): AnalysisWorkUnit[] {
  const byId = new Map(units.map((u) => [u.workUnitId, u]));
  const visited = new Set<string>();
  const result: AnalysisWorkUnit[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    const unit = byId.get(id);
    if (!unit) return;
    visited.add(id);
    for (const dep of unit.dependsOn) visit(dep);
    result.push(unit);
  }

  for (const u of units) visit(u.workUnitId);
  return result;
}

export function topologicalBatches(
  units: AnalysisWorkUnit[],
  maxConcurrent = 4
): AnalysisWorkUnit[][] {
  const pending = units.filter((u) => u.status !== "done");
  const done = new Set(units.filter((u) => u.status === "done").map((u) => u.workUnitId));
  const remaining = new Map(pending.map((u) => [u.workUnitId, u]));
  const batches: AnalysisWorkUnit[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((u) =>
      u.dependsOn.every((d) => done.has(d) || !remaining.has(d))
    );

    if (ready.length === 0) {
      batches.push([...remaining.values()].slice(0, maxConcurrent));
      for (const u of batches[batches.length - 1]) {
        remaining.delete(u.workUnitId);
        done.add(u.workUnitId);
      }
      continue;
    }

    const batch = ready.slice(0, maxConcurrent);
    batches.push(batch);
    for (const u of batch) {
      remaining.delete(u.workUnitId);
      done.add(u.workUnitId);
    }
  }

  return batches;
}
