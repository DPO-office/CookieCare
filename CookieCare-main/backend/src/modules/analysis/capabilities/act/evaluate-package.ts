import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisExecutionState } from "../../models/analysis-execution.js";
import type { AnalysisWorkUnit, RequirementBinding } from "../../models/analysis-plan.js";
import type {
  Finding,
  FindingApplicabilityScope,
  FindingPerspective,
  FindingPolarity,
} from "../../models/finding.js";
import { requestIdsForNative } from "../../shared/requirement-binding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import type {
  EvidencePackageSourceMode,
  EvidenceScopeConstraint,
  SharedEvidenceBundle,
  SharedEvidenceItem,
} from "../../models/evidence-package.js";
import type {
  EvidenceState,
  GroupedRequirementResult,
  RequirementJudgement,
} from "../../models/requirement-assessment.js";
import { recommendationKindFromAxes } from "../../models/requirement-assessment.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import { resolveRule } from "./check-against-rule.js";
import { insufficient } from "./act-utils.js";
import { groupedResultsToFindings, TIER_BY_SOURCE } from "./grouped-results-to-findings.js";
import {
  verifyProposition,
  verifyPropositionCandidates,
  type VerifyVerdict,
  type VerifyPropositionResult,
} from "../act/verify-proposition.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import {
  citeableRefsFromPacket,
  coverageShouldBePreserved,
  hintsForRequirement,
  packetsByRequirement,
  resolveEvidenceRefsForRequirement,
  resolveRecallCandidates,
  type EvidencePacket,
  type RequirementEvidenceProfile,
} from "./isolate-requirement-evidence.js";
import {
  canonicalRequirementId,
  requirementIdsEquivalent,
} from "../../shared/requirement-identity.js";
import { pacLog } from "../../utils/pac-log.js";
import {
  profileEvidenceCharBudget,
  profileSkipsSupportingPriority,
  profileSelectedVerifyCandidateCap,
  profileThinkingLevel,
  profileVerifyCandidateCap,
  profileVerifyRequirementConcurrency,
} from "../../utils/profile-thinking.js";
import { adaptiveVerificationTimeoutMs } from "../../utils/adaptive-time-budget.js";
import {
  EVALUATE_PACKAGE_SYSTEM_PROMPT,
  buildEvaluatePackageUserPrompt,
} from "../../prompts/evaluate-package.js";
import {
  expandSharedEvidenceItem,
  isHeadingOnlyMatch,
} from "./locate-evidence.js";
import { buildInMemoryIndex, type ClauseIndex } from "./clause-index.js";
import { logVerifyCandidates } from "./verify-inspect-log.js";
import { logRetrievalRanking, logSelectedCandidates } from "./evidence-pool-log.js";
import {
  selectCandidates,
  buildSectionCandidates,
  filterCandidatesByEvidenceScope,
} from "./select-candidates.js";
import { normalizePartyPerspective } from "../../shared/finding-semantics.js";

const MAX_BRIEF_CHARS = 4000;

const REQUIREMENT_STATUS_ENUM = [
  "strong",
  "adequate",
  "conditional",
  "gap",
  "covered",
  "partial",
  "missing",
  "not_applicable",
  "cannot_determine",
];

const COMPLIANCE_ENUM = [
  "present",
  "partial",
  "gap",
  "insufficient_evidence",
  "not_applicable",
];

const EVIDENCE_STATE_ENUM = [
  "direct",
  "incorporated",
  "truncated",
  "unavailable",
  "conflicting",
  "not_found",
];

const NLI_ENUM = ["entailed", "contradicted", "not_mentioned"];
const BINDING_ENUM = ["binding", "floating", "none"];
const CONFIDENCE_ENUM = ["high", "medium", "low"];
const DRAFTING_ENUM = ["clean", "could_be_clearer", "operational_weakness"];
const MATERIALITY_ENUM = ["low", "medium", "high"];

interface CapabilityBrief {
  id: string;
  kind: "rule" | "matrix_row" | "risk_category";
  text: string;
  findingCategory?: string;
}

/**
 * Grouped legal evaluation (ACT refactor doc §6-7). ONE LLM call evaluates every
 * requirement in the package against shared evidence and authored rule text, and
 * returns an independently-identifiable result per requirement. Results are then
 * translated into the existing Finding model — the grouped call is never the
 * persisted source of truth.
 */
