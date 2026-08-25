import { INVENTORY_SYSTEM_PROMPT } from "../../prompts/inventory-provisions.js";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type {
  AnalysisArtifact,
  InventoryArtifactShape,
  InventoryDerivedAggregate,
  InventoryFieldSpec,
} from "../../models/evidence-package.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { insufficient } from "./act-utils.js";
import { pacLog } from "../../utils/pac-log.js";
import { profileEvidenceCharBudget } from "../../utils/profile-thinking.js";
import {
  buildRetrievalDictionary,
  locateEvidence,
  type ClauseCandidate,
} from "./locate-evidence.js";

const MAX_CANDIDATE_CHARS = 8_000;
const MAX_RECORDS = 40;

interface RawInventoryRecord {
  id?: string;
  sectionTitle?: string;
  quotedText?: string;
  mechanism?: string;
  destinationJurisdiction?: string;
  sourceJurisdiction?: string;
  legalBasis?: string[];
  supplementaryMeasures?: string[];
  references?: string[];
  applicability?: string;
  [key: string]: unknown;
}

/**
 * Generic inventory package runner. Retrieves candidate sections, optionally
 * calls a small structured LLM, normalizes records, and writes an artifact.
 */
export async function inventoryProvisions(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const packageId = String(unit.input.packageId ?? "");
  const docId = String(unit.input.docId ?? "");
  const clauseTypes = (unit.input.clauseTypes as string[]) ?? [];
  const extractionTargets = (unit.input.extractionTargets as string[]) ?? [];
  const requirementIds = (unit.input.requirementIds as string[]) ?? [];
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const outputArtifactType = String(unit.input.outputArtifactType ?? "inventory");
  const config = (unit.input.config as Record<string, unknown>) ?? {};
  const packageVersion =
    typeof unit.input.packageVersion === "string" ? unit.input.packageVersion : undefined;

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Inventory package ${packageId}: document not found`)],
    };
  }

  const skills = skillIds.map((id) => getSkillById(id)).filter(Boolean);
  const dict = buildRetrievalDictionary(
    skills as NonNullable<ReturnType<typeof getSkillById>>[],
    clauseTypes
  );
  const located = clauseTypes.length > 0 ? locateEvidence(doc, clauseTypes, dict, profileEvidenceCharBudget(state)) : [];
  const candidates: ClauseCandidate[] = located.flatMap((result) => result.candidates);
  const extraFromClauses = (doc.clauses ?? [])
    .filter((c) => clauseTypes.length === 0 || clauseTypes.includes(c.clauseType))
    .map((c, index) => ({
      clauseType: c.clauseType,
      segmentId: c.locator.structuralPath,
      sectionTitle: c.locator.structuralPath,
      startOffset: c.locator.charRange[0],
      endOffset: c.locator.charRange[1],
      text: c.text,
      matchReason: "extracted-clause",
      score: 50,
    }));
  const combined = dedupeCandidates([...candidates, ...extraFromClauses]).slice(0, 12);
  const candidateText = combined
    .map(
      (c, i) =>
        `[S${i + 1}] ${c.sectionTitle ?? c.segmentId}\n${c.text.slice(0, 1800)}`
    )
    .join("\n\n")
    .slice(0, MAX_CANDIDATE_CHARS);

  const artifactShape = parseArtifactShape(config.artifactShape);
  let rawRecords: RawInventoryRecord[] = [];
  if (candidateText.trim()) {
    const schema = buildExtractionSchema(artifactShape);
    const targets =
      extractionTargets.length > 0
        ? `Extract these fields when present: ${extractionTargets.join(", ")}.`
        : "Extract every distinct provision/entity described in the sections.";
    try {
      rawRecords = await executeJsonCompletion<RawInventoryRecord[]>(
        [
          `User instruction: ${String(unit.input.instruction ?? state.request.instruction ?? "")}`,
          targets,
          "",
          "Document sections:",
          candidateText || "(no candidate sections retrieved)",
        ].join("\n"),
        INVENTORY_SYSTEM_PROMPT,
        schema,
        LLMTask.STRUCTURAL_JSON_LITE,
        LLMProvider.GEMINI
      );
    } catch (err) {
      pacLog("inventory_provisions llm failed; using heuristic records", {
        packageId,
        error: err instanceof Error ? err.message : String(err),
      });
      rawRecords = heuristicRecords(combined);
    }
  }

  const extraAliases = isStringRecord(config.mechanismAliases)
    ? config.mechanismAliases
    : undefined;
  const artifact = buildInventoryArtifact({
    packageId,
    outputArtifactType,
    packageVersion,
    requirementIds,
    docId,
    rawRecords: Array.isArray(rawRecords) ? rawRecords : [],
    extraAliases,
    artifactShape,
  });

  const extractionFinding: Finding = {
    findingId: `f_inv_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status:
      artifactTypeRecordCount(artifact, artifactShape) > 0 ? "present" : "insufficient_evidence",
    claim: inventoryClaim(artifact, artifactShape),
    evidence: combined.slice(0, 4).map((c) => ({
      locator: {
        docId,
        structuralPath: c.segmentId,
        charRange: [c.startOffset, c.endOffset] as [number, number],
      },
      quotedText: c.text.slice(0, 400),
      sourceRole: "target" as const,
    })),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId: skillIds[0],
    visibility: "user_facing",
    requirementId: requirementIds[0],
  };

  pacLog("inventory_provisions", {
    id: unit.workUnitId,
    packageId,
    candidates: combined.length,
    records: artifactTypeRecordCount(artifact, artifactShape),
  });

  return {
    state: {
      ...state,
      analysisArtifacts: {
        ...(state.analysisArtifacts ?? {}),
        [packageId]: artifact,
      },
    },
    findings: [...findings, extractionFinding],
  };
}

