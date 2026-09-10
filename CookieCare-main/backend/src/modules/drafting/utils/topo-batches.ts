import type { WorkUnit } from "../models/draft-plan.js";

/**
 * Dependency-ordered batches: units whose dependsOn are all outside the pending set
 * (or already drafted) can run in parallel.
 */
export function orderByDependency(units: WorkUnit[]): WorkUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const visited = new Set<string>();
  const result: WorkUnit[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    const unit = byId.get(id);
    if (!unit) return;
    visited.add(id);
    for (const dep of unit.dependsOn) {
      visit(dep);
    }
    result.push(unit);
  }

  for (const u of units) visit(u.id);
  return result;
}

export function topologicalBatches(
  units: WorkUnit[],
  maxConcurrent = 4
): WorkUnit[][] {
  const pending = units.filter((u) => u.status !== "drafted");
  const drafted = new Set(units.filter((u) => u.status === "drafted").map((u) => u.id));
  const remaining = new Map(pending.map((u) => [u.id, u]));
  const batches: WorkUnit[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((u) =>
      u.dependsOn.every((d) => drafted.has(d) || !remaining.has(d))
    );

    if (ready.length === 0) {
      // Cycle or missing dep — flush remaining in arbitrary order to avoid deadlock
      batches.push([...remaining.values()].slice(0, maxConcurrent));
      for (const u of batches[batches.length - 1]) {
        remaining.delete(u.id);
        drafted.add(u.id);
      }
      continue;
    }

    const batch = ready.slice(0, maxConcurrent);
    batches.push(batch);
    for (const u of batch) {
      remaining.delete(u.id);
      drafted.add(u.id);
    }
  }

  return batches;
}