export async function evaluatePackage(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const packageId = String(unit.input.packageId ?? "");
  const docId = String(unit.input.docId ?? "");
  const instruction = String(
    unit.input.instruction ?? state.request.instruction ?? ""
  );
  const capabilityIds = (unit.input.capabilityIds as string[]) ?? [];
  const contextCapabilityIds = (unit.input.contextCapabilityIds as string[]) ?? [];
  const packageRequirementIds = (unit.input.requirementIds as string[]) ?? [];
  const retryRequirementIds = Array.isArray(unit.input.retryRequirementIds)
    ? (unit.input.retryRequirementIds as string[])
    : [];
  const requirementIds =
    retryRequirementIds.length > 0
      ? packageRequirementIds.filter((id) => retryRequirementIds.includes(id))
      : packageRequirementIds;
  const sourceMode =
    (unit.input.sourceMode as EvidencePackageSourceMode) ?? "authored";
  const depth = String(unit.input.depth ?? "standard");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const extractionTargets = (unit.input.extractionTargets as string[]) ?? [];
  const evidenceScope = unit.input.evidenceScope as EvidenceScopeConstraint | undefined;
  const requirementEvidence =
    (unit.input.requirementEvidence as Record<string, RequirementEvidenceProfile> | undefined) ??
    {};
  const requirementBindings =
    (unit.input.requirementBindings as Record<string, string[]> | undefined) ?? {};

  // Phase 2 — request↔native bindings for this package. Stamp each new finding
  // with the request/classifier ids it answers (join key) without touching its
  // native `requirementId` (evaluation identity).
  const requestBindings =
    (unit.input.requestRequirementBindings as RequirementBinding[] | undefined) ?? [];
  const stampRequest = <T extends Finding>(newFindings: T[]): T[] =>
    requestBindings.length === 0
      ? newFindings
      : newFindings.map((f) => {
          const requestIds = requestIdsForNative(requestBindings, f.requirementId);
          return requestIds.length > 0 ? { ...f, requestRequirementIds: requestIds } : f;
        });

  if (requirementIds.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        ...stampRequest([
          insufficient(unit, `Package ${packageId} resolved no requirements`),
        ]),
      ],
    };
  }

  const briefs = await buildCapabilityBriefs(skillIds, capabilityIds);
  const contextBriefs =
    contextCapabilityIds.length > 0
      ? await buildCapabilityBriefs(skillIds, contextCapabilityIds)
      : [];
  const findingCategory =
    briefs.find((b) => b.findingCategory)?.findingCategory ?? "other_known_risk";
  const bundle = state.sharedEvidence?.[packageId];
  const evidenceItems = bundle?.items ?? [];

  // ACT-Phase 5 — a package whose every requirement has an authored
  // `proofStandard` (data authored on the skill, not a package/regime name
  // check) is verified per-candidate through VERIFY instead of one grouped
  // free-form LLM call. Any package without proofStandard authored is
  // completely untouched — same grouped-LLM path as before.
  if (allRequirementsHaveProofStandard(requirementIds, requirementEvidence)) {
    let verifyFindings = await evaluateWithVerify(
      requirementIds,
      evidenceItems,
      extractionTargets,
      requirementEvidence,
      state,
      {
        unit,
        docId,
        packageId,
        sourceMode,
        skillId: skillIds[0],
        findingCategory,
        evidenceScope,
      }
    );
    const retryIds = [...new Set(
      verifyFindings
        .filter((finding) =>
          finding.requirementId &&
          (finding.analysisExecution?.status === "failed" ||
            finding.analysisExecution?.status === "timed_out")
        )
        .map((finding) => finding.requirementId!)
    )];
    if (retryIds.length > 0 && canRetryFailedBranchRequirements(state, unit)) {
      pacLog("[VERIFY] deep branch retry", {
        facetId: unit.facetId,
        packageId,
        requirements: retryIds.join(","),
      });
      const retried = await evaluateWithVerify(
        retryIds,
        evidenceItems,
        extractionTargets,
        requirementEvidence,
        state,
        {
          unit,
          docId,
          packageId,
          sourceMode,
          skillId: skillIds[0],
          findingCategory,
          evidenceScope,
        }
      );
      const retriedIds = new Set(retried.map((finding) => finding.requirementId));
      verifyFindings = [
        ...verifyFindings.filter((finding) => !retriedIds.has(finding.requirementId)),
        ...retried,
      ];
    }
    return { state, findings: [...findings, ...stampRequest(verifyFindings)] };
  }

  const inputArtifactIds = (unit.input.inputArtifactIds as string[]) ?? [];
  const artifactLines = inputArtifactIds.flatMap((artifactId) => {
    const artifact = state.analysisArtifacts?.[artifactId];
    if (!artifact) return [];
    const serialized = JSON.stringify(artifact.data).slice(0, 5000);
    return [`Structured ${artifact.type} records:`, serialized];
  });

  const previousFeedback = unit.input.previousAttemptFeedback
    ? String(unit.input.previousAttemptFeedback)
    : "";

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  let nextState = state;
  let workingBundle = bundle;
  let workingItems = evidenceItems;

  const runEval = async (
    reqIds: string[],
    items: SharedEvidenceItem[],
    extraFeedback?: string
  ): Promise<GroupedRequirementResult[]> => {
    const packets = packetsByRequirement(
      reqIds,
      items,
      extractionTargets,
      requirementEvidence
    );
    const requirements = reqIds.map((requirementId) => {
      const packet = packets[requirementId] ?? emptyPacket(requirementId);
      const refs = citeableRefsFromPacket(packet);
      return {
        requirementId,
        hypothesis: hypothesisFor(
          requirementId,
          requirementEvidence[requirementId],
          state
        ),
        proofStandard: requirementEvidence[requirementId]?.proofStandard,
        candidateEvidenceRefs: refs,
        evidenceLines: formatPacketEvidenceLines(packet),
        packetRoles: {
          supporting: packet.supporting.map((i) => i.ref),
          contextual: packet.contextual.map((i) => i.ref),
        },
      };
    });
    const packetUnion = requirements.flatMap((req) => req.candidateEvidenceRefs);
    const visibleItems =
      packetUnion.length > 0
        ? items.filter((item) => packetUnion.includes(item.ref))
        : [];
    const authoredRuleText = briefsForRequirements(
      reqIds,
      briefs,
      capabilityIds,
      packageRequirementIds,
      requirementBindings
    )
      .map((b) => `[${b.id}] ${b.text}`)
      .join("\n")
      .slice(0, MAX_BRIEF_CHARS);
    const prompt = buildEvaluatePackageUserPrompt({
      instruction,
      depth,
      requirements,
      authoredRuleText,
      evidenceLines: artifactLines,
      previousFeedback: extraFeedback || previousFeedback || undefined,
      contextRuleText:
        contextBriefs.length > 0
          ? contextBriefs
              .map((b) => `[${b.id}] ${b.text}`)
              .join("\n")
              .slice(0, MAX_BRIEF_CHARS)
          : undefined,
    });
    const evidenceJoined = visibleItems
      .map((e) => `(${e.ref}) [${e.clauseType}] ${e.quotedText}`)
      .join("\n");
    pacLog("evaluate_package prompt", {
      id: unit.workUnitId,
      packageId,
      requirements: reqIds.length,
      capabilities: capabilityIds.length,
      contextCapabilities: contextCapabilityIds.length,
      evidence: visibleItems.length,
      promptChars: prompt.length,
      briefChars: authoredRuleText.length,
      evidenceChars: evidenceJoined.length,
      expansion: Boolean(extraFeedback),
    });

    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string", enum: reqIds },
          status: { type: "string", enum: REQUIREMENT_STATUS_ENUM },
          compliance: { type: "string", enum: COMPLIANCE_ENUM },
          evidenceState: { type: "string", enum: EVIDENCE_STATE_ENUM },
          referenceBinding: { type: "string", enum: BINDING_ENUM },
          evidenceConfidence: { type: "string", enum: CONFIDENCE_ENUM },
          draftingQuality: { type: "string", enum: DRAFTING_ENUM },
          materiality: { type: "string", enum: MATERIALITY_ENUM },
          nli: { type: "string", enum: NLI_ENUM },
          rationale: { type: "string" },
          gap: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
        },
        required: [
          "requirementId",
          "status",
          "compliance",
          "evidenceState",
          "nli",
          "rationale",
          "evidenceRefs",
        ],
      },
    };

    return executeJsonCompletion<GroupedRequirementResult[]>(
      prompt,
      EVALUATE_PACKAGE_SYSTEM_PROMPT,
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
  };

  let results: GroupedRequirementResult[] = [];
  const llmStart = Date.now();
  try {
    results = await runEval(requirementIds, workingItems);
  } catch (err) {
    return {
      state,
      findings: [
        ...findings,
        ...stampRequest([
          insufficient(
            unit,
            `Grouped evaluation failed for package ${packageId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          ),
        ]),
      ],
    };
  }
  if (tracker && state.agent) state.agent.tokensUsed = tracker.tokensUsed;
  pacLog("evaluate_package llm", {
    id: unit.workUnitId,
    packageId,
    ms: Date.now() - llmStart,
  });

  const alreadyExpanded = unit.input.evidenceExpansionDone === true;
  if (!alreadyExpanded && workingBundle) {
    const retryIds = requirementsNeedingEvidenceExpansion(results, workingBundle);
    if (retryIds.length > 0) {
      const doc = state.workspace.documents.find((d) => d.docId === docId);
      const expanded = doc
        ? expandBundleItems(
            doc,
            workingBundle,
            retryIds,
            results,
            profileEvidenceCharBudget(state) * 3
          )
        : null;
      if (expanded && expanded.changed) {
        workingBundle = expanded.bundle;
        workingItems = expanded.bundle.items;
        const expandStart = Date.now();
        try {
          const retryResults = await runEval(
            retryIds,
            workingItems,
            "Re-evaluate using the expanded complete clause text. Do not treat a previous prefix as the whole provision."
          );
          results = mergeRequirementResults(results, retryResults);
          pacLog("evaluate_package expansion", {
            id: unit.workUnitId,
            packageId,
            retry: retryIds.length,
            ms: Date.now() - expandStart,
          });
        } catch (err) {
          pacLog("evaluate_package expansion failed", {
            id: unit.workUnitId,
            packageId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (tracker && nextState.agent) nextState.agent.tokensUsed = tracker.tokensUsed;
        nextState = {
          ...nextState,
          sharedEvidence: {
            ...(nextState.sharedEvidence ?? {}),
            [packageId]: workingBundle,
          },
        };
      }
    }
  }

  const normalized = isolateAndNormalize(
    results,
    requirementIds,
    workingItems,
    extractionTargets,
    requirementEvidence
  );
  const emitted = groupedResultsToFindings(normalized, {
    unit,
    docId,
    packageId,
    sourceMode,
    skillId: skillIds[0],
    findingCategory,
    bundle: workingBundle,
  });

  // Use post-isolation ids only — raw LLM ids may be PLAN aliases that were
  // remapped (or dropped). Counting raw ids falsely marks natives as answered.
  const answered = new Set(normalized.map((r) => r.requirementId));
  const missingResults: GroupedRequirementResult[] = requirementIds
    .filter((id) => !answered.has(canonicalRequirementId(id)) && !answered.has(id))
    .map((id) => ({
      requirementId: canonicalRequirementId(id),
      status: "cannot_determine",
      rationale: "The grouped evaluation returned no result for this requirement.",
      evidenceRefs: [],
    }));
  const missingFindings = groupedResultsToFindings(missingResults, {
    unit,
    docId,
    packageId,
    sourceMode,
    skillId: skillIds[0],
    findingCategory,
    bundle: workingBundle,
  });

  return {
    state: nextState,
    findings: [...findings, ...stampRequest([...emitted, ...missingFindings])],
  };
}

/**
 * Kill-switch: set ANALYSIS_DISABLE_VERIFY=1 to force every package back
 * onto the old grouped-LLM path (one call per package instead of one call
 * per candidate per requirement), regardless of authored proofStandards.
 * Nothing about VERIFY's code or the authored proof standards is removed —
 * this only changes which path evaluate_package takes at runtime, so it's
 * a one-line revert to turn back on.
 */
function verifyDisabledByEnv(): boolean {
  return process.env.ANALYSIS_DISABLE_VERIFY === "1";
}

function allRequirementsHaveProofStandard(
  reqIds: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined>
): boolean {
  if (verifyDisabledByEnv()) return false;
  return reqIds.length > 0 && reqIds.every((id) => Boolean(profiles[id]?.proofStandard?.trim()));
}

interface VerifyFindingContext {
  unit: AnalysisWorkUnit;
  docId: string;
  packageId: string;
  sourceMode: EvidencePackageSourceMode;
  skillId?: string;
  findingCategory: string;
  evidenceScope?: EvidenceScopeConstraint;
}

function canRetryFailedBranchRequirements(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): boolean {
  if (!unit.facetId || state.request.thinkingMode !== "deep") return false;
  const branch = state.plan?.branches?.find((item) => item.facetId === unit.facetId);
  if (!branch || branch.timeBudget.retryFailedRequirements < 1) return false;
  const startedAt = state.branchDiagnostics?.[unit.facetId]?.startedAtMs;
  if (!startedAt) return true;
  const remaining = branch.timeBudget.hardCeilingMs - (Date.now() - startedAt);
  return remaining >= branch.timeBudget.baseVerificationMs;
}

function remainingBranchBudgetMs(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): number | undefined {
  if (!unit.facetId) return undefined;
  const branch = state.plan?.branches?.find((item) => item.facetId === unit.facetId);
  const startedAt = state.branchDiagnostics?.[unit.facetId]?.startedAtMs;
  if (!branch || !startedAt) return undefined;
  return Math.max(0, branch.timeBudget.hardCeilingMs - (Date.now() - startedAt));
}

/**
 * ACT-Phase 10 — is this requirement PLAN-authored as "supporting" rather
 * than "required"? Reuses `IntentRequirement.priority` (already carried on
 * `state.intent.requirements` since before this rebuild started) rather
 * than inventing a new priority field — this literally is "PLAN's priority
 * field," just the one that already exists and is already populated.
 */
function isSupportingPriority(requirementId: string, state: AnalysisState): boolean {
  const canonicalId = canonicalRequirementId(requirementId);
  const match = state.intent?.requirements?.find(
    (r) => canonicalRequirementId(r.id) === canonicalId
  );
  return match?.priority === "supporting";
}

/**
 * ACT-Phase 5 — the VERIFY-native evaluation path (research doc §2.1 stages
 * 1-2): loosen candidate generation to recall-oriented (top ~10, no role
 * classification), then run the real verifier against each candidate. The
 * winning verdict per requirement is used to construct a Finding directly —
 * this deliberately bypasses `groupedResultsToFindings`/`judgementForResult`,
 * whose generic "upgrade compliance if the quote has substance" heuristics
 * were built for the old similarity-scored path and would silently override
 * VERIFY's own authoritative verdict if reused here.
 *
 * ACT-Phase 10 — Lite trims SCOPE, never the rigor of any individual check
 * (research doc §10: "budget as scope, never as rigor" — a wrong Present is
 * exactly as much a liability in a 2-minute Lite run). The two Lite-mode
 * levers here are both scope, not depth: fewer recall candidates checked per
 * requirement (`verifyCandidateCap`), and PLAN-authored "supporting"
 * priority requirements skipped entirely rather than checked less
 * carefully. Every candidate that IS checked, and every requirement that IS
 * investigated, gets the identical VERIFY call in both modes.
 */
/**
 * With semantic retrieval actually engaged (not just flagged on — the index
 * has real embedded vectors for this package), the hybrid retriever puts the
 * right clause in the top 3 instead of buried at rank 6-8 the way the old
 * lexical-only ranker did (the cap=10 in analysis-profile.ts was deliberately
 * kept high specifically because that ranker missed the target at rank 6/40
 * — see that file's comment). A small cap here is what actually cashes in
 * the plan's "retrieval quality and VERIFY cost are the same lever" claim.
 * Falls back to the profile's full cap whenever the index isn't usable.
 */
const SEMANTIC_VERIFY_CANDIDATE_CAP = 4;
/**
 * Compliance keeps one verifier call per requirement, so widening the
 * shortlist raises recall without returning to per-candidate LLM fan-out.
 */
const COMPLIANCE_VERIFY_CANDIDATE_CAP = 8;

/**
 * A compliance request commonly evaluates several packages against the same
 * uploaded document. Cache the full-section index by the in-memory document
 * object so those packages share one embedding pass. WeakMap keeps the cache
 * request-lifetime friendly without retaining completed workspaces.
 */
const COMPLIANCE_SECTION_INDEX_CACHE = new WeakMap<
  SegmentedDocument,
  Promise<ClauseIndex>
>();

function complianceSectionIndex(
  doc: SegmentedDocument,
  sections: SharedEvidenceItem[]
): Promise<ClauseIndex> {
  const cached = COMPLIANCE_SECTION_INDEX_CACHE.get(doc);
  if (cached) return cached;
  const pending = buildInMemoryIndex(sections);
  COMPLIANCE_SECTION_INDEX_CACHE.set(doc, pending);
  return pending;
}

/**
 * Max requirements per selectCandidates() call. Kept small deliberately: the
 * failure mode this guards against is the model shallow-passing most of a
 * large joint batch to an empty list rather than doing the harder semantic
 * mapping for each one — see the call site's comment for the confirmed real
 * run this was tuned against.
 */
const SELECT_CANDIDATES_CHUNK_SIZE = 4;

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, runWorker)
  );
  return results;
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`VERIFY candidate timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface VerifyOutcome {
  item: SharedEvidenceItem;
  result: VerifyPropositionResult;
}

interface FindingSemanticContext {
  kind: Extract<Finding["kind"], "risk" | "compliance" | "comparison_delta">;
  polarity: FindingPolarity;
  partyPerspective: FindingPerspective;
  compareGroup?: string;
  compareRole?: string;
}

function semanticContextFor(
  profile: RequirementEvidenceProfile | undefined,
  state: AnalysisState,
  isRiskLane: boolean,
  isCompareLane: boolean
): FindingSemanticContext {
  return {
    kind: isRiskLane ? "risk" : isCompareLane ? "comparison_delta" : "compliance",
    polarity:
      profile?.polarity ??
      (isRiskLane
        ? "risk_present"
        : isCompareLane
          ? "neutral_fact"
          : "compliance_met"),
    partyPerspective: normalizePartyPerspective(
      profile?.partyPerspective ?? state.intent?.partyPerspective
    ),
    compareGroup: isCompareLane ? profile?.compareGroup : undefined,
    compareRole: isCompareLane ? profile?.compareRole : undefined,
  };
}

function normalizedScopeValues(values: string[] | undefined): Set<string> {
  return new Set(
    (values ?? [])
      .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
      .filter(Boolean)
  );
}

function dimensionIsDisjoint(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = normalizedScopeValues(a);
  const right = normalizedScopeValues(b);
  if (left.size === 0 || right.size === 0) return false;
  return ![...left].some((value) => right.has(value));
}

/** True only where VERIFY identified a concrete reason the passages do not share scope. */
export function verifyOutcomesHaveDistinctScopes(
  left: VerifyPropositionResult,
  right: VerifyPropositionResult
): boolean {
  if (
    left.scopeRole &&
    right.scopeRole &&
    left.scopeRole !== "unspecified" &&
    right.scopeRole !== "unspecified" &&
    left.scopeRole !== right.scopeRole
  ) {
    return true;
  }
  const a = left.applicabilityScope;
  const b = right.applicabilityScope;
  if (!a || !b) return false;
  return (
    dimensionIsDisjoint(a.parties, b.parties) ||
    dimensionIsDisjoint(a.jurisdictions, b.jurisdictions) ||
    dimensionIsDisjoint(a.timePeriods, b.timePeriods) ||
    dimensionIsDisjoint(a.conditions, b.conditions)
  );
}

function decisiveOutcome(outcome: VerifyOutcome): boolean {
  if (!outcome.result.quoteVerified) return false;
  if (outcome.result.verdict === "proves") return true;
  return outcome.result.verdict === "contradicts" && !outcome.item.truncated;
}

export function firstDistinctScopePair(
  outcomes: VerifyOutcome[]
): [VerifyOutcome, VerifyOutcome] | undefined {
  const grounded = outcomes.filter(
    ({ result }) => result.verdict !== "irrelevant" && result.quoteVerified
  );
  for (let left = 0; left < grounded.length; left += 1) {
    for (let right = left + 1; right < grounded.length; right += 1) {
      if (verifyOutcomesHaveDistinctScopes(grounded[left]!.result, grounded[right]!.result)) {
        return [grounded[left]!, grounded[right]!];
      }
    }
  }
  return undefined;
}

function isComplianceReport(state: AnalysisState): boolean {
  const reportType = state.plan?.reportSpec?.reportType ?? state.intent?.reportType;
  return (
    state.intent?.operation === "compliance_check" &&
    reportType === "regime_compliance_memo"
  );
}

/**
 * Retrieval asks what evidence would establish the proposition. The longer
 * proof standard also contains traps and negative examples; embedding those
 * caused the retriever to rank the warned-against passages themselves. Keep
 * the strict proof standard for VERIFY and use only positive, authored recall
 * language for the compliance retrieval query.
 */
export function complianceRetrievalQuery(
  hypothesis: string,
  profile: RequirementEvidenceProfile | undefined
): string {
  return [hypothesis, ...(profile?.evidenceHints ?? [])]
    .map((part) => part.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean)
    .join(". ");
}

async function evaluateWithVerify(
  reqIds: string[],
  items: SharedEvidenceItem[],
  extractionTargets: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined>,
  state: AnalysisState,
  ctx: VerifyFindingContext
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const candidateCap = profileVerifyCandidateCap(state);
  const skipSupporting = profileSkipsSupportingPriority(state);
  const doc = state.workspace.documents.find((d) => d.docId === ctx.docId);
  const expandMaxChars = profileEvidenceCharBudget(state) * 3;
  const complianceReport = isComplianceReport(state);
  // Compliance uses full-document hybrid retrieval followed by one bounded
  // verifier call per requirement. Non-compliance report types (extract,
  // explain_qa, risk_flag, draft_suggestion, compare) use the LLM candidate
  // selector, which picks candidates by MEANING from the whole document's
  // sections rather than from the keyword/type-capped `items` pool.
  //
  // Graduated to on-by-default (was opt-in behind ANALYSIS_LLM_CANDIDATE_SELECT
  // === "1"). Live A/B over Q1 (termination notice), Q5 (onboarding risk) and
  // Q14 (post-termination) showed the keyword path silently missed genuinely
  // relevant but mis-typed clauses (e.g. a subprocessor objection/suspension
  // clause labelled `termination`), which the whole-document semantic selector
  // finds. Failure is safe: selectCandidates returns null on any error → the
  // hybrid/lexical retriever below runs unchanged; an explicit empty result is
  // still cross-checked against that retriever before "nothing found" is
  // accepted. Set ANALYSIS_LLM_CANDIDATE_SELECT="0" to fall back to the old
  // keyword-only path.
  const llmSelectEnabled =
    process.env.ANALYSIS_LLM_CANDIDATE_SELECT !== "0" && !complianceReport;
  // Open risk lane: a `contradicts` verdict means "the risk is not present"
  // (reassuring), not "compliance gap". Only risk_flag flips the mapping;
  // compliance_check and every other operation keep the compliance meaning.
  const isRiskLane = state.intent?.operation === "risk_flag";
  // Compare lane: paired side_a/side_b propositions from decomposeReasoningAsk
  // keep ordinary compliance verdict semantics (proves = this side's claim is
  // established) — only the finding's kind/compareGroup/compareRole change,
  // so render/synthesis can pair the two sides back into one comparison.
  const isCompareLane = state.intent?.operation === "compare";

  // Candidate source for the LLM selector: the document's OWN logical sections
  // (whole-document), not the clause-type-dictionary extraction (`items`). This
  // closes the Gate 1 leak — a passage matching no clause-type dictionary (an
  // "only on documented instructions" line inside a jurisdiction addendum) is
  // just another section here, so selection can see and pick it. `items` (the
  // type-extracted pool) is kept only for the hybrid/lexical fallback path.
  const documentSections = doc ? buildSectionCandidates(doc) : items;
  const selectorPool = filterCandidatesByEvidenceScope(
    llmSelectEnabled || complianceReport ? documentSections : items,
    complianceReport ? ctx.evidenceScope : undefined
  );
  const recallPool = complianceReport ? selectorPool : items;

  // Only build the embedding index for the hybrid fallback — when LLM
  // selection is on it replaces the index entirely, so skipping it saves the
  // embedding round-trip on the hot path.
  let clauseIndex: ClauseIndex | undefined;
  let semanticIndexReady = false;
  if (
    !llmSelectEnabled &&
    process.env.ANALYSIS_SEMANTIC_RETRIEVAL === "1" &&
    recallPool.length > 0
  ) {
    const indexStart = Date.now();
    clauseIndex =
      complianceReport && doc
        ? await complianceSectionIndex(doc, documentSections)
        : await buildInMemoryIndex(recallPool);
    const embeddedCount = [...clauseIndex.vectors.values()].filter((v) => v !== null).length;
    semanticIndexReady = embeddedCount > 0;
    pacLog("[INVESTIGATE] semantic index built", {
      packageId: ctx.packageId,
      items: recallPool.length,
      embedded: embeddedCount,
      ms: Date.now() - indexStart,
    });
  }
  const effectiveCap = semanticIndexReady
    ? complianceReport
      ? Math.min(candidateCap, COMPLIANCE_VERIFY_CANDIDATE_CAP)
      : Math.min(candidateCap, SEMANTIC_VERIFY_CANDIDATE_CAP)
    : complianceReport
      ? Math.min(candidateCap, COMPLIANCE_VERIFY_CANDIDATE_CAP)
      : candidateCap;
  // How many candidates the selector may return per requirement (each becomes
  // one VERIFY call). Kept small — good selection means the answer is in the
  // top 1-3, so this is the latency lever.
  const selectCap = Math.min(
    candidateCap,
    SEMANTIC_VERIFY_CANDIDATE_CAP,
    profileSelectedVerifyCandidateCap(state)
  );

  // LLM candidate selection (one batched call for the whole package) replaces
  // the keyword/embedding candidate ranking with a semantic pick. When it
  // succeeds, each requirement's candidates come from the model's ranked
  // choice; when the call fails outright, the whole package falls back to the
  // hybrid/lexical retriever below. A requirement the model ANSWERED with an
  // empty list is honoured as "nothing in this document bears on it" (the
  // whole point of the selector) — only a requirement it OMITTED falls back.
  let selectionByReq: Map<string, SharedEvidenceItem[]> | null = null;
  if (llmSelectEnabled && selectorPool.length > 0) {
    const eligible = reqIds
      .filter((id) => {
        const p = profiles[id];
        return (
          Boolean(p?.proofStandard?.trim()) &&
          !(skipSupporting && isSupportingPriority(id, state))
        );
      })
      .map((id) => {
        const p = profiles[id];
        return {
          requirementId: id,
          hypothesis: hypothesisFor(id, p, state),
          proofStandard: p!.proofStandard!.trim(),
        };
      });
    if (eligible.length > 0) {
      const selStart = Date.now();
      // One call asked to jointly search the whole pool for every requirement
      // reliably shallow-passes most of them once the requirement count gets
      // into double digits — the model does the few obvious matches properly
      // and defaults the rest to an empty list rather than doing the harder
      // conceptual mapping for each one (confirmed on a real 14-requirement
      // run: only 3 got any candidates at all). Splitting into small groups
      // gives each call a much smaller simultaneous search burden — more
      // calls, but selection calls are cheap relative to the VERIFY calls
      // that follow, and a missed candidate here means VERIFY never runs at
      // all for that requirement.
      const chunks: typeof eligible[] = [];
      for (let i = 0; i < eligible.length; i += SELECT_CANDIDATES_CHUNK_SIZE) {
        chunks.push(eligible.slice(i, i + SELECT_CANDIDATES_CHUNK_SIZE));
      }
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          selectCandidates({
            requirements: chunk,
            pool: selectorPool,
            maxPerRequirement: selectCap,
            state,
          })
        )
      );
      selectionByReq = chunkResults.some((r) => r !== null)
        ? new Map(chunkResults.flatMap((r) => (r ? [...r.entries()] : [])))
        : null;
      pacLog("[INVESTIGATE] llm candidate selection", {
        packageId: ctx.packageId,
        requirements: eligible.length,
        chunks: chunks.length,
        chunkSize: SELECT_CANDIDATES_CHUNK_SIZE,
        pool: selectorPool.length,
        source: "document-sections",
        selected: selectionByReq
          ? [...selectionByReq.values()].reduce((n, a) => n + a.length, 0)
          : 0,
        chunksFailed: chunkResults.filter((r) => r === null).length,
        ms: Date.now() - selStart,
      });
      if (selectionByReq) logSelectedCandidates(state, ctx.packageId, selectionByReq);
    }
  }

  await mapWithConcurrency(
    reqIds,
    profileVerifyRequirementConcurrency(state),
    async (requirementId) => {
    const profile = profiles[requirementId];
    const proofStandard = profile?.proofStandard?.trim();
    if (!proofStandard) return;
    const requirementUsesRiskSemantics =
      isRiskLane || (complianceReport && profile?.polarity === "risk_present");
    const semantics = semanticContextFor(
      profile,
      state,
      requirementUsesRiskSemantics,
      isCompareLane
    );

    if (skipSupporting && isSupportingPriority(requirementId, state)) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "Not investigated under Lite mode - PLAN marked this a supporting, not required, priority.",
          undefined,
          {
            ...semantics,
            analysisExecution: complianceReport
              ? {
                  status: "not_run",
                  detail: "Lite mode omitted a supporting-priority requirement.",
                }
              : undefined,
          }
        )
      );
      return;
    }

    const hypothesis = hypothesisFor(requirementId, profile, state);
    const retrievalQuery = complianceReport
      ? complianceRetrievalQuery(hypothesis, profile)
      : proofStandard;
    const selected = selectionByReq?.get(requirementId);
    // A requirement the selector never mentioned at all falls back
    // immediately (existing behavior). A requirement it explicitly returned
    // empty for is a weaker signal than it looks: batching many
    // requirements (esp. paraphrased playbook positions) against a large
    // section pool in one call reliably makes the model give up on most of
    // them rather than truly finding no match — confirmed by a real run
    // where 11/14 playbook-position requirements came back empty from
    // selection despite the document plainly addressing several of them.
    // Cross-check an explicit empty against the lexical/hybrid retriever
    // before accepting "nothing found" as fact; only skip the fallback when
    // the selector positively named at least one candidate.
    const candidates =
      selected && selected.length > 0
        ? selected
        : await resolveRecallCandidates(
            requirementId,
            recallPool,
            extractionTargets,
            profile,
            effectiveCap,
            clauseIndex
              ? {
                  index: clauseIndex,
                  queryText: retrievalQuery,
                  trace: (rows) =>
                    logRetrievalRanking(state, requirementId, retrievalQuery, rows),
                }
              : undefined
          );

    if (candidates.length === 0) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "No related clauses were found.",
          undefined,
          semantics
        )
      );
      return;
    }

    const expandedCandidates = doc
      ? candidates.map((item) => {
          if (!item.truncated) return item;
          const expanded = expandSharedEvidenceItem(doc, item, expandMaxChars);
          return expanded ?? item;
        })
      : candidates;

    const adaptiveTimeoutMs = adaptiveVerificationTimeoutMs({
      thinkingMode:
        state.analysisProfile?.thinkingMode ??
        (state.request.thinkingMode === "deep" ? "deep" : "lite"),
      selectedCandidateCount: expandedCandidates.length,
      evidenceChars: expandedCandidates.reduce(
        (total, candidate) => total + candidate.quotedText.length,
        0
      ),
    });
    const remainingBranchMs = remainingBranchBudgetMs(state, ctx.unit);
    if (remainingBranchMs !== undefined && remainingBranchMs <= 1_000) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "This branch reached its execution ceiling before this requirement could be checked.",
          undefined,
          {
            ...semantics,
            evidenceState: "unavailable",
            analysisExecution: {
              status: "timed_out",
              detail: "The branch execution ceiling was reached.",
            },
          }
        )
      );
      return;
    }
    const timeoutMs = Math.max(
      1_000,
      Math.min(adaptiveTimeoutMs, remainingBranchMs ?? adaptiveTimeoutMs)
    );
    let verdicts: VerifyOutcome[] = [];
    let failedCandidateCount = 0;
    let executionIssue: AnalysisExecutionState | undefined;

    if (complianceReport) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const batch = await verifyPropositionCandidates(
          {
            hypothesis,
            proofStandard,
            candidates: expandedCandidates.map((item) => ({
              ref: item.ref,
              passage: item.quotedText,
              locator: item.contextHeading
                ? `${item.contextHeading} > ${item.structuralPath}`
                : item.structuralPath,
              context: [
                item.contextHeading,
                item.relationshipScope && item.relationshipScope !== "unspecified"
                  ? `relationship scope: ${item.relationshipScope}`
                  : undefined,
              ]
                .filter(Boolean)
                .join("; ") || undefined,
            })),
          },
          state,
          { abortSignal: controller.signal }
        );
        const byRef = new Map(expandedCandidates.map((item) => [item.ref, item]));
        verdicts = batch.flatMap(({ ref, result }) => {
          const item = byRef.get(ref);
          return item ? [{ item, result }] : [];
        });
        failedCandidateCount = Math.max(0, expandedCandidates.length - verdicts.length);
        if (failedCandidateCount > 0) {
          executionIssue = {
            status: "failed",
            detail: "The verifier returned an incomplete candidate set.",
          };
        }
      } catch (error) {
        const timedOut = controller.signal.aborted;
        failedCandidateCount = expandedCandidates.length;
        executionIssue = {
          status: timedOut ? "timed_out" : "failed",
          detail: timedOut
            ? `Verification exceeded the ${Math.round(timeoutMs / 1000)}-second limit.`
            : "The verification service did not complete this requirement.",
        };
        pacLog("[VERIFY] compliance requirement unavailable", {
          requirementId,
          status: executionIssue.status,
          timeoutMs,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        clearTimeout(timer);
      }
    } else {
      const settledVerdicts = await Promise.allSettled(
        expandedCandidates.map((item) =>
          withDeadline(
            verifyProposition(
              {
                hypothesis,
                proofStandard,
                candidatePassage: item.quotedText,
                candidateLocator: item.contextHeading
                  ? `${item.contextHeading} > ${item.structuralPath}`
                  : item.structuralPath,
                candidateContext: item.contextHeading,
              },
              state
            ),
            timeoutMs
          ).then((result) => ({ item, result }))
        )
      );
      verdicts = settledVerdicts.flatMap((settled) =>
        settled.status === "fulfilled" ? [settled.value] : []
      );
      failedCandidateCount = settledVerdicts.filter(
        (settled) => settled.status === "rejected"
      ).length;
    }
    if (failedCandidateCount > 0) {
      pacLog("[VERIFY] candidate failures isolated", {
        requirementId,
        failed: failedCandidateCount,
        succeeded: verdicts.length,
        timeoutMs,
      });
    }
    if (verdicts.length === 0) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "Candidate verification did not complete; no legal conclusion was reached for this requirement.",
          undefined,
          {
            ...semantics,
            evidenceState: "unavailable",
            analysisExecution: executionIssue,
          }
        )
      );
      return;
    }

    const proving = verdicts.filter(
      (v) => decisiveOutcome(v) && v.result.verdict === "proves"
    );
    const contradicting = verdicts.filter(
      (v) => decisiveOutcome(v) && v.result.verdict === "contradicts"
    );

    // Mixed decisive evidence is never resolved by array order. Distinct
    // scopes (jurisdiction/party/time/condition or main-rule/exception) are
    // kept scope-dependent; overlapping or unknown scopes are a genuine
    // conflict. Either way LOCK receives an indeterminate, explicitly
    // reconciled result rather than the old "first proves wins" status.
    if (proving.length > 0 && contradicting.length > 0) {
      const proof = proving[0]!;
      const contradiction = contradicting[0]!;
      const distinct = verifyOutcomesHaveDistinctScopes(
        proof.result,
        contradiction.result
      );
      pacLog("[VERIFY] mixed evidence reconciled", {
        requirementId,
        resolution: distinct ? "scope_dependent" : "conflicting",
        proving: proving.length,
        contradicting: contradicting.length,
      });
      logVerifyCandidates({
        requirementId,
        hypothesis,
        proofStandard,
        outcomes: verdicts,
        state,
        mixedResolution: distinct ? "scope_dependent" : "conflicting",
      });
      findings.push(
        buildMixedVerifyFinding(
          requirementId,
          ctx,
          semantics,
          proof,
          contradiction,
          distinct
        )
      );
      return;
    }

    // A direct Q&A proposition can be compositional: separate passages may
    // describe different parties, jurisdictions, periods, or conditions.
    // When VERIFY has grounded multiple relevant passages and their scopes
    // are demonstrably distinct, preserve both for the answer instead of
    // allowing the first single-passage verdict to erase the other scope.
    // This consumes only VERIFY outputs already produced above; it performs
    // no extra document transmission and contains no domain-specific terms.
    if (state.intent?.reportType === "qa_answer") {
      const scopedPair = firstDistinctScopePair(verdicts);
      if (scopedPair) {
        const scopedRefs = scopedPair.map(({ item }) => item.ref);
        pacLog("[VERIFY] scoped Q&A evidence preserved", {
          requirementId,
          resolution: "scope_dependent",
          passages: scopedRefs,
        });
        logVerifyCandidates({
          requirementId,
          hypothesis,
          proofStandard,
          outcomes: verdicts,
        state,
          scopeDependentRefs: scopedRefs,
        });
        findings.push(
          buildScopedQaFinding(requirementId, ctx, semantics, scopedPair)
        );
        return;
      }
    }

    const winner = proving[0] ?? contradicting[0];

    if (winner) {
      const winnerIndex = verdicts.indexOf(winner);
      logVerifyCandidates({
        requirementId,
        hypothesis,
        proofStandard,
        outcomes: verdicts,
        state,
        winnerIndex,
        winnerVerdict: winner.result.verdict === "proves" ? "proves" : "contradicts",
      });
      findings.push(
        buildVerifiedFinding(
          requirementId,
          winner.result.verdict === "proves" ? "proves" : "contradicts",
          winner.result,
          winner.item,
          ctx,
          requirementUsesRiskSemantics,
          semantics
        )
      );
      return;
    }

    if (complianceReport && executionIssue) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "Verification did not complete for every candidate, so no legal conclusion was reached for this requirement.",
          undefined,
          {
            ...semantics,
            evidenceState: "unavailable",
            analysisExecution: executionIssue,
          }
        )
      );
      return;
    }

    const partial = complianceReport
      ? verdicts.find(
          ({ result }) =>
            result.verdict === "related_not_proof" &&
            result.quoteVerified &&
            result.partialCoverage === true
        )
      : undefined;
    if (partial) {
      logVerifyCandidates({
        requirementId,
        hypothesis,
        proofStandard,
        outcomes: verdicts,
        state,
        partialIndex: verdicts.indexOf(partial),
      });
      findings.push(
        buildPartialVerifyFinding(requirementId, partial, ctx, semantics)
      );
      return;
    }

    // No proof. Prefer a candidate that carries a `dependency` - the prompt
    // asks the model to fill it "regardless of verdict", so a candidate
    // marked irrelevant/related_not_proof can still be the one that names
    // the missing Annex/Schedule; picking only from related_not_proof rows
    // (the old logic) silently dropped that signal when it landed on a
    // differently-verdicted candidate. Fall back to the richest
    // related_not_proof row when nothing carries a dependency.
    const closest =
      verdicts.find((v) => v.result.dependency) ??
      verdicts.find((v) => v.result.verdict === "related_not_proof" && v.result.gapDescription);
    const incomplete = verdicts.find(
      (v) =>
        v.item.truncated &&
        v.result.quoteVerified &&
        v.result.verdict === "contradicts"
    );
    if (incomplete) {
      pacLog("[VERIFY] decisive verdict withheld", {
        requirementId,
        reason: "logical_clause_still_truncated",
        ref: incomplete.item.ref,
      });
    }
    const closestIndex = closest ? verdicts.indexOf(closest) : undefined;
    logVerifyCandidates({
      requirementId,
      hypothesis,
      proofStandard,
      outcomes: verdicts,
      state,
      closestIndex,
    });
    findings.push(
      buildInsufficientVerifyFinding(
        requirementId,
        ctx,
        incomplete
          ? "The complete logical clause could not be loaded, so the apparent verdict could not be safely finalized. Review the full clause manually."
          : "No candidate passage proved or contradicted this requirement's proof standard.",
        closest?.result ?? incomplete?.result,
        {
          ...semantics,
          evidenceState: incomplete
            ? "truncated"
            : closest?.result.dependency
              ? undefined
              : closest
                ? "direct"
                : undefined,
          // A related passage that falls short of the proof standard is still
          // direct reviewed evidence. Preserve it for the report instead of
          // incorrectly turning "not adequate" into "no clause found".
          evidenceItem: incomplete?.item ?? closest?.item,
        }
      )
    );
    }
  );

  return findings;
}