export function parseArtifactShape(value: unknown): InventoryArtifactShape {
  if (!value || typeof value !== "object") {
    return { kind: "records" };
  }
  const rec = value as Record<string, unknown>;
  if (rec.kind === "typed_records" && typeof rec.recordType === "string") {
    return {
      kind: "typed_records",
      recordType: rec.recordType,
      recordsKey: typeof rec.recordsKey === "string" ? rec.recordsKey : undefined,
      maxRecords: typeof rec.maxRecords === "number" ? rec.maxRecords : undefined,
      mechanismAliases: isStringRecord(rec.mechanismAliases)
        ? rec.mechanismAliases
        : undefined,
      fieldSpec: parseFieldSpec(rec.fieldSpec),
      derivedAggregates: parseDerivedAggregates(rec.derivedAggregates),
      claimMechanismAggregate:
        typeof rec.claimMechanismAggregate === "string"
          ? rec.claimMechanismAggregate
          : undefined,
      emptyClaim: typeof rec.emptyClaim === "string" ? rec.emptyClaim : undefined,
      presentClaim: typeof rec.presentClaim === "string" ? rec.presentClaim : undefined,
    };
  }
  if (rec.kind === "records") {
    return {
      kind: "records",
      maxRecords: typeof rec.maxRecords === "number" ? rec.maxRecords : undefined,
      emptyClaim: typeof rec.emptyClaim === "string" ? rec.emptyClaim : undefined,
      presentClaim: typeof rec.presentClaim === "string" ? rec.presentClaim : undefined,
    };
  }
  return { kind: "records" };
}

export function buildInventoryArtifact(args: {
  packageId: string;
  outputArtifactType: string;
  packageVersion: string | undefined;
  requirementIds: string[];
  docId: string;
  rawRecords: RawInventoryRecord[];
  extraAliases?: Record<string, string>;
  artifactShape: InventoryArtifactShape;
}): AnalysisArtifact {
  const maxRecords = args.artifactShape.maxRecords ?? MAX_RECORDS;
  const aliases = {
    ...(args.artifactShape.kind === "typed_records"
      ? args.artifactShape.mechanismAliases
      : undefined),
    ...args.extraAliases,
  };
  const mergedAliases = Object.keys(aliases).length > 0 ? aliases : undefined;

  let data: unknown = { records: args.rawRecords.slice(0, maxRecords) };
  if (args.artifactShape.kind === "typed_records" && args.artifactShape.fieldSpec?.length) {
    const recordsKey = args.artifactShape.recordsKey ?? "records";
    const records = applyFieldSpec(
      args.rawRecords,
      args.artifactShape.fieldSpec,
      maxRecords,
      mergedAliases
    );
    data = applyDerivedAggregates(records, args.artifactShape.derivedAggregates ?? [], recordsKey);
  }

  return {
    id: args.packageId,
    type: args.outputArtifactType,
    packageId: args.packageId,
    version: args.packageVersion,
    requirementIds: args.requirementIds,
    data,
    provenance: { documentIds: [args.docId], sourceTier: "authored" },
  };
}

function applyFieldSpec(
  rawRecords: RawInventoryRecord[],
  fieldSpec: InventoryFieldSpec[],
  maxRecords: number,
  aliases?: Record<string, string>
): Record<string, unknown>[] {
  return rawRecords.slice(0, maxRecords).map((raw, index) => {
    const record: Record<string, unknown> = {};
    for (const field of fieldSpec) {
      if (field.source === "_evidenceIds") {
        record[field.name] = field.defaultValue ?? [];
        continue;
      }
      if (field.source === "_id") {
        record[field.name] =
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `record_${index + 1}`;
        continue;
      }
      if (field.source === "_sectionIds") {
        record[field.name] = raw.sectionTitle ? [raw.sectionTitle] : undefined;
        continue;
      }
      let value = raw[field.source];
      if (field.normalizeAliases && typeof value === "string" && aliases) {
        value = normalizeWithAliases(value, aliases);
      }
      if (value === undefined || value === null || value === "") {
        if (field.defaultValue !== undefined) record[field.name] = field.defaultValue;
        continue;
      }
      record[field.name] = value;
    }
    return record;
  });
}

