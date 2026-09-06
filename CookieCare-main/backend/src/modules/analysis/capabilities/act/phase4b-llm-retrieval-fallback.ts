/**
 * Bounded LLM-assisted retrieval fallback (add-on to Phase 4B).
 *
 * When the initial verification matrix leaves an element `not_located` /
 * `ambiguous` / `unresolved_dependency`, or when the would-be status is
 * `partial` / `gap`, we ask an LLM to propose ONLY a retrieval plan (never
 * evidence, never a verdict). Its plan runs through the existing lexical
 * matcher over the full document's section index; candidates are structurally
 * expanded (Phase 3B semantics), deterministically validated, added to a
 * rebuilt bundle, and re-verified. Up to two rounds.
 *
 * Nothing here changes live retrieval, live VERIFY, or live rendering — the
 * improved matrix lives alongside the initial one and is emitted for review
 * before Phase 5 promotes it.
 */

import type { AnalysisState } from "../../models/analysis-state.js";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type {
  RequirementElementSchema,
} from "./element-schemas.js";
import {
  verifyRequirement,
  type ElementVerdict,
  type RequirementMatrix,
} from "./phase4-verify.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
  Phase3ScopeVector,
} from "./phase3-investigate.js";
import type { StructuralNode } from "../../segmentation/structural-nodes.js";
import type {
  DefinitionIndexEntry,
  ReferenceRecord,
} from "../../segmentation/reference-index.js";
import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import { inferEvidenceRelationshipScope } from "./select-candidates.js";
import { tokenizeForEvidence } from "./isolate-requirement-evidence.js";

const FALLBACK_SYSTEM_PROMPT = [
  "You produce ONLY a JSON retrieval plan for a legal compliance search.",
  "You must NEVER output evidence, quotes, verdicts, or a compliance status.",
  "You must NEVER invent clause numbers, headings, or defined-term names that were not shown to you.",
  "Every element of the plan (lexicalQueries, semanticQueries, headingTargets, definitionTerms, referenceTargets) must be tied to a targetElementId given in the input.",
  "Prefer short, distinctive lexical anchors (statutory verbs / defined-term names / clause numbers).",
  "Prefer 3-8 word semantic queries that describe what the missing element needs.",
  "If nothing new can be tried for an element, return an empty plan for it — do not fabricate.",
].join("\n");

const RETRIEVAL_PLAN_SCHEMA = {
  type: "object",
  properties: {
    plan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetElementId: { type: "string" },
          lexicalQueries: { type: "array", items: { type: "string" } },
          semanticQueries: { type: "array", items: { type: "string" } },
          headingTargets: { type: "array", items: { type: "string" } },
          definitionTerms: { type: "array", items: { type: "string" } },
          referenceTargets: { type: "array", items: { type: "string" } },
        },
        required: ["targetElementId"],
      },
    },
  },
  required: ["plan"],
};

interface ElementPlan {
  targetElementId: string;
  lexicalQueries?: string[];
  semanticQueries?: string[];
  headingTargets?: string[];
  definitionTerms?: string[];
  referenceTargets?: string[];
}

interface FallbackInput {
  state: AnalysisState;
  requirementId: string;
  schema: RequirementElementSchema;
  initialBundle: Phase3Bundle;
  initialMatrix: RequirementMatrix;
  docId: string;
  sectionIndex: SharedEvidenceItem[];
  structuralNodes: StructuralNode[];
  references: ReferenceRecord[];
  definitions: DefinitionIndexEntry[];
}

export interface FallbackRoundLog {
  round: number;
  triggeredBy: string[];
  targetElementIds: string[];
  generatedQueries: {
    targetElementId: string;
    lexicalQueries: string[];
    semanticQueries: string[];
    headingTargets: string[];
    definitionTerms: string[];
    referenceTargets: string[];
  }[];
  retrievedCandidateIds: string[];
  acceptedCandidateIds: string[];
  rejectedCandidates: { candidateId: string; reason: string }[];
  rebuiltBundleEvidenceIds: string[];
  verificationResult: Record<string, ElementVerdict["state"]>;
  llmCallOk: boolean;
  llmError?: string;
}