function sanitizeForId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * VERIFY may return a valid verbatim prefix that stops mid-word or before the
 * sentence finishes. Extend only within the same source passage and only to a
 * nearby punctuation boundary, so the report never displays artificial `...`
 * or a chopped word while retaining source-grounded evidence.
 */
export function completeEvidenceQuote(passage: string, quote: string): string {
  const normalizedPassage = passage.replace(/\s+/g, " ").trim();
  const normalizedQuote = quote.replace(/\s+/g, " ").trim();
  if (!normalizedQuote || /[.!?;:]$/.test(normalizedQuote)) return normalizedQuote;
  const start = normalizedPassage.toLowerCase().indexOf(normalizedQuote.toLowerCase());
  if (start < 0) return normalizedQuote;
  const quoteEnd = start + normalizedQuote.length;
  const extensionLimit = Math.min(normalizedPassage.length, quoteEnd + 800);
  const tail = normalizedPassage.slice(quoteEnd, extensionLimit);
  const boundary = tail.search(/[.!?;](?=\s|$)/);
  if (boundary < 0) return normalizedQuote;
  return normalizedPassage.slice(start, quoteEnd + boundary + 1);
}

/**
 * A grounded clause may establish only one material part of a compound proof
 * standard. Preserve that legal state as partial coverage; it is neither a
 * full pass nor an evidence/analysis failure.
 */