function applyDerivedAggregates(
  records: Record<string, unknown>[],
  aggregates: InventoryDerivedAggregate[],
  recordsKey: string
): Record<string, unknown> {
  const data: Record<string, unknown> = { [recordsKey]: records };
  for (const agg of aggregates) {
    if (agg.constant !== undefined) {
      data[agg.name] = agg.constant;
      continue;
    }
    const sources = agg.fromFields?.length
      ? agg.fromFields
      : agg.from
        ? [agg.from]
        : [];
    let values: unknown[] = [];
    for (const record of records) {
      for (const source of sources) {
        const value = record[source];
        if (agg.flatMap && Array.isArray(value)) {
          values.push(...value);
        } else if (value !== undefined && value !== null && value !== "") {
          values.push(value);
        }
      }
    }
    if (agg.exclude?.length) {
      values = values.filter((v) => !agg.exclude!.includes(String(v)));
    }
    if (agg.unique) {
      values = [...new Set(values.map(String))];
    }
    data[agg.name] = values;
  }
  return data;
}

function normalizeWithAliases(value: string, aliases: Record<string, string>): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (lower.includes(alias.toLowerCase())) return canonical;
  }
  return trimmed;
}

function buildExtractionSchema(shape: InventoryArtifactShape): Record<string, unknown> {
  if (shape.kind !== "typed_records" || !shape.fieldSpec?.length) {
    return {
      type: "array",
      items: { type: "object", additionalProperties: true },
    };
  }
  const properties: Record<string, unknown> = {};
  for (const field of shape.fieldSpec) {
    if (field.source.startsWith("_")) continue;
    if (field.source === "legalBasis" || field.source === "supplementaryMeasures" || field.source === "references") {
      properties[field.source] = { type: "array", items: { type: "string" } };
    } else {
      properties[field.source] = { type: "string" };
    }
  }
  return { type: "array", items: { type: "object", properties } };
}

function artifactTypeRecordCount(
  artifact: AnalysisArtifact,
  shape: InventoryArtifactShape
): number {
  const data = artifact.data as Record<string, unknown>;
  if (shape.kind === "typed_records") {
    const key = shape.recordsKey ?? "records";
    const records = data[key];
    if (Array.isArray(records)) return records.length;
  }
  const records = data.records;
  return Array.isArray(records) ? records.length : 0;
}

export function inventoryClaim(
  artifact: AnalysisArtifact,
  shape: InventoryArtifactShape
): string {
  const count = artifactTypeRecordCount(artifact, shape);
  if (shape.emptyClaim && count === 0) return shape.emptyClaim;
  if (shape.presentClaim && count > 0) {
    const data = artifact.data as Record<string, unknown>;
    const aggName = shape.kind === "typed_records" ? shape.claimMechanismAggregate : undefined;
    const mechanisms = aggName && Array.isArray(data[aggName])
      ? (data[aggName] as string[]).filter((m) => m !== "unspecified")
      : [];
    const mechanismSuffix = mechanisms.length
      ? ` (mechanisms: ${mechanisms.join(", ")})`
      : "";
    return shape.presentClaim
      .replace("{count}", String(count))
      .replace("{mechanisms}", mechanismSuffix);
  }
  return count > 0
    ? `Identified ${count} inventory record(s).`
    : "No inventory records were identified in the retrieved sections.";
}

function heuristicRecords(candidates: ClauseCandidate[]): RawInventoryRecord[] {
  return candidates.map((c, index) => ({
    id: `section_${index + 1}`,
    sectionTitle: c.sectionTitle,
    quotedText: c.text.slice(0, 400),
    mechanism: c.text,
  }));
}

function dedupeCandidates(candidates: ClauseCandidate[]): ClauseCandidate[] {
  const seen = new Set<string>();
  const out: ClauseCandidate[] = [];
  for (const c of candidates) {
    const key = `${c.startOffset}:${c.endOffset}:${c.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function parseFieldSpec(value: unknown): InventoryFieldSpec[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: InventoryFieldSpec[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== "string" || typeof rec.source !== "string") continue;
    out.push({
      name: rec.name,
      source: rec.source,
      normalizeAliases: rec.normalizeAliases === true,
      defaultValue: rec.defaultValue,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseDerivedAggregates(value: unknown): InventoryDerivedAggregate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: InventoryDerivedAggregate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== "string") continue;
    out.push({
      name: rec.name,
      from: typeof rec.from === "string" ? rec.from : undefined,
      fromFields: Array.isArray(rec.fromFields)
        ? rec.fromFields.filter((v): v is string => typeof v === "string")
        : undefined,
      unique: rec.unique === true,
      exclude: Array.isArray(rec.exclude)
        ? rec.exclude.filter((v): v is string => typeof v === "string")
        : undefined,
      flatMap: rec.flatMap === true,
      constant: rec.constant,
    });
  }
  return out.length > 0 ? out : undefined;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((v) => typeof v === "string");
}
