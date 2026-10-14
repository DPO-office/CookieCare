import { executeEmbedding } from "../../../../../../llm/index.js";
import { bm25Search, sparseTokens } from "./evidence-index.js";
import type {
  EvidenceUnit,
  InvestigationLogger,
  InvestigationRequirement,
  RankedEvidenceCandidate,
  RequirementSearchPlan,
  RetrievalChannel,
  RetrievalHit,
} from "./types.js";

const EXACT_LIMIT = 8;
const SPARSE_LIMIT = 25;
const DENSE_LIMIT = 25;
const RRF_K = 60;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : 0;
}

function aggregateChannel(
  hits: Array<{ unit: EvidenceUnit; score: number; query: string }>,
  channel: RetrievalChannel,
  limit: number
): RetrievalHit[] {
  const best = new Map<string, { unit: EvidenceUnit; score: number; query: string }>();
  for (const hit of hits) {
    const current = best.get(hit.unit.unitId);
    if (!current || hit.score > current.score) best.set(hit.unit.unitId, hit);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit, index) => ({
      unitId: hit.unit.unitId,
      channel,
      query: hit.query,
      rank: index + 1,
      score: hit.score,
    }));
}

function scopeCompatible(unit: EvidenceUnit, requirement: InvestigationRequirement): boolean {
  const allowed = new Set(requirement.evidenceScope?.relationshipScopes ?? []);
  return allowed.size === 0 || unit.relationshipScope === "unspecified" || allowed.has(unit.relationshipScope as never);
}

export interface HybridRetrievalInput {
  requirement: InvestigationRequirement;
  plan: RequirementSearchPlan;
  units: EvidenceUnit[];
  unitEmbeddings: Map<string, number[]>;
  embedQueries?: (texts: string[]) => Promise<Array<number[] | null>>;
  logger?: InvestigationLogger;
}