function buildPartialVerifyFinding(
  requirementId: string,
  outcome: VerifyOutcome,
  ctx: VerifyFindingContext,
  semantics: FindingSemanticContext
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  const { item, result } = outcome;
  const dependsOnExternalMaterial = Boolean(result.dependency);
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
    compliance: "partial",
    evidenceState: dependsOnExternalMaterial ? "incorporated" : "direct",
    referenceBinding: dependsOnExternalMaterial ? "binding" : "none",
    evidenceConfidence: "medium",
    draftingQuality: "could_be_clearer",
    materiality: "medium",
    nli: "entailed",
  };
  return {
    findingId: sanitizeForId(
      `f_verify_partial_${canonicalId}_${ctx.unit.workUnitId}`
    ),
    kind: semantics.kind,
    category: ctx.findingCategory,
    status: "present",
    claim: result.establishedBy ?? result.rationale,
    evidence: [
      {
        locator: {
          docId: item.sourceDocId ?? ctx.docId,
          structuralPath: item.structuralPath,
          charRange: item.charRange,
        },
        quotedText: completeEvidenceQuote(item.quotedText, result.quote),
        sourceRole: "target",
      },
    ],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing",
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    judgement: {
      ...judgementBase,
      recommendationKind: recommendationKindFromAxes(judgementBase),
    },
    verifiedByProposition: true,
    gap: result.gapDescription,
    gapDescription: result.gapDescription,
    dependency: result.dependency,
    structuralNote: result.structuralNote,
    remediation: result.remediation,
    polarity: semantics.polarity,
    partyPerspective: semantics.partyPerspective,
    applicabilityScope: result.applicabilityScope,
    compareGroup: semantics.compareGroup,
    compareRole: semantics.compareRole,
  };
}

