import type { AnalysisWorkUnit, InstructionFocus, PlanAuditRecord } from "../../models/analysis-plan.js";
import type { IntentClassification } from "../../models/intent.js";
import {
  summarizeTools,
  truncate,
  wrapPrefixed,
} from "../../shared/inspect-format.js";
import { pacLogBlock } from "../../utils/pac-log.js";
import { countRequirementsByPriority } from "./intent-requirement-normalize.js";

const STATUS_MARK: Record<string, string> = {
  covered: "[OK]",
  partial: "[~]",
  missing: "[X]",
};

export function logIntentInspect(intent: IntentClassification, instruction: string): void {
  pacLogBlock("PLAN INSPECT — classify-intent", formatIntentSection(intent, instruction));
}

export function logPlanInspect(args: {
  instruction: string;
  intent: IntentClassification;
  focus?: InstructionFocus;
  auditRecord: PlanAuditRecord;
  workUnits: AnalysisWorkUnit[];
  skillIds: string[];
  rendererSchemaId: string;
  relatedCount: number;
  docType?: string;
}): void {
  const lines: string[] = [
    ...formatIntentSection(args.intent, args.instruction),
    "",
    ...formatCatalogSection(args),
    "",
    ...formatCoverageSection(args.focus, args.auditRecord),
    "",
    ...formatGraphSection(args),
  ];
  pacLogBlock("PLAN INSPECT — full plan", lines);
}

function formatIntentSection(intent: IntentClassification, instruction: string): string[] {
  const { required, supporting } = countRequirementsByPriority(intent.requirements ?? []);
  const lines: string[] = [
    "1. WHAT USER ASKED",
    ...wrapPrefixed("   ", instruction.trim() || "(empty instruction)"),
    "",
    "2. WHAT SYSTEM UNDERSTOOD",
    `   operation      ${intent.operation}`,
    `   reportType     ${intent.reportType ?? "-"}`,
    `   depth          ${intent.depth ?? "-"}   (metadata only — requirements carry the real ask)`,
    `   scope          ${intent.scope}`,
    `   outputForm     ${intent.outputForm}`,
    `   standard       ${intent.standard}`,
    `   standardConcept ${intent.standardConcept ?? "-"}`,
    `   unresolvedStd  ${intent.unresolvedStandard ?? "none"}`,
    `   compound       ${intent.compound ? "yes" : "no"}   subIntents=${intent.subIntents.length}`,
    `   docTypeHint    ${intent.docTypeHint ?? "-"}`,
    `   confidence     op=${fmtConf(intent.confidence.operation)}  standard=${fmtConf(intent.confidence.standard)}  scope=${fmtConf(intent.confidence.scope)}  form=${fmtConf(intent.confidence.outputForm)}`,
    "",
    `   requirements   ${intent.requirements?.length ?? 0}  (required=${required}  supporting=${supporting})`,
  ];

  if (!intent.requirements?.length) {
    lines.push("     (none extracted)");
  } else {
    for (const req of intent.requirements) {
      lines.push(`     [${req.priority}] ${req.id}`);
      lines.push(`              type=${req.type}`);
      lines.push(...wrapPrefixed("              ", req.description));
    }
  }

  if (intent.subIntents.length > 0) {
    lines.push("");
    lines.push("   subIntents");
    for (const [i, sub] of intent.subIntents.entries()) {
      lines.push(
        `     ${i + 1}. ${sub.description ?? sub.operation}  op=${sub.operation}  standard=${sub.standard}  depth=${sub.depth ?? "-"}`
      );
      for (const req of sub.requirements ?? []) {
        lines.push(`        [${req.priority}] ${req.id} — ${req.description}`);
      }
    }
  }

  const unresolvedNeeds = intent.unresolvedNeeds ?? [];
  lines.push("");
  lines.push(`   unresolvedNeeds  ${unresolvedNeeds.length}`);
  if (unresolvedNeeds.length === 0) {
    lines.push("     (none)");
  } else {
    for (const need of unresolvedNeeds) {
      lines.push(`     [X] ${need.description}`);
      lines.push(...wrapPrefixed("         ", need.reason));
    }
  }

  return lines;
}