export interface FallbackOutcome {
  requirementId: string;
  triggered: boolean;
  triggerReasons: string[];
  missingElementIdsAtStart: string[];
  initialBundleEvidenceIds: string[];
  rounds: FallbackRoundLog[];
  finalBundleEvidenceIds: string[];
  /** The matrix Phase 4B produced before this fallback ran (unmodified). */
  initialMatrix: RequirementMatrix;
  finalMatrix: RequirementMatrix;
  retrievalComplete: boolean;
  unresolvedReferences: string[];
  investigationIncomplete: boolean;
}

const MAX_ROUNDS = 2;

/** Public entry point — pure side-channel. */
export async function runFallbackForRequirement(
  input: FallbackInput
): Promise<FallbackOutcome> {
  const initialBundleEvidenceIds = input.initialBundle.items.map((i) => i.spanId);
  const missingElementIdsAtStart = triggerElements(input.initialMatrix);
  const triggerReasons = buildTriggerReasons(input);

  const noTrigger = triggerReasons.length === 0;
  if (noTrigger) {
    return {
      requirementId: input.requirementId,
      triggered: false,
      triggerReasons: [],
      missingElementIdsAtStart,
      initialBundleEvidenceIds,
      rounds: [],
      finalBundleEvidenceIds: initialBundleEvidenceIds,
      initialMatrix: input.initialMatrix,
      finalMatrix: input.initialMatrix,
      retrievalComplete: retrievalCompleteFor(input.initialBundle),
      unresolvedReferences: unresolvedRefs(input.initialBundle),
      investigationIncomplete: false,
    };
  }

  let currentBundle: Phase3Bundle = input.initialBundle;
  let currentMatrix: RequirementMatrix = input.initialMatrix;
  const rounds: FallbackRoundLog[] = [];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const targets = triggerElements(currentMatrix);
    if (targets.length === 0) break;

    const roundLog: FallbackRoundLog = {
      round,
      triggeredBy: round === 1 ? triggerReasons : ["prior_round_still_missing"],
      targetElementIds: targets,
      generatedQueries: [],
      retrievedCandidateIds: [],
      acceptedCandidateIds: [],
      rejectedCandidates: [],
      rebuiltBundleEvidenceIds: [],
      verificationResult: {},
      llmCallOk: false,
    };

    const alreadyQueriedRefs = round === 1
      ? gatherPriorQueries(input)
      : rounds[rounds.length - 1]?.generatedQueries.flatMap((g) => [
          ...g.lexicalQueries,
          ...g.semanticQueries,
        ]) ?? [];

    let plan: ElementPlan[] = [];
    try {
      plan = await requestPlanFromLLM({
        state: input.state,
        requirementId: input.requirementId,
        schema: input.schema,
        targetElementIds: targets,
        currentBundle,
        currentMatrix,
        sectionIndex: input.sectionIndex,
        alreadyQueried: alreadyQueriedRefs,
      });
      roundLog.llmCallOk = true;
    } catch (err) {
      roundLog.llmCallOk = false;
      roundLog.llmError = err instanceof Error ? err.message : String(err);
      rounds.push(roundLog);
      break;
    }

    // Restrict LLM plan to declared target elements; drop anything it fabricated.
    const validTargets = new Set(input.schema.elements.map((e) => e.elementId));
    plan = plan.filter((p) => validTargets.has(p.targetElementId));
    roundLog.generatedQueries = plan.map((p) => ({
      targetElementId: p.targetElementId,
      lexicalQueries: p.lexicalQueries ?? [],
      semanticQueries: p.semanticQueries ?? [],
      headingTargets: p.headingTargets ?? [],
      definitionTerms: p.definitionTerms ?? [],
      referenceTargets: p.referenceTargets ?? [],
    }));

    const seedCandidates = executePlan(plan, input.sectionIndex);
    roundLog.retrievedCandidateIds = seedCandidates.map((c) => candidateSpanId(c));

    const { accepted, rejected } = validateCandidates(seedCandidates, input);
    for (const r of rejected) roundLog.rejectedCandidates.push(r);
    roundLog.acceptedCandidateIds = accepted.map((c) => candidateSpanId(c));

    const rebuilt = rebuildBundle(currentBundle, accepted, input);
    roundLog.rebuiltBundleEvidenceIds = rebuilt.items.map((i) => i.spanId);

    currentBundle = rebuilt;
    currentMatrix = verifyRequirement({
      requirementId: input.requirementId,
      bundle: rebuilt,
      schema: input.schema,
    });
    for (const el of currentMatrix.elements) {
      roundLog.verificationResult[el.elementId] = el.state;
    }
    rounds.push(roundLog);
  }

  const investigationIncomplete = !retrievalCompleteFor(currentBundle);
  return {
    requirementId: input.requirementId,
    triggered: true,
    triggerReasons,
    missingElementIdsAtStart,
    initialBundleEvidenceIds,
    rounds,
    finalBundleEvidenceIds: currentBundle.items.map((i) => i.spanId),
    initialMatrix: input.initialMatrix,
    finalMatrix: currentMatrix,
    retrievalComplete: !investigationIncomplete,
    unresolvedReferences: unresolvedRefs(currentBundle),
    investigationIncomplete,
  };
}