function buildVerifiedFinding(
  requirementId: string,
  verdict: Extract<VerifyVerdict, "proves" | "contradicts">,
  result: VerifyPropositionResult,
  item: SharedEvidenceItem,
  ctx: VerifyFindingContext,
  isRiskLane: boolean,
  semantics: FindingSemanticContext
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);

  const evidence: EvidenceSpan[] = [
    {
      locator: {
        docId: item.sourceDocId ?? ctx.docId,
        structuralPath: item.structuralPath,
        charRange: item.charRange,
      },
      quotedText: completeEvidenceQuote(item.quotedText, result.quote),
      sourceRole: "target",
    },
  ];

  const findingBase = {
    category: ctx.findingCategory,
    evidence,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing" as const,
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    verifiedByProposition: true,
    establishedBy: result.establishedBy,
    gapDescription: result.gapDescription,
    dependency: result.dependency,
    structuralNote: result.structuralNote,
    remediation: result.remediation,
    polarity: semantics.polarity,
    partyPerspective: semantics.partyPerspective,
    applicabilityScope: result.applicabilityScope,
  };

  // Open risk lane (operation=risk_flag) inverts the compliance meaning of the
  // verdict. A risk proposition is framed "an adverse thing is true about the
  // document", so:
  //   proves      → the risk IS present     → a real risk finding to surface
  //   contradicts → the risk is NOT present → reassuring; NOT a compliance gap
  // Compliance-lane findings keep their original meaning (proves = requirement
  // met, contradicts = gap). requirement-status-policy.ts already treats
  // kind:"risk" findings correctly (never counts them as compliance gaps) —
  // stamping the kind here is the wiring that finally lets that fire. The
  // present/absent signal rides on materiality + nli, not on a "gap".
  if (isRiskLane) {
    const riskPresent = verdict === "proves";
    const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
      compliance: "present",
      evidenceState: "direct",
      referenceBinding: "none",
      evidenceConfidence: "high",
      materiality: riskPresent ? "high" : "low",
      nli: riskPresent ? "entailed" : "contradicted",
    };
    const judgement: RequirementJudgement = {
      ...judgementBase,
      recommendationKind: recommendationKindFromAxes(judgementBase),
    };
    return {
      ...findingBase,
      findingId: sanitizeForId(
        `f_verify_${riskPresent ? "riskpresent" : "riskabsent"}_${canonicalId}_${ctx.unit.workUnitId}`
      ),
      kind: "risk",
      status: "present",
      claim: result.rationale,
      gap: undefined,
      judgement,
      polarity: riskPresent ? "risk_present" : "control_present",
    };
  }

  const provingPartial = verdict === "proves" && result.partialCoverage === true;
  const compliance =
    verdict === "proves" ? (provingPartial ? "partial" : "present") : "gap";
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
    compliance,
    evidenceState: "direct",
    referenceBinding: "none",
    evidenceConfidence: "high",
    draftingQuality: provingPartial
      ? "could_be_clearer"
      : verdict === "proves"
        ? "clean"
        : undefined,
    materiality: verdict === "contradicts" ? "high" : provingPartial ? "medium" : "low",
    nli: verdict === "proves" ? "entailed" : "contradicted",
  };
  const judgement: RequirementJudgement = {
    ...judgementBase,
    recommendationKind: recommendationKindFromAxes(judgementBase),
  };

  return {
    ...findingBase,
    findingId: sanitizeForId(
      `f_verify_${verdict === "proves" ? "cov" : "gap"}_${canonicalId}_${ctx.unit.workUnitId}`
    ),
    kind: semantics.kind,
    status: verdict === "proves" ? "present" : "absent_expected",
    claim: result.rationale,
    gap: verdict === "contradicts" ? result.rationale : undefined,
    judgement,
    compareGroup: semantics.compareGroup,
    compareRole: semantics.compareRole,
  };
}