function formatCatalogSection(args: {
  focus?: InstructionFocus;
  auditRecord: PlanAuditRecord;
  skillIds: string[];
}): string[] {
  const focus = args.focus;
  const required = focus?.requiredCapabilities ?? focus?.requiredIds ?? [];
  const supporting = focus?.supportingCapabilities ?? focus?.supportingIds ?? [];
  const provenance = new Map((focus?.provenance ?? []).map((item) => [item.id, item]));
  const sources = args.auditRecord.resolutionSources.join(", ") || "none";

  const lines: string[] = [
    "3. WHAT CAPABILITIES WERE SELECTED",
    `   skills         ${args.skillIds.join(", ") || "(none)"}`,
    `   sources        ${sources}`,
    `   required       ${required.length}`,
    `   supporting     ${supporting.length}`,
    `   droppedIds     ${focus?.droppedCandidateIds?.length ?? 0}`,
  ];

  lines.push("   required capabilities");
  if (required.length === 0) {
    lines.push("     (none — ACT would run the full skill)");
  } else {
    for (const id of required) {
      lines.push(`     ${formatCapabilityLine(id, provenance.get(id))}`);
    }
  }

  lines.push("   supporting capabilities");
  if (supporting.length === 0) {
    lines.push("     (none)");
  } else {
    for (const id of supporting) {
      lines.push(`     ${formatCapabilityLine(id, provenance.get(id))}`);
    }
  }

  lines.push(`   rules          ${summarizeIds(focus?.ruleIds ?? [], "(full skill)")}`);
  lines.push(`   matrix rows    ${summarizeIds(focus?.matrixRowIds ?? [], "0")}`);
  lines.push(`   risk cats      ${summarizeIds(focus?.riskCategoryIds ?? [], "0")}`);

  return lines;
}

function formatCoverageSection(
  focus: InstructionFocus | undefined,
  audit: PlanAuditRecord
): string[] {
  const completeness = focus?.completenessCheck ?? audit.completenessCheck ?? [];
  const mappings = focus?.requirementMappings ?? audit.requirementMappings ?? [];
  const unresolved = focus?.unresolvedNeedDetails ?? audit.unresolvedNeeds ?? [];
  const covered = completeness.filter((item) => item.status === "covered").length;
  const partial = completeness.filter((item) => item.status === "partial").length;
  const missing = completeness.filter((item) => item.status === "missing").length;

  const lines: string[] = [
    "4. DID WE COVER THE INSTRUCTION?",
    `   completeness   ${completeness.length} items   covered=${covered}  partial=${partial}  missing=${missing}`,
  ];

  if (completeness.length === 0) {
    lines.push("     (no completeness check — catalog did not emit requirement mappings)");
  } else {
    for (const item of completeness) {
      const mark = STATUS_MARK[item.status] ?? `[${item.status}]`;
      const mapped = item.mappedCapabilityIds.length
        ? ` → ${item.mappedCapabilityIds.join(", ")}`
        : "";
      lines.push(`     ${mark} ${item.requirementId}${mapped}`);
      if (item.reason) lines.push(...wrapPrefixed("         ", item.reason));
    }
  }

  lines.push("");
  lines.push("   requirement → capability mapping");
  if (mappings.length === 0) {
    lines.push("     (none)");
  } else {
    for (const mapping of mappings) {
      const caps = mapping.capabilityIds.length
        ? mapping.capabilityIds.join(", ")
        : "(unmapped)";
      lines.push(`     ${mapping.requirementId}`);
      lines.push(`         ${caps}  [${mapping.source}]`);
    }
  }

  lines.push("");
  lines.push(`   unresolvedNeeds  ${unresolved.length}`);
  if (unresolved.length === 0) {
    lines.push("     (none)");
  } else {
    for (const need of unresolved) {
      lines.push(`     [X] ${need.requirement}`);
      lines.push(...wrapPrefixed("         ", need.reason));
    }
  }

  return lines;
}

function formatGraphSection(args: {
  auditRecord: PlanAuditRecord;
  workUnits: AnalysisWorkUnit[];
  rendererSchemaId: string;
  relatedCount: number;
  docType?: string;
  intent: IntentClassification;
}): string[] {
  const spec = args.auditRecord.reportSpec;
  return [
    "5. REPORT + ACT GRAPH",
    `   docType        ${args.docType ?? args.intent.docTypeHint ?? "-"}`,
    `   reportType     ${spec.reportType}`,
    `   depth          ${spec.depth}`,
    `   sections       ${spec.sections.join(" → ") || "(none)"}`,
    `   outlineItems   ${spec.outline?.length ?? 0}`,
    `   outlineAnalysis ${spec.outline?.filter((i) => i.role === "analysis" || i.role === "chapeau_particulars" || i.role === "key_findings" || i.role === "requirements_matrix").length ?? 0}`,
    `   renderer       ${args.rendererSchemaId}`,
    `   relatedChecks  ${args.relatedCount}`,
    `   webLookup      ${args.intent.unresolvedStandard ? args.intent.unresolvedStandard : "no"}`,
    `   workUnits      ${args.workUnits.length}   ${summarizeTools(args.workUnits)}`,
  ];
}

function formatCapabilityLine(
  id: string,
  provenance?: { source: string; kind: string; required: boolean; reason?: string }
): string {
  if (!provenance) return `* ${id}`;
  const extra = provenance.reason ? `  — ${truncate(provenance.reason, 80)}` : "";
  return `* ${id}   [${provenance.kind}/${provenance.source}]${extra}`;
}

function summarizeIds(ids: string[], emptyLabel: string): string {
  if (ids.length === 0) return emptyLabel;
  if (ids.length <= 8) return `${ids.length}: ${ids.join(", ")}`;
  return `${ids.length}: ${ids.slice(0, 6).join(", ")}, … (+${ids.length - 6} more)`;
}

function fmtConf(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}
