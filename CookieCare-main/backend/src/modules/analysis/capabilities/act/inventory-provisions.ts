import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { AnalysisArtifact } from "../../models/evidence-package.js";
import type { Finding } from "../../models/finding.js";
import type {
  TransferInventory,
  TransferMechanism,
  TransferRecord,
} from "../../models/transfer-inventory.js";
import { normalizeTransferMechanism } from "../../models/transfer-inventory.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { insufficient } from "./act-utils.js";
import { pacLog } from "../../utils/pac-log.js";
import {
  buildRetrievalDictionary,
  locateEvidence,
  type ClauseCandidate,
} from "./locate-evidence.js";

const MAX_CANDIDATE_CHARS = 8_000;
const MAX_RECORDS = 40;

const INVENTORY_SYSTEM_PROMPT = [
  "You extract structured inventory records from the supplied document sections.",
  "Do not decide legal compliance. Do not invent provisions that are not in the text.",
  "If a field is not stated, omit it or use unspecified.",
].join(" ");

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
  const located = clauseTypes.length > 0 ? locateEvidence(doc, clauseTypes, dict) : [];
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

  let rawRecords: RawInventoryRecord[] = [];
  if (candidateText.trim()) {
    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          sectionTitle: { type: "string" },
          quotedText: { type: "string" },
          mechanism: { type: "string" },
          destinationJurisdiction: { type: "string" },
          sourceJurisdiction: { type: "string" },
          legalBasis: { type: "array", items: { type: "string" } },
          supplementaryMeasures: { type: "array", items: { type: "string" } },
          references: { type: "array", items: { type: "string" } },
          applicability: { type: "string" },
        },
      },
    };
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
  const artifact = buildArtifact(
    packageId,
    outputArtifactType,
    packageVersion,
    requirementIds,
    docId,
    Array.isArray(rawRecords) ? rawRecords : [],
    extraAliases
  );

  const extractionFinding: Finding = {
    findingId: `f_inv_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status:
      artifactTypeRecordCount(artifact) > 0 ? "present" : "insufficient_evidence",
    claim: inventoryClaim(artifact),
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
    records: artifactTypeRecordCount(artifact),
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

function buildArtifact(
  packageId: string,
  type: string,
  version: string | undefined,
  requirementIds: string[],
  docId: string,
  rawRecords: RawInventoryRecord[],
  extraAliases?: Record<string, string>
): AnalysisArtifact {
  if (type === "transfer_inventory") {
    const transfers: TransferRecord[] = rawRecords.slice(0, MAX_RECORDS).map((raw, index) => ({
      id: raw.id?.trim() || `transfer_${index + 1}`,
      evidenceIds: [],
      sectionIds: raw.sectionTitle ? [raw.sectionTitle] : undefined,
      sourceJurisdiction: raw.sourceJurisdiction,
      destinationJurisdiction: raw.destinationJurisdiction,
      mechanism: normalizeTransferMechanism(raw.mechanism, extraAliases),
      legalBasis: raw.legalBasis,
      supplementaryMeasures: raw.supplementaryMeasures,
      references: raw.references,
      applicability: raw.applicability,
      quotedText: raw.quotedText,
    }));
    const mechanisms = [...new Set(transfers.map((t) => t.mechanism))] as TransferMechanism[];
    const jurisdictions = [
      ...new Set(
        transfers.flatMap((t) =>
          [t.sourceJurisdiction, t.destinationJurisdiction].filter(
            (v): v is string => Boolean(v)
          )
        )
      ),
    ];
    const referenced = [
      ...new Set(transfers.flatMap((t) => t.references ?? [])),
    ];
    const data: TransferInventory = {
      transfers,
      referencedTransferDocuments: referenced,
      unresolvedReferences: [],
      jurisdictions,
      mechanisms,
    };
    return {
      id: packageId,
      type,
      packageId,
      version,
      requirementIds,
      data,
      provenance: { documentIds: [docId], sourceTier: "authored" },
    };
  }

  return {
    id: packageId,
    type,
    packageId,
    version,
    requirementIds,
    data: { records: rawRecords.slice(0, MAX_RECORDS) },
    provenance: { documentIds: [docId], sourceTier: "authored" },
  };
}

function artifactTypeRecordCount(artifact: AnalysisArtifact): number {
  const data = artifact.data as { transfers?: unknown[]; records?: unknown[] };
  return data.transfers?.length ?? data.records?.length ?? 0;
}

function inventoryClaim(artifact: AnalysisArtifact): string {
  const count = artifactTypeRecordCount(artifact);
  if (artifact.type === "transfer_inventory") {
    const data = artifact.data as TransferInventory;
    const mechanisms = data.mechanisms.filter((m) => m !== "unspecified");
    if (count === 0) {
      return "No international transfer provisions were identified in the retrieved sections.";
    }
    return `Identified ${count} international transfer provision(s)${
      mechanisms.length ? ` (mechanisms: ${mechanisms.join(", ")})` : ""
    }.`;
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

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((v) => typeof v === "string");
}
