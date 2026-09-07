/**
 * STEP 7 (follow-up round) + orchestration + Phase3Bundle adapter.
 *
 * `runLlmAssistedInvestigation` is the single entry point Steps 1-9 compose
 * into. Its output (`RequirementEvidenceBundle[]`) is converted to the
 * EXISTING `Phase3Bundle` shape via `toPhase3Bundle` so `phase4-verify.ts` /
 * `phase4b-llm-verifier.ts` / Phase 5-7 run completely unchanged — this
 * module never touches them.
 */

import type { AnalysisState } from "../../models/analysis-state.js";
import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import { buildSectionCandidates } from "./select-candidates.js";
import { buildInMemoryIndex, type ClauseIndex } from "./clause-index.js";
import type { StructuralNode } from "../../segmentation/structural-nodes.js";
import type { DefinitionIndexEntry, ReferenceRecord } from "../../segmentation/reference-index.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
  Phase3ScopeVector,
} from "./phase3-investigate.js";
import type {
  ComplianceRequirement,
  DocumentMetadata,
  EvidenceCandidate,
  InvestigationBudget,
  RequirementEvidenceBundle,
} from "./investigation-types.js";
import {
  buildEvidenceBundle,
  expandCandidate,
  planInvestigation,
  retrieveForRequirement,
  reviewCandidates,
  validateBundle,
  type InvestigationLogger,
} from "./llm-investigation.js";

export function buildDocumentMetadata(args: {
  documentId: string;
  documentType?: string;
  structuralNodes: StructuralNode[];
  definitions: DefinitionIndexEntry[];
}): DocumentMetadata {
  const { documentId, documentType, structuralNodes, definitions } = args;
  const headingNodes = structuralNodes.filter(
    (n) => n.kind === "heading" || n.kind === "section" || n.kind === "clause"
  );
  const sectionHeadings = [
    ...new Set(
      headingNodes
        .map((n) => n.normalizedText.slice(0, 100))
        .filter((h) => h.length > 0)
    ),
  ].slice(0, 200);
  const definedTerms = [...new Set(definitions.map((d) => d.term))].slice(0, 200);
  const availableSchedules = [
    ...new Set(
      structuralNodes.filter((n) => n.kind === "schedule").map((n) => n.normalizedText.slice(0, 80))
    ),
  ];
  const availableAppendices = [
    ...new Set(
      structuralNodes.filter((n) => n.kind === "appendix").map((n) => n.normalizedText.slice(0, 80))
    ),
  ];
  return {
    documentId,
    documentType,
    sectionHeadings,
    definedTerms,
    availableSchedules,
    availableAppendices,
  };
}

export interface InvestigationDeadline {
  expired(): boolean;
}

export interface RunInvestigationArgs {
  state: AnalysisState;
  requirements: ComplianceRequirement[];
  documentId: string;
  documentText: string;
  structuralNodes: StructuralNode[];
  definitions: DefinitionIndexEntry[];
  references: ReferenceRecord[];
  budget: InvestigationBudget;
  log: InvestigationLogger;
  /** Whether to attempt semantic (embedding) retrieval — best-effort; a
   * failure here degrades to lexical-only rather than aborting. */
  enableSemantic?: boolean;
}

export interface RunInvestigationResult {
  bundlesByRequirement: Map<string, RequirementEvidenceBundle>;
  timings: {
    planningMs: number;
    searchMs: number;
    reviewMs: number;
    followUpMs: number;
    totalMs: number;
  };
}

