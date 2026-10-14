import type { EvidenceRole, RequirementEvidenceBundle } from "./types.js";

/** Human-reviewed labels. Unlabelled nodes are treated as non-relevant. */
export interface GoldEvidenceCase {
  documentId: string;
  requirementId: string;
  labels: Record<string, EvidenceRole>;
  /** Ambiguous, external, or explicitly scope-incompatible nodes. */
  prohibitedPrimaryNodeIds?: string[];
}

export interface InvestigationEvaluationObservation {
  documentId: string;
  requirementId: string;
  /** Retrieval order before the semantic reviewer, best first. */
  candidateNodeIds: string[];
  bundle: RequirementEvidenceBundle;
}

export interface InvestigationVariantObservation extends InvestigationEvaluationObservation {
  variant:
    | "legacy"
    | "exact_bm25"
    | "dense"
    | "hybrid"
    | "hybrid_reranked"
    | "hybrid_graph_expanded"
    | string;
}

export interface InvestigationQualityMetrics {
  evaluatedRequirements: number;
  goldPrimaryCandidateRecall: number;
  candidateRecallAt40: number;
  finalPrimaryEvidenceRecall: number;
  finalBundlePrecision: number;
  medianBundleSize: number;
  prohibitedPrimaryAdmissions: number;
  oneTerminalRowPerRequirement?: boolean;
}

const relevantRoles = new Set<EvidenceRole>([
  "primary",
  "supporting",
  "dependency",
  "definition",
  "limitation",
  "contradictory",
]);

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Calculates the promotion-gate metrics without guessing legal relevance.
 * Callers must supply human-reviewed labels for each evaluated DPA.
 */
export function evaluateInvestigationQuality(args: {
  gold: GoldEvidenceCase[];
  observations: InvestigationEvaluationObservation[];
  terminalRequirementIds?: string[];
}): InvestigationQualityMetrics {
  const observed = new Map(
    args.observations.map((row) => [`${row.documentId}::${row.requirementId}`, row])
  );
  let primaryCandidateHits = 0;
  let primaryTotal = 0;
  let relevantCandidateHits = 0;
  let relevantTotal = 0;
  let finalPrimaryHits = 0;
  let selectedRelevant = 0;
  let selectedTotal = 0;
  let prohibitedPrimaryAdmissions = 0;
  const bundleSizes: number[] = [];

  for (const goldCase of args.gold) {
    const observation = observed.get(`${goldCase.documentId}::${goldCase.requirementId}`);
    const top40 = new Set(observation?.candidateNodeIds.slice(0, 40) ?? []);
    const primary = Object.entries(goldCase.labels)
      .filter(([, role]) => role === "primary")
      .map(([nodeId]) => nodeId);
    const relevant = Object.entries(goldCase.labels)
      .filter(([, role]) => relevantRoles.has(role))
      .map(([nodeId]) => nodeId);
    primaryTotal += primary.length;
    relevantTotal += relevant.length;
    primaryCandidateHits += primary.filter((nodeId) => top40.has(nodeId)).length;
    relevantCandidateHits += relevant.filter((nodeId) => top40.has(nodeId)).length;

    const passages = observation?.bundle.passages ?? [];
    bundleSizes.push(passages.length);
    const selectedPrimary = new Set(
      passages.filter((passage) => passage.role === "primary").map((passage) => passage.nodeId)
    );
    finalPrimaryHits += primary.filter((nodeId) => selectedPrimary.has(nodeId)).length;
    selectedTotal += passages.length;
    selectedRelevant += passages.filter((passage) => {
      const expected = goldCase.labels[passage.nodeId];
      return expected !== undefined && relevantRoles.has(expected);
    }).length;
    const prohibited = new Set(goldCase.prohibitedPrimaryNodeIds ?? []);
    prohibitedPrimaryAdmissions += [...selectedPrimary].filter((nodeId) => prohibited.has(nodeId)).length;
  }

  const expectedTerminal = new Set(args.gold.map((row) => row.requirementId));
  const terminal = args.terminalRequirementIds ? new Set(args.terminalRequirementIds) : undefined;
  return {
    evaluatedRequirements: args.gold.length,
    goldPrimaryCandidateRecall: ratio(primaryCandidateHits, primaryTotal),
    candidateRecallAt40: ratio(relevantCandidateHits, relevantTotal),
    finalPrimaryEvidenceRecall: ratio(finalPrimaryHits, primaryTotal),
    finalBundlePrecision: ratio(selectedRelevant, selectedTotal),
    medianBundleSize: median(bundleSizes),
    prohibitedPrimaryAdmissions,
    oneTerminalRowPerRequirement: terminal
      ? [...expectedTerminal].every((id) => terminal.has(id)) && terminal.size === expectedTerminal.size
      : undefined,
  };
}

export function investigationPromotionGates(args: {
  baselineGoldPrimaryCandidateRecall: number;
  metrics: InvestigationQualityMetrics;
}): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const metrics = args.metrics;
  if (metrics.goldPrimaryCandidateRecall < args.baselineGoldPrimaryCandidateRecall) {
    failures.push("gold_primary_candidate_recall_below_baseline");
  }
  if (metrics.candidateRecallAt40 < 0.98) failures.push("candidate_recall_at_40_below_0.98");
  if (metrics.finalPrimaryEvidenceRecall < 0.95) failures.push("primary_recall_below_0.95");
  if (metrics.finalBundlePrecision < 0.8) failures.push("bundle_precision_below_0.80");
  if (metrics.medianBundleSize > 10) failures.push("median_bundle_size_above_10");
  if (metrics.prohibitedPrimaryAdmissions > 0) failures.push("prohibited_primary_admission");
  if (metrics.oneTerminalRowPerRequirement === false) failures.push("non_terminal_requirement");
  return { pass: failures.length === 0, failures };
}

export function evaluateInvestigationVariants(args: {
  gold: GoldEvidenceCase[];
  observations: InvestigationVariantObservation[];
  terminalRequirementIdsByVariant?: Record<string, string[]>;
}): Record<string, InvestigationQualityMetrics> {
  const variants = new Map<string, InvestigationEvaluationObservation[]>();
  for (const observation of args.observations) {
    const rows = variants.get(observation.variant) ?? [];
    rows.push(observation);
    variants.set(observation.variant, rows);
  }
  return Object.fromEntries(
    [...variants].map(([variant, observations]) => [
      variant,
      evaluateInvestigationQuality({
        gold: args.gold,
        observations,
        terminalRequirementIds: args.terminalRequirementIdsByVariant?.[variant],
      }),
    ])
  );
}
