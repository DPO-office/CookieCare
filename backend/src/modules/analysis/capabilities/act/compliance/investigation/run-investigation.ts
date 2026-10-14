import type { AnalysisState } from "../../../../models/analysis-state.js";
import { config } from "../../../../../../config/index.js";
import { buildRequirementSearchPlan } from "./build-queries.js";
import { buildRequirementEvidenceBundle } from "./build-bundle.js";
import { buildDpa5GdprDemoBundles } from "./demo-evidence-bundles.js";
import { resolveEvidenceEmbeddings } from "./embedding-cache-repository.js";
import { buildEvidenceUnits } from "./evidence-index.js";
import { expandSelectedEvidence } from "./expand-evidence.js";
import { retrieveHybridCandidates, selectReviewPool } from "./hybrid-retrieval.js";
import { resolveInvestigationRequirements } from "./requirement-source.js";
import { reviewCandidateBatches } from "./rerank-evidence.js";
import type {
  EvidenceEmbeddingCache,
  InvestigationLogger,
  InvestigationRunResult,
  RankedEvidenceCandidate,
  RequirementEvidenceBundle,
} from "./types.js";

export interface RunGraphNativeInvestigationOptions {
  /** Bounded runtime retry of existing selected requirements; never adds legal scope. */
  requirements?: import("./types.js").InvestigationRequirement[];
  additionalQueries?: string[];
  userId?: string;
  cache?: EvidenceEmbeddingCache;
  embedUnits?: (texts: string[]) => Promise<Array<number[] | null>>;
  embedQueries?: (texts: string[]) => Promise<Array<number[] | null>>;
  reviewer?: typeof reviewCandidateBatches;
  logger?: InvestigationLogger;
  reviewConcurrency?: number;
  signal?: AbortSignal;
  targetNodeIds?: string[];
  scheduleCall?: <T>(work: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
}

export async function runGraphNativeInvestigation(
  state: AnalysisState,
  options: RunGraphNativeInvestigationOptions = {}
): Promise<InvestigationRunResult> {
  const startedAt = Date.now();
  const resolution = options.requirements ? { requirements: options.requirements, issues: [] as import("./types.js").InvestigationResolutionIssue[] } : resolveInvestigationRequirements(state);
  const bundlesByRequirement = new Map<string, RequirementEvidenceBundle>();
  let indexMs = 0;
  let retrievalMs = 0;
  let reviewMs = 0;
  let expansionMs = 0;
  const byDocument = new Map<string, typeof resolution.requirements>();
  for (const requirement of resolution.requirements) {
    const list = byDocument.get(requirement.documentId) ?? [];
    list.push(requirement);
    byDocument.set(requirement.documentId, list);
  }

  for (const [documentId, documentRequirements] of byDocument) {
    const document = state.workspace.documents.find((candidate) => candidate.docId === documentId);
    let requirements = documentRequirements;
    if (config.demoMode && document) {
      const demo = buildDpa5GdprDemoBundles(document, requirements);
      if (demo) {
        for (const [key, bundle] of demo.bundlesByRequirement) bundlesByRequirement.set(key, bundle);
        requirements = requirements.filter((requirement) => !demo.handledRequirementIds.has(requirement.requirementId));
        options.logger?.("compliance.investigation.demo_bundle.loaded", {
          documentId,
          documentKey: demo.documentKey,
          requirementIds: [...demo.handledRequirementIds],
          bundleCount: demo.bundlesByRequirement.size,
        });
        if (requirements.length === 0) continue;
      }
    }
    const graph = document?.structureGraph;
    if (!graph) {
      for (const requirement of requirements) {
        resolution.issues.push({
          documentId,
          requirementId: requirement.requirementId,
          packageId: requirement.packageId,
          reason: "graph_missing",
          detail: "The upload-time canonical document graph is unavailable.",
        });
      }
      continue;
    }

    const indexStarted = Date.now();
    const units = buildEvidenceUnits(graph);
    const embeddings = await resolveEvidenceEmbeddings({
      units,
      userId: options.userId,
      cache: options.cache,
      embed: options.embedUnits,
      logger: options.logger,
    });
    indexMs += Date.now() - indexStarted;

    const entries: Array<{ requirement: (typeof requirements)[number]; candidates: RankedEvidenceCandidate[] }> = [];
    const retrievalStarted = Date.now();
    for (const requirement of requirements) {
      const plan = buildRequirementSearchPlan(requirement);
      if (options.additionalQueries?.length) {
        plan.sparseQueries.push(...options.additionalQueries);
        plan.denseQueries.push(...options.additionalQueries);
      }
      const retrieved = await retrieveHybridCandidates({
        requirement,
        plan,
        units,
        unitEmbeddings: embeddings,
        embedQueries: options.embedQueries,
        logger: options.logger,
      });
      const pool = selectReviewPool(retrieved);
      // A verifier request may name an already-resolved graph target omitted
      // from the earlier bundle. Review that exact in-scope node, not a guess.
      for (const unit of units.filter(u => options.targetNodeIds?.includes(u.nodeId))) {
        if (!pool.some(c => c.unit.unitId === unit.unitId)) pool.push({ unit, fusedScore: 1, rerankScore: 1,
          channelRanks: {}, channelScores: {}, matchedQueries: [], signals: ["verification:dependency_target"] });
      }
      entries.push({ requirement, candidates: pool });
      options.logger?.("compliance.investigation.retrieval.completed", {
        documentId,
        requirementId: requirement.requirementId,
        candidateCount: retrieved.length,
        reviewPoolCount: pool.length,
      });
    }
    retrievalMs += Date.now() - retrievalStarted;

    const reviewStarted = Date.now();
    const reviewer = options.reviewer ?? reviewCandidateBatches;
    const review = await reviewer({ state, entries, logger: options.logger, concurrency: options.reviewConcurrency, signal: options.signal, scheduleCall: options.scheduleCall });
    reviewMs += Date.now() - reviewStarted;

    const expandedEntries: typeof entries = [];
    const incompleteReasonsByRequirement = new Map<string, string[]>();
    const expansionStarted = Date.now();
    for (const entry of entries) {
      const requirementId = entry.requirement.requirementId;
      const decisions = review.decisionsByRequirement.get(requirementId) ?? [];
      const expanded = expandSelectedEvidence({
        requirement: entry.requirement,
        candidates: entry.candidates,
        decisions,
      });
      const incompleteReasons: string[] = [];
      if (review.unavailableRequirementIds.has(requirementId)) {
        incompleteReasons.push("semantic_review_unavailable");
      }
      if (expanded.length > 0) {
        expandedEntries.push({ requirement: entry.requirement, candidates: expanded });
      }
      incompleteReasonsByRequirement.set(requirementId, incompleteReasons);
    }

    // Expansion review is one bounded, cross-requirement batch rather than one
    // model call per requirement. This keeps Article 28 packages predictable.
    const expansionReview = expandedEntries.length > 0
      ? await reviewer({ state, entries: expandedEntries, logger: options.logger, concurrency: options.reviewConcurrency, signal: options.signal, scheduleCall: options.scheduleCall })
      : {
          decisionsByRequirement: new Map(),
          unresolvedByRequirement: new Map(),
          unavailableRequirementIds: new Set<string>(),
        };
    expansionMs += Date.now() - expansionStarted;

    const expandedByRequirement = new Map(
      expandedEntries.map((entry) => [entry.requirement.requirementId, entry.candidates])
    );
    for (const entry of entries) {
      const requirementId = entry.requirement.requirementId;
      const decisions = review.decisionsByRequirement.get(requirementId) ?? [];
      const expanded = expandedByRequirement.get(requirementId) ?? [];
      const expansionDecisions = expansionReview.decisionsByRequirement.get(requirementId) ?? [];
      const incompleteReasons = incompleteReasonsByRequirement.get(requirementId) ?? [];
      if (expansionReview.unavailableRequirementIds.has(requirementId)) {
        incompleteReasons.push("dependency_review_unavailable");
      }
      const allCandidates = [...entry.candidates, ...expanded];
      const bundle = buildRequirementEvidenceBundle({
        requirement: entry.requirement,
        candidates: allCandidates,
        decisions: [...decisions, ...expansionDecisions],
        unresolvedElementIds: [
          ...(review.unresolvedByRequirement.get(requirementId) ?? []),
          ...(expansionReview.unresolvedByRequirement.get(requirementId) ?? []),
        ],
        incompleteReasons,
      });
      bundlesByRequirement.set(`${documentId}::${requirementId}`, bundle);
      options.logger?.("compliance.investigation.bundle.created", {
        documentId,
        requirementId,
        candidateCount: bundle.candidateCount,
        passageCount: bundle.passages.length,
        roles: bundle.passages.map((passage) => passage.role),
        investigationComplete: bundle.investigationComplete,
        incompleteReasons: bundle.incompleteReasons,
      });
    }
  }

  // Canonical mode must never inherit an old retrieval result merely because
  // an authoritative input could not be resolved. Materialize a safe empty
  // result for every such requirement and carry the reason downstream.
  for (const issue of resolution.issues) {
    const key = `${issue.documentId}::${issue.requirementId}`;
    const existing = bundlesByRequirement.get(key);
    if (existing) {
      existing.investigationComplete = false;
      existing.executionStatus = "incomplete";
      existing.coverageReasons = [...(existing.coverageReasons ?? []), issue.reason];
      existing.incompleteReasons = [...new Set([...existing.incompleteReasons, issue.reason])];
      continue;
    }
    bundlesByRequirement.set(key, {
      bundleId: `INV-INCOMPLETE-${issue.requirementId}-${issue.documentId}`.slice(0, 120),
      requirementId: issue.requirementId,
      packageId: issue.packageId ?? "unresolved",
      documentId: issue.documentId,
      passages: [],
      coveredElementIds: [],
      unresolvedElementIds: [],
      dependencies: [],
      exclusions: [{ reason: `${issue.reason}:${issue.detail}` }],
      investigationComplete: false,
      executionStatus: "incomplete",
      coverageReasons: [issue.reason],
      incompleteReasons: [issue.reason],
      candidateCount: 0,
      retrievalChannelCounts: { exact: 0, sparse: 0, dense: 0 },
      candidateProvenance: [],
    });
  }

  return {
    bundlesByRequirement,
    resolutionIssues: resolution.issues,
    timings: {
      indexMs,
      retrievalMs,
      reviewMs,
      expansionMs,
      totalMs: Date.now() - startedAt,
    },
  };
}