export async function runLlmAssistedInvestigation(
  args: RunInvestigationArgs
): Promise<RunInvestigationResult> {
  const { state, requirements, documentId, documentText, structuralNodes, definitions, references, budget, log } =
    args;
  const runStarted = Date.now();
  const deadline = () => Date.now() - runStarted >= budget.totalBudgetMs;

  const sections: SharedEvidenceItem[] = buildSectionCandidates({
    docId: documentId,
    fullText: documentText,
  } as Parameters<typeof buildSectionCandidates>[0]);
  const documentIndex = new Map<string, { rawText: string }>();
  for (const s of sections) {
    documentIndex.set(`${documentId}::section::${s.charRange[0]}-${s.charRange[1]}`, {
      rawText: s.quotedText,
    });
  }
  for (const n of structuralNodes) {
    documentIndex.set(n.spanId, { rawText: n.rawText });
  }

  let semanticIndex: ClauseIndex | null = null;
  if (args.enableSemantic !== false && sections.length > 0) {
    try {
      semanticIndex = await buildInMemoryIndex(sections);
    } catch {
      semanticIndex = null; // best-effort — degrade to lexical-only.
    }
  }

  const documentMetadata = buildDocumentMetadata({
    documentId,
    structuralNodes,
    definitions,
  });

  // STEP 2
  const planStarted = Date.now();
  const plans = deadline()
    ? []
    : await planInvestigation(state, requirements, documentMetadata, log);
  const planningMs = Date.now() - planStarted;

  const requirementById = new Map(requirements.map((r) => [r.requirementId, r]));
  const candidatesByReq = new Map<string, Map<string, EvidenceCandidate>>();

  // STEPS 3-5 (initial round)
  const searchStarted = Date.now();
  for (const plan of plans) {
    if (deadline()) break;
    const requirement = requirementById.get(plan.requirementId);
    if (!requirement) continue;
    const results = await retrieveForRequirement(
      plan,
      sections,
      documentId,
      structuralNodes,
      definitions,
      semanticIndex,
      log
    );
    const byId = candidatesByReq.get(plan.requirementId) ?? new Map<string, EvidenceCandidate>();
    for (const r of results) {
      for (const c of [...r.mainCandidates, ...r.exceptionCandidates, ...r.contradictionCandidates]) {
        byId.set(c.evidenceSpanId, c);
        documentIndex.set(c.evidenceSpanId, { rawText: c.rawText });
        for (const expanded of expandCandidate(c, structuralNodes, references)) {
          if (!byId.has(expanded.evidenceSpanId)) {
            byId.set(expanded.evidenceSpanId, expanded);
            documentIndex.set(expanded.evidenceSpanId, { rawText: expanded.rawText });
            log("compliance.investigation.context.expanded", {
              requirementId: plan.requirementId,
              elementId: r.elementId,
              seedEvidenceSpanId: c.evidenceSpanId,
              expandedEvidenceSpanId: expanded.evidenceSpanId,
              reason: expanded.matchedQueries[0],
            });
          }
        }
      }
    }
    candidatesByReq.set(plan.requirementId, byId);
  }
  const searchMs = Date.now() - searchStarted;

  // STEP 6
  const reviewStarted = Date.now();
  const flatCandidates = new Map<string, EvidenceCandidate[]>();
  for (const [reqId, byId] of candidatesByReq) flatCandidates.set(reqId, [...byId.values()]);
  const reviews = deadline()
    ? new Map()
    : await reviewCandidates(state, requirements, flatCandidates, definitions, references, log);
  const reviewMs = Date.now() - reviewStarted;

  // STEP 7 — one bounded follow-up round for unresolved elements.
  const followUpStarted = Date.now();
  let followUpRan = false;
  if (budget.maxFollowUpRounds > 0 && !deadline()) {
    for (const [reqId, review] of reviews) {
      if (review.unresolvedElements.length === 0) continue;
      followUpRan = true;
      log("compliance.investigation.followup.started", {
        requirementId: reqId,
        unresolvedElementIds: review.unresolvedElements.map((u: { elementId: string }) => u.elementId),
      });
      const requirement = requirementById.get(reqId);
      if (!requirement) continue;
      const byId = candidatesByReq.get(reqId) ?? new Map<string, EvidenceCandidate>();
      for (const unresolved of review.unresolvedElements) {
        if (deadline()) break;
        const fq = unresolved.followUpQueries;
        const followPlan = {
          requirementId: reqId,
          elementPlans: [
            {
              elementId: unresolved.elementId,
              lexicalQueries: fq?.lexicalQueries ?? [],
              semanticQueries: fq?.semanticQueries ?? [],
              likelyHeadings: fq?.likelyHeadings ?? [],
              likelyDefinedTerms: fq?.definitionsOrReferencesToResolve ?? [],
              conceptsToFind: [],
              exclusionsOrDistinctions: [],
              exceptionQueries: [],
              contradictionQueries: [],
            },
          ],
        };
        const results = await retrieveForRequirement(
          followPlan,
          sections,
          documentId,
          structuralNodes,
          definitions,
          semanticIndex,
          log
        );
        for (const r of results) {
          for (const c of [...r.mainCandidates, ...r.exceptionCandidates, ...r.contradictionCandidates]) {
            if (!byId.has(c.evidenceSpanId)) {
              byId.set(c.evidenceSpanId, c);
              documentIndex.set(c.evidenceSpanId, { rawText: c.rawText });
            }
          }
        }
      }
      candidatesByReq.set(reqId, byId);
    }
    if (followUpRan) {
      // Re-review requirements that had unresolved elements, now with the
      // follow-up candidates included, still within the single bounded call
      // budget (`maxCandidateReviewCalls` governs the INITIAL review; this is
      // the ONE permitted follow-up review, matching `maxFollowUpRounds`).
      const retryReqIds = [...reviews.entries()]
        .filter(([, review]) => review.unresolvedElements.length > 0)
        .map(([reqId]) => reqId);
      if (retryReqIds.length > 0 && !deadline()) {
        const retryRequirements = requirements.filter((r) => retryReqIds.includes(r.requirementId));
        const retryCandidates = new Map<string, EvidenceCandidate[]>();
        for (const reqId of retryReqIds) {
          retryCandidates.set(reqId, [...(candidatesByReq.get(reqId)?.values() ?? [])]);
        }
        const retryReviews = await reviewCandidates(
          state,
          retryRequirements,
          retryCandidates,
          definitions,
          references,
          log
        );
        for (const [reqId, review] of retryReviews) {
          reviews.set(reqId, review);
          log("compliance.investigation.followup.completed", {
            requirementId: reqId,
            resolvedCount: review.selectedCandidates.length,
            stillUnresolvedElementIds: review.unresolvedElements.map((u: { elementId: string }) => u.elementId),
          });
        }
      }
    }
  }
  const followUpMs = Date.now() - followUpStarted;

  // STEPS 8 + 9
  const bundlesByRequirement = new Map<string, RequirementEvidenceBundle>();
  for (const requirement of requirements) {
    const byId = candidatesByReq.get(requirement.requirementId) ?? new Map<string, EvidenceCandidate>();
    const review = reviews.get(requirement.requirementId);
    const timedOut = deadline();
    const incompleteReasons: string[] = [];
    if (timedOut) incompleteReasons.push("investigation_budget_exceeded");
    if (!review) incompleteReasons.push("candidate_review_unavailable");

    let bundle = buildEvidenceBundle({
      requirement,
      candidatesById: byId,
      review,
      definitions,
      references,
      investigationComplete: !timedOut && Boolean(review),
      incompleteReasons,
    });

    const validation = validateBundle(bundle, documentIndex);
    if (!validation.valid) {
      // ONE structured repair: drop only the invalid passages rather than
      // discarding the whole bundle, then re-validate. This is the single
      // permitted repair pass (`maxRepairCalls`); if still invalid, the
      // bundle is marked incomplete, never silently accepted.
      const badIds = new Set(
        validation.errors
          .map((e) => e.split(":")[1])
          .filter((id): id is string => Boolean(id))
      );
      bundle = {
        ...bundle,
        passages: bundle.passages.filter((p) => !badIds.has(p.evidenceId)),
        investigationComplete: false,
        incompleteReasons: [...bundle.incompleteReasons, ...validation.errors],
      };
      const revalidated = validateBundle(bundle, documentIndex);
      if (!revalidated.valid) {
        bundle.incompleteReasons.push("repair_failed");
      }
      log("compliance.investigation.incomplete", {
        requirementId: requirement.requirementId,
        reasons: bundle.incompleteReasons,
        validationErrors: validation.errors,
      });
    }

    bundlesByRequirement.set(requirement.requirementId, bundle);
    log("compliance.investigation.bundle.created", {
      requirementId: requirement.requirementId,
      passageCount: bundle.passages.length,
      definitionCount: bundle.definitions.length,
      resolvedReferenceCount: bundle.resolvedReferences.length,
      unresolvedReferenceCount: bundle.unresolvedReferences.length,
      investigationComplete: bundle.investigationComplete,
      incompleteReasons: bundle.incompleteReasons,
    });
    log("compliance.investigation.bundle.validated", {
      requirementId: requirement.requirementId,
      valid: validation.valid,
      errors: validation.errors,
    });
  }

  const totalMs = Date.now() - runStarted;
  log("compliance.investigation.timing", {
    requirementIds: requirements.map((r) => r.requirementId),
    planningMs,
    searchMs,
    reviewMs,
    followUpMs,
    totalMs,
    budgetMs: budget.totalBudgetMs,
    budgetExceeded: totalMs >= budget.totalBudgetMs,
  });

  return {
    bundlesByRequirement,
    timings: { planningMs, searchMs, reviewMs, followUpMs, totalMs },
  };
}