/**
 * ACT-Phase — a requirement VERIFY couldn't prove/contradict is not always a
 * bare "cannot determine": when the closest candidate carried a `dependency`
 * (the proof standard is satisfied by an Annex/Schedule/SOW the document
 * itself incorporates but that wasn't supplied), that is a materially
 * different, more informative outcome — "the contract specifies this by
 * reference; obtain the schedule to confirm" — not "nothing found". Stamping
 * compliance=partial / evidenceState=incorporated / referenceBinding=binding
 * here (rather than the flat insufficient_evidence/not_found this always used
 * to emit) is picked up verbatim by aggregate-requirements.ts's "stamped
 * judgement wins" fast paths (requirement-status-policy.ts) and renders as
 * "Present, particulars in schedule" with an "obtain" recommendation instead
 * of the uninformative "Cannot determine" — using data VERIFY was already
 * computing (verify-proposition.ts's prompt asks for `dependency` "regardless
 * of verdict") but the finding builder previously discarded.
 */
function evidenceFromOutcome(outcome: VerifyOutcome, docId: string): EvidenceSpan {
  return {
    locator: {
      docId: outcome.item.sourceDocId ?? docId,
      structuralPath: outcome.item.structuralPath,
      charRange: outcome.item.charRange,
    },
    quotedText: completeEvidenceQuote(outcome.item.quotedText, outcome.result.quote),
    sourceRole: "target",
  };
}