function triggerElements(matrix: RequirementMatrix): string[] {
  return matrix.elements
    .filter(
      (e) =>
        e.state === "not_located" ||
        e.state === "ambiguous" ||
        e.state === "unresolved_dependency"
    )
    .map((e) => e.elementId);
}

function buildTriggerReasons(input: FallbackInput): string[] {
  const reasons: string[] = [];
  const missing = triggerElements(input.initialMatrix);
  if (missing.length > 0) reasons.push(`missing_elements:${missing.join(",")}`);
  const wouldBeStatus = coarseStatus(input.initialMatrix);
  if (wouldBeStatus === "partial" || wouldBeStatus === "gap") {
    reasons.push(`would_be_${wouldBeStatus}`);
  }
  const unresolved = unresolvedRefs(input.initialBundle);
  if (unresolved.length > 0) reasons.push(`unresolved_refs:${unresolved.length}`);
  return reasons;
}

function coarseStatus(matrix: RequirementMatrix): "present" | "partial" | "gap" {
  const applicable = matrix.elements.filter((e) => e.state !== "not_applicable");
  if (applicable.length === 0) return "gap";
  const supported = applicable.filter((e) => e.state === "supported").length;
  if (supported === applicable.length) return "present";
  if (supported === 0) return "gap";
  return "partial";
}

function unresolvedRefs(bundle: Phase3Bundle): string[] {
  return bundle.dependencies
    .filter((d) => d.state !== "resolved_internal")
    .map((d) => d.reference);
}

function retrievalCompleteFor(bundle: Phase3Bundle): boolean {
  const truncationExcluded = bundle.exclusions.some(
    (x) => x.reason === "budget"
  );
  const unresolved = unresolvedRefs(bundle);
  return !truncationExcluded && unresolved.length === 0;
}

function gatherPriorQueries(input: FallbackInput): string[] {
  // Best-effort: the initial bundle's item refs act as "we already looked here."
  return input.initialBundle.items.map((i) => i.structuralPath);
}

