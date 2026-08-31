import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import type { EvidencePackageSourceMode, SharedEvidenceBundle, SharedEvidenceItem } from "../../models/evidence-package.js";
import type { GroupedRequirementResult, RequirementJudgement } from "../../models/requirement-assessment.js";
import { recommendationKindFromAxes } from "../../models/requirement-assessment.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import { resolveRule } from "./check-against-rule.js";
import { insufficient } from "./act-utils.js";
import { groupedResultsToFindings, TIER_BY_SOURCE } from "./grouped-results-to-findings.js";
import {
  verifyProposition,
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
  profileThinkingLevel,
  profileVerifyCandidateCap,
} from "../../utils/profile-thinking.js";
import {
  EVALUATE_PACKAGE_SYSTEM_PROMPT,
  buildEvaluatePackageUserPrompt,
} from "../../prompts/evaluate-package.js";
import {
  expandSharedEvidenceItem,
  isHeadingOnlyMatch,
} from "./locate-evidence.js";

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
  const requirementEvidence =
    (unit.input.requirementEvidence as Record<string, RequirementEvidenceProfile> | undefined) ??
    {};
  const requirementBindings =
    (unit.input.requirementBindings as Record<string, string[]> | undefined) ?? {};

  if (requirementIds.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(unit, `Package ${packageId} resolved no requirements`),
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
    const verifyFindings = await evaluateWithVerify(
      requirementIds,
      evidenceItems,
      extractionTargets,
      requirementEvidence,
      state,
      { unit, docId, packageId, sourceMode, skillId: skillIds[0], findingCategory }
    );
    return { state, findings: [...findings, ...verifyFindings] };
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
        insufficient(
          unit,
          `Grouped evaluation failed for package ${packageId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        ),
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

  return { state: nextState, findings: [...findings, ...emitted, ...missingFindings] };
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

  for (const requirementId of reqIds) {
    const profile = profiles[requirementId];
    const proofStandard = profile?.proofStandard?.trim();
    if (!proofStandard) continue;

    if (skipSupporting && isSupportingPriority(requirementId, state)) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "Not investigated under Lite mode — PLAN marked this a supporting, not required, priority."
        )
      );
      continue;
    }

    const hypothesis = hypothesisFor(requirementId, profile, state);
    const candidates = resolveRecallCandidates(
      requirementId,
      items,
      extractionTargets,
      profile,
      candidateCap
    );

    if (candidates.length === 0) {
      findings.push(
        buildInsufficientVerifyFinding(
          requirementId,
          ctx,
          "No candidate evidence was found in the document for this requirement."
        )
      );
      continue;
    }

    const verdicts = await Promise.all(
      candidates.map((item) =>
        verifyProposition({
          hypothesis,
          proofStandard,
          candidatePassage: item.quotedText,
          candidateLocator: item.structuralPath,
        }).then((result) => ({ item, result }))
      )
    );

    const proving = verdicts.find(
      (v) => v.result.verdict === "proves" && v.result.quoteVerified
    );
    const contradicting = verdicts.find(
      (v) => v.result.verdict === "contradicts" && v.result.quoteVerified
    );
    const winner = proving ?? contradicting;

    if (winner) {
      findings.push(
        buildVerifiedFinding(
          requirementId,
          winner.result.verdict === "proves" ? "proves" : "contradicts",
          winner.result,
          winner.item,
          ctx
        )
      );
      continue;
    }

    // No proof, but the closest related_not_proof verdict often carries the
    // exact enrichment content the research doc's Mastercard example calls
    // for ("specifies the consequence, not the duration itself") — surface
    // it on the insufficient-evidence finding rather than discarding it.
    const closest = verdicts.find(
      (v) => v.result.verdict === "related_not_proof" && v.result.gapDescription
    );
    findings.push(
      buildInsufficientVerifyFinding(
        requirementId,
        ctx,
        "No candidate passage proved or contradicted this requirement's proof standard.",
        closest?.result
      )
    );
  }

  return findings;
}

function sanitizeForId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildVerifiedFinding(
  requirementId: string,
  verdict: Extract<VerifyVerdict, "proves" | "contradicts">,
  result: VerifyPropositionResult,
  item: SharedEvidenceItem,
  ctx: VerifyFindingContext
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  const compliance = verdict === "proves" ? "present" : "gap";
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
    compliance,
    evidenceState: "direct",
    referenceBinding: "none",
    evidenceConfidence: "high",
    draftingQuality: verdict === "proves" ? "clean" : undefined,
    materiality: verdict === "contradicts" ? "high" : "low",
    nli: verdict === "proves" ? "entailed" : "contradicted",
  };
  const judgement: RequirementJudgement = {
    ...judgementBase,
    recommendationKind: recommendationKindFromAxes(judgementBase),
  };

  const evidence: EvidenceSpan[] = [
    {
      locator: {
        docId: ctx.docId,
        structuralPath: item.structuralPath,
        charRange: item.charRange,
      },
      quotedText: result.quote,
      sourceRole: "target",
    },
  ];

  return {
    findingId: sanitizeForId(
      `f_verify_${verdict === "proves" ? "cov" : "gap"}_${canonicalId}_${ctx.unit.workUnitId}`
    ),
    kind: "compliance",
    category: ctx.findingCategory,
    status: verdict === "proves" ? "present" : "absent_expected",
    claim: result.rationale,
    gap: verdict === "contradicts" ? result.rationale : undefined,
    evidence,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing",
    ruleSourceTier: TIER_BY_SOURCE[ctx.sourceMode],
    requirementId: canonicalId,
    judgement,
    verifiedByProposition: true,
    establishedBy: result.establishedBy,
    gapDescription: result.gapDescription,
    dependency: result.dependency,
    structuralNote: result.structuralNote,
    remediation: result.remediation,
  };
}

function buildInsufficientVerifyFinding(
  requirementId: string,
  ctx: VerifyFindingContext,
  rationale: string,
  closest?: VerifyPropositionResult
): Finding {
  const canonicalId = canonicalRequirementId(requirementId);
  const judgementBase: Omit<RequirementJudgement, "recommendationKind"> = {
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

  return {
    findingId: sanitizeForId(`f_verify_cd_${canonicalId}_${ctx.unit.workUnitId}`),
    kind: "compliance",
    category: ctx.findingCategory,
    status: "insufficient_evidence",
    claim: closest?.gapDescription ?? rationale,
    evidence: [],
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
        (r.status === "cannot_determine" ||
          r.status === "partial" ||
          r.status === "conditional" ||
          r.compliance === "insufficient_evidence" ||
          r.compliance === "partial") &&
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