function buildScopedQaFinding(
  requirementId: string,
  ctx: VerifyFindingContext,
  semantics: FindingSemanticContext,
  outcomes: [VerifyOutcome, VerifyOutcome]
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  const scopeLabels = outcomes.map(
    ({ item }) => item.contextHeading?.trim() || item.structuralPath
  );
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
    compliance: semantics.polarity === "neutral_fact" ? "present" : "partial",
    evidenceState: "direct",
    referenceBinding: "none",
    evidenceConfidence: "high",
    materiality: "low",
    nli: "entailed",
  };
  return {
    findingId: sanitizeForId(`f_verify_scoped_qa_${canonicalId}_${ctx.unit.workUnitId}`),
    kind: semantics.kind,
    category: ctx.findingCategory,
    status: "present",
    claim: `The document addresses the question through distinct operative scopes: ${scopeLabels.join("; ")}.`,
    evidence: outcomes.map((outcome) => evidenceFromOutcome(outcome, ctx.docId)),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing",
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    judgement: {
      ...judgementBase,
      recommendationKind: recommendationKindFromAxes(judgementBase),
    },
    verifiedByProposition: true,
    polarity: semantics.polarity,
    partyPerspective: semantics.partyPerspective,
    applicabilityResolution: "scope_dependent",
    compareGroup: semantics.compareGroup,
    compareRole: semantics.compareRole,
    structuralNote: `Evidence retained from both ${scopeLabels.join(" and ")} because their applicability scopes differ.`,
  };
}

function buildMixedVerifyFinding(
  requirementId: string,
  ctx: VerifyFindingContext,
  semantics: FindingSemanticContext,
  proving: VerifyOutcome,
  contradicting: VerifyOutcome,
  distinctScopes: boolean
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  if (distinctScopes) {
    const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
      compliance: semantics.polarity === "neutral_fact" ? "present" : "partial",
      evidenceState: "direct",
      referenceBinding: "none",
      evidenceConfidence: "high",
      materiality: semantics.polarity === "neutral_fact" ? "low" : "medium",
      nli: "entailed",
    };
    const judgement: RequirementJudgement = {
      ...judgementBase,
      recommendationKind: recommendationKindFromAxes(judgementBase),
    };
    const scopeExplanation =
      `Scope-dependent answer: ${proving.result.rationale} ` +
      `In a different stated scope, ${contradicting.result.rationale}`;
    return {
      findingId: sanitizeForId(`f_verify_scoped_${canonicalId}_${ctx.unit.workUnitId}`),
      kind: semantics.kind,
      category: ctx.findingCategory,
      status: "present",
      claim: scopeExplanation,
      evidence: [
        evidenceFromOutcome(proving, ctx.docId),
        evidenceFromOutcome(contradicting, ctx.docId),
      ],
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: ctx.unit.workUnitId,
      skillId: ctx.skillId,
      packageId: ctx.packageId,
      visibility: "user_facing",
      ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
      requirementId: canonicalId,
      judgement,
      verifiedByProposition: true,
      polarity: semantics.polarity,
      partyPerspective: semantics.partyPerspective,
      applicabilityResolution: "scope_dependent",
      compareGroup: semantics.compareGroup,
      compareRole: semantics.compareRole,
      structuralNote: scopeExplanation,
    };
  }

  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
    compliance: "insufficient_evidence",
    evidenceState: "conflicting",
    referenceBinding: "none",
    evidenceConfidence: "medium",
    materiality: "medium",
    nli: "not_mentioned",
  };
  const judgement: RequirementJudgement = {
    ...judgementBase,
    recommendationKind: recommendationKindFromAxes(judgementBase),
  };
  const scopeExplanation =
    "The evidence both proves and contradicts the proposition within overlapping or unresolved scope; the conflict requires manual reconciliation.";
  return {
    findingId: sanitizeForId(`f_verify_mixed_${canonicalId}_${ctx.unit.workUnitId}`),
    kind: semantics.kind,
    category: ctx.findingCategory,
    status: "insufficient_evidence",
    claim: scopeExplanation,
    evidence: [
      evidenceFromOutcome(proving, ctx.docId),
      evidenceFromOutcome(contradicting, ctx.docId),
    ],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing",
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    judgement,
    verifiedByProposition: true,
    polarity: semantics.polarity,
    partyPerspective: semantics.partyPerspective,
    applicabilityResolution: "conflicting",
    compareGroup: semantics.compareGroup,
    compareRole: semantics.compareRole,
    structuralNote: scopeExplanation,
  };
}

interface InsufficientVerifyOptions extends FindingSemanticContext {
  evidenceState?: Extract<
    EvidenceState,
    "direct" | "truncated" | "conflicting" | "unavailable"
  >;
  evidenceItem?: SharedEvidenceItem;
  analysisExecution?: AnalysisExecutionState;
}

function buildInsufficientVerifyFinding(
  requirementId: string,
  ctx: VerifyFindingContext,
  rationale: string,
  closest?: VerifyPropositionResult,
  options?: InsufficientVerifyOptions
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  const dependency = closest?.dependency;
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = options?.evidenceState
    ? {
        compliance: "insufficient_evidence",
        evidenceState: options.evidenceState,
        referenceBinding: "none",
        evidenceConfidence: "low",
        materiality: "medium",
        nli: "not_mentioned",
      }
    : dependency
    ? {
        compliance: "partial",
        evidenceState: "incorporated",
        referenceBinding: "binding",
        evidenceConfidence: "medium",
        materiality: "medium",
        nli: "not_mentioned",
      }
    : {
        compliance: "insufficient_evidence",
        evidenceState: "not_found",
        referenceBinding: "none",
        evidenceConfidence: "low",
        materiality: "low",
        nli: "not_mentioned",
      };
  const judgement: RequirementJudgement = {
    ...judgementBase,
    recommendationKind: recommendationKindFromAxes(judgementBase),
  };

  const claim = dependency
    ? `Specified by incorporation of ${dependency.document} — ${dependency.whyNeeded}`
    : (closest?.gapDescription ?? rationale);

  return {
    findingId: sanitizeForId(`f_verify_cd_${canonicalId}_${ctx.unit.workUnitId}`),
    kind: options?.kind ?? "compliance",
    category: ctx.findingCategory,
    status: "insufficient_evidence",
    claim,
    evidence: 
      options?.evidenceItem && closest?.quoteVerified && closest.quote
        ? [
            {
              locator: {
                docId: options.evidenceItem.sourceDocId ?? ctx.docId,
                structuralPath: options.evidenceItem.structuralPath,
                charRange: options.evidenceItem.charRange,
              },
              quotedText: closest.quote,
              sourceRole: "target",
            },
          ]
        : [],
    analysisExecution: options?.analysisExecution,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing",
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    judgement,
    verifiedByProposition: true,
    gapDescription: closest?.gapDescription,
    dependency: closest?.dependency,
    structuralNote: closest?.structuralNote,
    remediation: closest?.remediation,
    polarity: options?.polarity ?? "compliance_met",
    partyPerspective: options?.partyPerspective ?? "unspecified",
    applicabilityScope: closest?.applicabilityScope,
    compareGroup: options?.compareGroup,
    compareRole: options?.compareRole,
  };
}

/**
 * Map an LLM-returned requirement id onto the package's allowed native id.
 * PLAN aliases and near-matches must not be dropped.
 */
export function resolveAllowedRequirementId(
  rawId: string,
  allowedIds: string[]
): string | undefined {
  if (!rawId || allowedIds.length === 0) return undefined;
  for (const allowed of allowedIds) {
    if (requirementIdsEquivalent(rawId, allowed)) {
      return canonicalRequirementId(allowed);
    }
  }
  const rawCanon = canonicalRequirementId(rawId);
  for (const allowed of allowedIds) {
    if (canonicalRequirementId(allowed) === rawCanon) {
      return rawCanon;
    }
  }
  const rawNorm = rawId.trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const allowed of allowedIds) {
    const allowedNorm = allowed.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (
      rawNorm === allowedNorm ||
      rawNorm.endsWith(`.${allowedNorm}`) ||
      rawNorm.endsWith(`_${allowedNorm}`) ||
      rawNorm.endsWith(allowedNorm)
    ) {
      return canonicalRequirementId(allowed);
    }
  }
  return undefined;
}