async function requestPlanFromLLM(args: {
  state: AnalysisState;
  requirementId: string;
  schema: RequirementElementSchema;
  targetElementIds: string[];
  currentBundle: Phase3Bundle;
  currentMatrix: RequirementMatrix;
  sectionIndex: SharedEvidenceItem[];
  alreadyQueried: string[];
}): Promise<ElementPlan[]> {
  const {
    state,
    requirementId,
    schema,
    targetElementIds,
    currentBundle,
    currentMatrix,
    sectionIndex,
    alreadyQueried,
  } = args;
  const targetElements = schema.elements.filter((e) =>
    targetElementIds.includes(e.elementId)
  );
  const headings = sectionIndex
    .slice(0, 120)
    .map(
      (s) =>
        `${s.ref} · ${s.clauseType} · ${s.structuralPath ?? "(no path)"}`
    );
  const elementRows = targetElements
    .map(
      (el) =>
        `- ${el.elementId} (${el.kind}): ${el.proposition}\n  proofGuidance: ${el.proofGuidance}\n  currentState: ${currentMatrix.elements.find((e) => e.elementId === el.elementId)?.state ?? "unknown"}`
    )
    .join("\n");
  const existingBundleRefs = currentBundle.items
    .slice(0, 40)
    .map((i) => `${i.spanId} · ${i.structuralPath}`)
    .join("\n");
  const prompt = [
    `Requirement: ${schema.title} (${schema.legalCitation})`,
    `RequirementId: ${requirementId}`,
    "",
    "Missing / ambiguous elements you must propose a retrieval plan for:",
    elementRows,
    "",
    "Document section index (ref · clauseType · path):",
    headings.join("\n"),
    "",
    "Items already in the bundle (do not just repeat these):",
    existingBundleRefs || "(none)",
    "",
    "Structural paths already queried:",
    alreadyQueried.slice(0, 40).join("\n") || "(none)",
    "",
    "Return a JSON object of shape { plan: [{ targetElementId, lexicalQueries[], semanticQueries[], headingTargets[], definitionTerms[], referenceTargets[] }] }.",
    "Only propose queries. Do not output quotes, evidence, or a status.",
  ].join("\n");

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const raw = await executeJsonCompletion<{ plan: ElementPlan[] }>(
    prompt,
    FALLBACK_SYSTEM_PROMPT,
    RETRIEVAL_PLAN_SCHEMA,
    LLMTask.STRUCTURAL_JSON,
    LLMProvider.GEMINI,
    { tracker }
  );
  if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
  if (!raw || !Array.isArray(raw.plan)) return [];
  return raw.plan;
}

interface Candidate {
  item: SharedEvidenceItem;
  matchedBy: string[];
  targetElementIds: string[];
}

function candidateSpanId(c: Candidate): string {
  return `${c.item.sourceDocId ?? "doc"}::section::${c.item.charRange[0]}-${c.item.charRange[1]}`;
}

function executePlan(plan: ElementPlan[], sectionIndex: SharedEvidenceItem[]): Candidate[] {
  const acc = new Map<string, Candidate>();
  const addHit = (
    item: SharedEvidenceItem,
    matchedBy: string,
    targetElementId: string
  ) => {
    const key = `${item.charRange[0]}-${item.charRange[1]}`;
    const existing = acc.get(key);
    if (existing) {
      if (!existing.matchedBy.includes(matchedBy)) existing.matchedBy.push(matchedBy);
      if (!existing.targetElementIds.includes(targetElementId))
        existing.targetElementIds.push(targetElementId);
      return;
    }
    acc.set(key, {
      item,
      matchedBy: [matchedBy],
      targetElementIds: [targetElementId],
    });
  };
  for (const p of plan) {
    for (const q of p.lexicalQueries ?? []) {
      for (const item of scoreLexical(q, sectionIndex, 6)) {
        addHit(item, "lexical", p.targetElementId);
      }
    }
    for (const q of p.semanticQueries ?? []) {
      // Deterministic path: treat semantic queries as extra lexical queries
      // over the section index. A real dense pass is a future optimisation;
      // for now, matching on the noun-phrase tokens is enough to surface
      // sections the initial lexical pass missed.
      for (const item of scoreLexical(q, sectionIndex, 6)) {
        addHit(item, "semantic", p.targetElementId);
      }
    }
    for (const heading of p.headingTargets ?? []) {
      const norm = heading.toLowerCase();
      for (const item of sectionIndex) {
        const hay = `${item.clauseType} ${item.structuralPath ?? ""} ${item.contextHeading ?? ""}`.toLowerCase();
        if (hay.includes(norm)) addHit(item, "heading", p.targetElementId);
      }
    }
    for (const term of p.definitionTerms ?? []) {
      const t = term.toLowerCase();
      for (const item of sectionIndex) {
        if (item.quotedText.toLowerCase().includes(t)) {
          addHit(item, "definition", p.targetElementId);
        }
      }
    }
    for (const ref of p.referenceTargets ?? []) {
      const r = ref.toLowerCase();
      for (const item of sectionIndex) {
        if (item.quotedText.toLowerCase().includes(r)) {
          addHit(item, "reference", p.targetElementId);
        }
      }
    }
  }
  return [...acc.values()];
}