export async function retrieveHybridCandidates(
  input: HybridRetrievalInput
): Promise<RankedEvidenceCandidate[]> {
  const units = input.units.filter((unit) => scopeCompatible(unit, input.requirement));
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));
  const queryVectorsPromise = input.unitEmbeddings.size > 0 && input.plan.denseQueries.length > 0
    ? (input.embedQueries ?? executeEmbedding)(input.plan.denseQueries).catch((error) => {
        input.logger?.("compliance.investigation.embedding.degraded", {
          documentId: input.requirement.documentId,
          requirementId: input.requirement.requirementId,
          operation: "query",
          error: error instanceof Error ? error.message : String(error),
        });
        return input.plan.denseQueries.map(() => null);
      })
    : Promise.resolve(input.plan.denseQueries.map(() => null));

  const exactRows: Array<{ unit: EvidenceUnit; score: number; query: string }> = [];
  for (const query of input.plan.exactQueries) {
    const needle = query.toLowerCase();
    for (const unit of units) {
      if (unit.searchText.toLowerCase().includes(needle)) {
        exactRows.push({ unit, score: query.split(/\s+/).length + 1, query });
      }
    }
  }

  const sparseRows: Array<{ unit: EvidenceUnit; score: number; query: string }> = [];
  for (const query of input.plan.sparseQueries) {
    for (const row of bm25Search(units, query, SPARSE_LIMIT)) {
      sparseRows.push({ ...row, query });
    }
  }

  const denseRows: Array<{ unit: EvidenceUnit; score: number; query: string }> = [];
  if (input.unitEmbeddings.size > 0 && input.plan.denseQueries.length > 0) {
    // The promise starts before exact/BM25 work above, so the three channels
    // execute concurrently even though the lexical arms are synchronous.
    const queryVectors = await queryVectorsPromise;
    input.plan.denseQueries.forEach((query, queryIndex) => {
      const vector = queryVectors[queryIndex];
      if (!vector) return;
      for (const unit of units) {
        const unitVector = input.unitEmbeddings.get(unit.unitId);
        if (!unitVector) continue;
        const score = cosine(vector, unitVector);
        if (score > 0) denseRows.push({ unit, score, query });
      }
    });
  }

  const hits = [
    ...aggregateChannel(exactRows, "exact", EXACT_LIMIT),
    ...aggregateChannel(sparseRows, "sparse", SPARSE_LIMIT),
    ...aggregateChannel(denseRows, "dense", DENSE_LIMIT),
  ];
  const candidates = new Map<string, RankedEvidenceCandidate>();
  for (const hit of hits) {
    const unit = byId.get(hit.unitId);
    if (!unit) continue;
    const candidate = candidates.get(hit.unitId) ?? {
      unit,
      fusedScore: 0,
      rerankScore: 0,
      channelRanks: {},
      channelScores: {},
      matchedQueries: [],
      signals: [],
    };
    candidate.fusedScore += 1 / (RRF_K + hit.rank);
    candidate.channelRanks[hit.channel] = hit.rank;
    candidate.channelScores[hit.channel] = hit.score;
    candidate.matchedQueries.push(hit.query);
    candidate.signals.push(`retrieved:${hit.channel}`);
    candidates.set(hit.unitId, candidate);
  }

  // Normalise RRF before deterministic structural/metadata signals.
  const max = Math.max(...[...candidates.values()].map((candidate) => candidate.fusedScore), 1);
  for (const candidate of candidates.values()) {
    candidate.fusedScore /= max;
    candidate.rerankScore = candidate.fusedScore;
    const hay = candidate.unit.searchText.toLowerCase();
    const hypothesisTokens = sparseTokens(input.requirement.profile.hypothesis ?? "");
    const heading = `${candidate.unit.parentHeading ?? ""} ${candidate.unit.title ?? ""}`.toLowerCase();
    if (candidate.channelRanks.exact) {
      candidate.rerankScore += 0.12;
      candidate.signals.push("exact_anchor");
    }
    if (Object.keys(candidate.channelRanks).length >= 2) {
      candidate.rerankScore += 0.08;
      candidate.signals.push("multi_channel");
    }
    if (Object.keys(candidate.channelRanks).length === 1 && candidate.channelRanks.sparse) {
      candidate.rerankScore -= 0.05;
      candidate.signals.push("sparse_only_penalty");
    }
    if (hypothesisTokens.some((token) => token.length >= 5 && heading.includes(token))) {
      candidate.rerankScore += 0.05;
      candidate.signals.push("heading_alignment");
    }
    if (/\b(shall|must|required to|only|may not|will not|is prohibited)\b/i.test(hay)) {
      candidate.rerankScore += 0.04;
      candidate.signals.push("operative_modality");
    }
    if (candidate.unit.namespace === "main") {
      candidate.rerankScore += 0.02;
      candidate.signals.push("primary_namespace");
    }
    if (/\b(see|refer(?:s|red)? to)\b/i.test(candidate.unit.rawText) &&
        !/\b(shall|must|required to|only|may not|will not|is prohibited)\b/i.test(candidate.unit.rawText)) {
      candidate.rerankScore -= 0.08;
      candidate.signals.push("mere_reference_penalty");
    }
    if (candidate.unit.nodeKind === "definition") {
      candidate.rerankScore -= 0.12;
      candidate.signals.push("definition_penalty");
    }
  }
  return [...candidates.values()].sort((a, b) => b.rerankScore - a.rerankScore);
}

/** Select a bounded review pool while reserving one result per successful channel. */
export function selectReviewPool(
  candidates: RankedEvidenceCandidate[],
  limit = 16
): RankedEvidenceCandidate[] {
  const selected = new Map<string, RankedEvidenceCandidate>();
  for (const channel of ["exact", "sparse", "dense"] as const) {
    const best = candidates.find((candidate) => candidate.channelRanks[channel] !== undefined);
    if (best) selected.set(best.unit.unitId, best);
  }
  for (const candidate of candidates) {
    if (selected.size >= limit) break;
    selected.set(candidate.unit.unitId, candidate);
  }
  return [...selected.values()].sort((a, b) => b.rerankScore - a.rerankScore);
}