function isolateAndNormalize(
  results: GroupedRequirementResult[],
  requirementIds: string[],
  items: SharedEvidenceItem[],
  extractionTargets: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined>
): GroupedRequirementResult[] {
  const allowedList = requirementIds.map((id) => canonicalRequirementId(id));
  const allowed = new Set(allowedList);
  const seen = new Set<string>();
  const packets = packetsByRequirement(
    allowedList,
    items,
    extractionTargets,
    Object.fromEntries(
      allowedList.map((id) => {
        const profile =
          profiles[id] ??
          profiles[
            requirementIds.find((raw) => canonicalRequirementId(raw) === id) ?? id
          ];
        return [id, profile];
      })
    )
  );
  const out: GroupedRequirementResult[] = [];
  for (const r of results) {
    if (!r) continue;
    const resolvedId = resolveAllowedRequirementId(r.requirementId, allowedList);
    if (!resolvedId || !allowed.has(resolvedId) || seen.has(resolvedId)) continue;
    seen.add(resolvedId);
    const profile =
      profiles[resolvedId] ??
      profiles[
        requirementIds.find((raw) => canonicalRequirementId(raw) === resolvedId) ??
          resolvedId
      ];
    const hints = hintsForRequirement(resolvedId, extractionTargets, profile);
    const packet = packets[resolvedId] ?? emptyPacket(resolvedId);
    const citeable = citeableRefsFromPacket(packet);
    const refs = resolveEvidenceRefsForRequirement(
      Array.isArray(r.evidenceRefs) ? r.evidenceRefs : [],
      items,
      citeable,
      hints,
      { requirementId: resolvedId, extractionTargets }
    );
    const supportingRefs = new Set(packet.supporting.map((i) => i.ref));
    const contextualOnly =
      refs.length > 0 && refs.every((ref) => !supportingRefs.has(ref));
    const forceInsufficient =
      (refs.length === 0 && !coverageShouldBePreserved(r)) ||
      (contextualOnly &&
        (r.compliance === "present" ||
          r.status === "strong" ||
          r.status === "adequate" ||
          r.status === "covered"));
    out.push({
      requirementId: resolvedId,
      status: forceInsufficient ? "cannot_determine" : r.status,
      compliance: forceInsufficient
        ? contextualOnly
          ? "insufficient_evidence"
          : "insufficient_evidence"
        : r.compliance,
      evidenceState: forceInsufficient
        ? "not_found"
        : r.evidenceState,
      referenceBinding: r.referenceBinding,
      evidenceConfidence: forceInsufficient ? "low" : r.evidenceConfidence,
      draftingQuality: r.draftingQuality,
      materiality: r.materiality,
      nli: forceInsufficient && !r.nli ? "not_mentioned" : r.nli,
      rationale: r.rationale ?? "",
      gap: r.gap,
      evidenceRefs: refs,
      recommendation: r.recommendation,
    });
  }
  return out;
}

function emptyPacket(requirementId: string): EvidencePacket {
  return {
    requirementId,
    supporting: [],
    contradicting: [],
    contextual: [],
    insufficient: [],
  };
}

function formatPacketEvidenceLines(packet: EvidencePacket): string[] {
  const lines: string[] = [];
  for (const item of packet.supporting) {
    lines.push(formatEvidenceLine(item, ["supporting"]));
  }
  for (const item of packet.contextual) {
    lines.push(formatEvidenceLine(item, ["contextual"]));
  }
  if (packet.insufficient.length > 0) {
    lines.push(
      `(do not treat as proof) ${packet.insufficient
        .map((i) => i.ref)
        .join(", ")}`
    );
  }
  return lines;
}

function hypothesisFor(
  requirementId: string,
  profile: RequirementEvidenceProfile | undefined,
  state: AnalysisState
): string {
  if (profile?.hypothesis?.trim()) return profile.hypothesis.trim();
  const fromIntent = state.intent?.requirements?.find((req) =>
    requirementIdsEquivalent(req.id, requirementId)
  )
    ?.description?.trim();
  if (fromIntent) return fromIntent;
  return `The reviewed instrument satisfies ${requirementId.replace(/[._-]+/g, " ")}.`;
}

function briefsForRequirements(
  reqIds: string[],
  briefs: CapabilityBrief[],
  capabilityIds: string[],
  packageRequirementIds: string[],
  bindings: Record<string, string[]>
): CapabilityBrief[] {
  const wanted = new Set<string>();
  const hasBindings = reqIds.some((id) => (bindings[id] ?? []).length > 0);
  const zip =
    !hasBindings &&
    packageRequirementIds.length === capabilityIds.length &&
    packageRequirementIds.length > 0;
  for (const reqId of reqIds) {
    const bound = bindings[reqId];
    if (bound?.length) {
      for (const capId of bound) wanted.add(capId);
      continue;
    }
    if (zip) {
      const index = packageRequirementIds.indexOf(reqId);
      if (index >= 0 && capabilityIds[index]) wanted.add(capabilityIds[index]);
    }
  }
  if (wanted.size === 0) return briefs;
  const filtered = briefs.filter((brief) => wanted.has(brief.id));
  return filtered.length > 0 ? filtered : briefs;
}

function formatEvidenceLine(e: SharedEvidenceItem, owners: string[] = []): string {
  const flags = [
    e.evidenceStatus ? `status=${e.evidenceStatus}` : "",
    e.truncated ? "truncated=true" : "",
    isHeadingOnlyMatch(e.matchReason) ? "heading_only=true" : "",
    e.referencedDocuments && e.referencedDocuments.length > 0
      ? `referenced=${e.referencedDocuments.join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tag = flags ? ` ${flags}` : "";
  const owner =
    owners.length > 0 ? ` candidates=${owners.join("|")}` : "";
  return `(${e.ref}) [${e.clauseType}${tag}${owner}] ${e.quotedText}`;
}

function citedItems(
  result: GroupedRequirementResult,
  bundle: SharedEvidenceBundle
): SharedEvidenceItem[] {
  if (result.evidenceRefs.length === 0) return bundle.items;
  const wanted = new Set(result.evidenceRefs);
  const hit = bundle.items.filter((item) => wanted.has(item.ref));
  return hit.length > 0 ? hit : bundle.items;
}

function evidenceIsIncomplete(
  result: GroupedRequirementResult,
  bundle: SharedEvidenceBundle
): boolean {
  const items = citedItems(result, bundle);
  return items.some(
    (item) => item.truncated || isHeadingOnlyMatch(item.matchReason)
  );
}

function requirementsNeedingEvidenceExpansion(
  results: GroupedRequirementResult[],
  bundle: SharedEvidenceBundle
): string[] {
  return results
    .filter(
      (r) =>
        r.status !== "not_applicable" &&
        evidenceIsIncomplete(r, bundle)
    )
    .map((r) => r.requirementId);
}

function expandBundleItems(
  doc: SegmentedDocument,
  bundle: SharedEvidenceBundle,
  retryIds: string[],
  results: GroupedRequirementResult[],
  maxChars: number
): { bundle: SharedEvidenceBundle; changed: boolean } {
  const retry = new Set(retryIds);
  const refsToExpand = new Set<string>();
  for (const result of results) {
    if (!retry.has(result.requirementId)) continue;
    for (const item of citedItems(result, bundle)) {
      if (item.truncated || isHeadingOnlyMatch(item.matchReason)) {
        refsToExpand.add(item.ref);
      }
    }
  }
  if (refsToExpand.size === 0) {
    for (const item of bundle.items) {
      if (item.truncated || isHeadingOnlyMatch(item.matchReason)) {
        refsToExpand.add(item.ref);
      }
    }
  }
  let changed = false;
  const items = bundle.items.map((item) => {
    if (!refsToExpand.has(item.ref)) return item;
    const expanded = expandSharedEvidenceItem(doc, item, maxChars);
    if (!expanded) return item;
    changed = true;
    return expanded;
  });
  return { bundle: { ...bundle, items }, changed };
}

function mergeRequirementResults(
  original: GroupedRequirementResult[],
  retry: GroupedRequirementResult[]
): GroupedRequirementResult[] {
  const byId = new Map(original.map((r) => [r.requirementId, r]));
  for (const next of retry) {
    byId.set(next.requirementId, next);
  }
  return [...byId.values()];
}

async function buildCapabilityBriefs(
  skillIds: string[],
  capabilityIds: string[]
): Promise<CapabilityBrief[]> {
  const briefs: CapabilityBrief[] = [];
  for (const capId of capabilityIds) {
    const rule = resolveRule(skillIds, capId);
    if (rule) {
      const section = await loadSkillMdSection(rule.skillId, `rule:${capId}`);
      briefs.push({
        id: capId,
        kind: "rule",
        text: rule.rule.ruleText || section || rule.rule.label || capId,
        findingCategory: rule.rule.findingCategory,
      });
      continue;
    }
    const fromSkill = resolveNonRuleCapability(skillIds, capId);
    if (fromSkill) briefs.push(fromSkill);
  }
  return briefs;
}

function resolveNonRuleCapability(
  skillIds: string[],
  capId: string
): CapabilityBrief | null {
  for (const skillId of skillIds) {
    const skill = getSkillById(skillId);
    if (!skill) continue;
    const row = skill.rightsMatrixRows?.find((r) => r.rowId === capId);
    if (row) {
      return {
        id: capId,
        kind: "matrix_row",
        text: `${row.label} (Article ${row.article})`,
      };
    }
    const risk = skill.riskCategories.find((r) => r.category === capId);
    if (risk) {
      return {
        id: capId,
        kind: "risk_category",
        text: `${risk.displayLabel}: ${risk.guidance}`,
        findingCategory: risk.category,
      };
    }
  }
  return null;
}