function scoreLexical(
  query: string,
  sections: SharedEvidenceItem[],
  cap: number
): SharedEvidenceItem[] {
  const tokens = tokenizeForEvidence(query).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];
  const scored: Array<{ item: SharedEvidenceItem; score: number }> = [];
  for (const item of sections) {
    const hay = `${item.clauseType} ${item.structuralPath ?? ""} ${item.quotedText}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += Math.min(t.length, 10);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap).map((s) => s.item);
}

function validateCandidates(
  candidates: Candidate[],
  input: FallbackInput
): { accepted: Candidate[]; rejected: { candidateId: string; reason: string }[] } {
  const accepted: Candidate[] = [];
  const rejected: { candidateId: string; reason: string }[] = [];
  const validRefs = new Set(input.sectionIndex.map((s) => s.ref));
  const bundleSpanIds = new Set(input.initialBundle.items.map((i) => i.spanId));

  // Scope of the dominant partition — used to reject incompatible-scope
  // candidates the LLM might pull in.
  const dominant = [...input.initialBundle.partitions].sort(
    (a, b) => b.itemSpanIds.length - a.itemSpanIds.length
  )[0];

  for (const c of candidates) {
    const cid = candidateSpanId(c);
    if (!validRefs.has(c.item.ref)) {
      rejected.push({ candidateId: cid, reason: "ref_not_in_document_index" });
      continue;
    }
    if (bundleSpanIds.has(cid)) {
      rejected.push({ candidateId: cid, reason: "already_in_bundle" });
      continue;
    }
    // Every quoted substring must be a substring of the section's text —
    // guaranteed here because candidates come FROM the section index; the
    // check is deterministic and cheap belt-and-suspenders.
    if (!c.item.quotedText || c.item.quotedText.length === 0) {
      rejected.push({ candidateId: cid, reason: "empty_quote" });
      continue;
    }
    if (dominant) {
      const scope = inferScopeForItem(c.item);
      if (!scopesCompatible(scope, dominant.scope)) {
        rejected.push({ candidateId: cid, reason: "incompatible_scope" });
        continue;
      }
    }
    accepted.push(c);
  }
  return { accepted, rejected };
}

function inferScopeForItem(item: SharedEvidenceItem): Phase3ScopeVector {
  return {
    relationship:
      item.relationshipScope ??
      inferEvidenceRelationshipScope({
        contextHeading: item.contextHeading,
        title: item.clauseType,
        structuralPath: item.structuralPath,
        text: item.quotedText,
      }),
  };
}

function scopesCompatible(a: Phase3ScopeVector, b: Phase3ScopeVector): boolean {
  if (
    a.relationship &&
    b.relationship &&
    a.relationship !== "unspecified" &&
    b.relationship !== "unspecified" &&
    a.relationship !== b.relationship
  ) {
    return false;
  }
  return true;
}

function rebuildBundle(
  base: Phase3Bundle,
  accepted: Candidate[],
  input: FallbackInput
): Phase3Bundle {
  const items: Phase3BundleItem[] = [...base.items];
  const seen = new Set(items.map((i) => i.spanId));
  for (const c of accepted) {
    const spanId = candidateSpanId(c);
    if (seen.has(spanId)) continue;
    seen.add(spanId);
    items.push({
      spanId,
      ref: c.item.ref,
      quotedText: c.item.quotedText,
      structuralPath: c.item.structuralPath,
      charRange: c.item.charRange,
      scope: inferScopeForItem(c.item),
      source: "expansion",
      addedReason: "internal_reference",
    });
  }
  // Partitions kept as-is; new items will be scope-checked at read time by
  // Phase 5A's compatibility logic. Exclusions and dependencies carried over.
  return {
    ...base,
    items,
    partitions: base.partitions,
    exclusions: base.exclusions,
    dependencies: base.dependencies,
  };
}
