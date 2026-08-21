import { orderByDependency } from "../../../utils/topo-batches.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { BuildActGraphResult } from "./build-act-graph.js";

const SHARED_UNIT_IDS = new Set(["wu-playbook-extract"]);

/**
 * Run the same ACT subgraph against every target document, then render once.
 * Playbook extraction stays shared. Work-unit ids are prefixed `d{n}-`.
 */
export function replicateGraphForTargets(
  graphs: BuildActGraphResult[]
): BuildActGraphResult {
  if (graphs.length === 0) {
    return {
      workUnits: [],
      schemaId: "checklist",
      rendererSchemaId: "checklist",
      packageResolution: {
        packages: [],
        leftoverRuleIds: [],
        leftoverMatrixRowIds: [],
        leftoverRiskCategoryIds: [],
        requirementToPackageId: {},
        requirementPaths: [],
        blockedCapabilityIds: [],
      },
    };
  }
  if (graphs.length === 1) return graphs[0];

  const merged: AnalysisWorkUnit[] = [];
  const seenShared = new Set<string>();
  let renderTemplate: AnalysisWorkUnit | undefined;
  const leafIds: string[] = [];

  graphs.forEach((graph, index) => {
    const prefix = `d${index}-`;
    for (const unit of graph.workUnits) {
      if (unit.tool === "render_output") {
        renderTemplate = unit;
        continue;
      }
      if (SHARED_UNIT_IDS.has(unit.workUnitId) || unit.tool === "extract_playbook_positions") {
        if (!seenShared.has(unit.workUnitId)) {
          seenShared.add(unit.workUnitId);
          merged.push(unit);
        }
        continue;
      }
      merged.push({
        ...unit,
        workUnitId: `${prefix}${unit.workUnitId}`,
        dependsOn: unit.dependsOn.map((dep) =>
          SHARED_UNIT_IDS.has(dep) ? dep : `${prefix}${dep}`
        ),
      });
    }
  });

  const referenced = new Set(merged.flatMap((unit) => unit.dependsOn));
  for (const unit of merged) {
    if (!referenced.has(unit.workUnitId)) leafIds.push(unit.workUnitId);
  }

  if (renderTemplate) {
    merged.push({
      ...renderTemplate,
      dependsOn: leafIds.length > 0 ? leafIds : renderTemplate.dependsOn,
    });
  }

  const first = graphs[0];
  return {
    workUnits: orderByDependency(merged),
    schemaId: first.schemaId,
    rendererSchemaId: first.rendererSchemaId,
    packageResolution: first.packageResolution,
  };
}