/**
 * Adapter — converts the generic bundle into the EXISTING `Phase3Bundle`
 * shape so `phase4-verify.ts` / `phase4b-llm-verifier.ts` / Phase 5-7 need no
 * changes. `investigationComplete: false` is expressed as a `budget`
 * exclusion reason on nothing (there's nothing to exclude) — downstream reads
 * completeness from `bundle.exclusions`/`dependencies` today, so unresolved
 * references become `unresolved_external` dependencies exactly as the old
 * path represents them, and a budget timeout is surfaced as a dependency too
 * (`__investigation_budget__`) so `investigationComplete` checks downstream
 * (Phase 5's `investigationComplete` derivation) see it without new fields.
 */
export function toPhase3Bundle(bundle: RequirementEvidenceBundle): Phase3Bundle {
  const items: Phase3BundleItem[] = bundle.passages.map((p) => {
    const scope = (p.scope ?? {}) as Phase3ScopeVector;
    return {
      spanId: p.evidenceId,
      ref: p.evidenceId,
      quotedText: p.rawText,
      structuralPath: p.locator,
      charRange: [0, p.rawText.length],
      scope: { ...scope, documentId: p.documentId, structuralPath: p.locator },
      source: "seed",
    };
  });

  const partitionsByKey = new Map<string, { partitionId: string; scope: Phase3ScopeVector; itemSpanIds: string[] }>();
  for (const item of items) {
    const key = `${item.scope.relationship ?? "unspecified"}|${item.scope.exception ?? "main_rule"}`;
    const part = partitionsByKey.get(key) ?? {
      partitionId: `P${partitionsByKey.size + 1}`,
      scope: { relationship: item.scope.relationship, exception: item.scope.exception },
      itemSpanIds: [],
    };
    part.itemSpanIds.push(item.spanId);
    partitionsByKey.set(key, part);
  }

  const dependencies = [
    ...bundle.resolvedReferences.map((r) => ({
      reference: r.sourceEvidenceId,
      state: "resolved_internal" as const,
      targetSpanIds: r.targetEvidenceIds,
    })),
    ...bundle.unresolvedReferences.map((r) => ({
      reference: r.name,
      state: "unresolved_external" as const,
      targetSpanIds: [] as string[],
    })),
    ...(bundle.incompleteReasons.includes("investigation_budget_exceeded")
      ? [
          {
            reference: "__investigation_budget__",
            state: "unresolved_external" as const,
            targetSpanIds: [] as string[],
          },
        ]
      : []),
  ];

  return {
    bundleId: `LLM-INV-${bundle.requirementId}`,
    requirementId: bundle.requirementId,
    items,
    partitions: [...partitionsByKey.values()],
    exclusions: [],
    dependencies,
    estimatedTokens: Math.ceil(items.reduce((n, i) => n + i.quotedText.length, 0) / 4),
  };
}
