import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import type { PropositionPolarity } from "../../models/proposition.js";
import type { ClauseIndex } from "./clause-index.js";
import { retrieveCandidates, type RetrievalTraceRow } from "./retrieve-candidates.js";

export interface RequirementEvidenceProfile {
  hypothesis?: string;
  evidenceHints?: string[];
  /**
   * ACT-Phase 3 — precise criteria for what counts as proving, contradicting,
   * or leaving this requirement unaddressed, authored the way you'd brief a
   * first-year associate. `evidenceHints` still governs candidate retrieval
   * (recall); `proofStandard` is what VERIFY checks a candidate against
   * (precision) — not yet wired into evaluate-package.ts's prompt (that's
   * ACT-Phase 5, when VERIFY replaces this mechanism).
   */
  proofStandard?: string;
  /** Explicit proposition channel supplied by PLAN. */
  polarity?: PropositionPolarity;
  /** Reviewing party or role supplied by PLAN. */
  partyPerspective?: string;
  /** Carried onto the resulting Finding for the compare lane (see Finding.compareGroup). */
  compareGroup?: string;
  compareRole?: string;
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "shall",
  "must",
  "under",
  "into",
  "such",
  "other",
  "their",
  "them",
  "than",
  "then",
  "when",
  "where",
  "which",
  "while",
  "also",
  "only",
  "each",
  "both",
  "over",
  "after",
  "before",
  "between",
  "personal",
  "data",
  "processing",
  "processor",
  "controller",
  "agreement",
  "contract",
  "clause",
  "requirement",
  "obligation",
]);

export function tokenizeForEvidence(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Generic hint list for one requirement: authored hints, hypothesis tokens,
 * and package extraction targets that overlap the requirement id.
 */
export function hintsForRequirement(
  requirementId: string,
  extractionTargets: string[],
  profile?: RequirementEvidenceProfile
): string[] {
  const authored = (profile?.evidenceHints ?? []).flatMap((hint) =>
    tokenizeForEvidence(hint).length > 0 ? [hint.toLowerCase(), ...tokenizeForEvidence(hint)] : []
  );
  const hypothesisTokens = tokenizeForEvidence(profile?.hypothesis ?? "");
  const idNorm = requirementId.toLowerCase().replace(/[._-]+/g, " ");
  const idTokens = tokenizeForEvidence(idNorm);
  const fromTargets = extractionTargets.filter((target) => {
    const targetNorm = target.toLowerCase().replace(/[._-]+/g, " ");
    if (idNorm.includes(targetNorm) || targetNorm.includes(idNorm)) return true;
    return tokenizeForEvidence(target).some((token) => idNorm.includes(token));
  });
  return unique([...authored, ...hypothesisTokens, ...fromTargets, ...idTokens]);
}

const GENERIC_HINT_TOKENS = new Set(["process", "terms", "under", "such", "including"]);
const MAX_REFS_PER_REQUIREMENT = 5;

function tokenMatchesHay(needle: string, hay: string, tokens: Set<string>): boolean {
  if (needle.includes(" ")) return hay.includes(needle);
  if (STOPWORDS.has(needle) || GENERIC_HINT_TOKENS.has(needle)) return false;
  if (tokens.has(needle)) return true;
  if (needle.length >= 6) {
    for (const token of tokens) {
      if (token.startsWith(needle) || (needle.startsWith(token) && token.length >= 6)) {
        return true;
      }
    }
  }
  return false;
}

export interface EvidenceScoreContext {
  requirementId?: string;
  extractionTargets?: string[];
}

export function scoreEvidenceItem(
  item: SharedEvidenceItem,
  hints: string[],
  context: EvidenceScoreContext = {}
): number {
  const hay = `${item.clauseType} ${item.quotedText} ${item.matchReason ?? ""}`.toLowerCase();
  const tokens = new Set(
    hay.split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
  );
  let score = 0;
  for (const hint of hints) {
    const needle = hint.toLowerCase().trim();
    if (needle.length < 4) continue;
    if (tokenMatchesHay(needle, hay, tokens)) {
      score += Math.min(needle.length, 16);
    }
  }

  const requirementId = context.requirementId ?? "";
  const typeNorm = item.clauseType.toLowerCase().replace(/[._-]+/g, " ");
  const idNorm = requirementId.toLowerCase().replace(/[._-]+/g, " ");
  if (idNorm && (idNorm.includes(typeNorm) || typeNorm.split(" ").some((part) => part.length >= 6 && idNorm.includes(part)))) {
    score += 48;
  }
  for (const hint of hints) {
    const needle = hint.toLowerCase().replace(/[._-]+/g, " ").trim();
    if (needle.length >= 6 && (typeNorm.includes(needle) || needle.includes(typeNorm))) {
      score += 24;
    }
  }
  for (const target of context.extractionTargets ?? []) {
    const targetNorm = target.toLowerCase().replace(/[._-]+/g, " ");
    if (!targetNorm) continue;
    if (
      idNorm &&
      !(
        idNorm.includes(targetNorm) ||
        targetNorm.includes(idNorm) ||
        tokenizeForEvidence(targetNorm).some((token) => idNorm.includes(token))
      )
    ) {
      continue;
    }
    if (typeNorm === targetNorm || typeNorm.includes(targetNorm) || targetNorm.includes(typeNorm)) {
      score += 36;
    }
  }

  return score;
}

export type EvidenceRole =
  | "supporting"
  | "contextual"
  | "contradicting"
  | "insufficient";

export interface EvidencePacket {
  requirementId: string;
  supporting: SharedEvidenceItem[];
  contradicting: SharedEvidenceItem[];
  contextual: SharedEvidenceItem[];
  insufficient: SharedEvidenceItem[];
}

const MAX_SUPPORTING = 3;
const MAX_CONTEXTUAL = 2;
const MAX_INSUFFICIENT = 2;

/**
 * Classify one pool item for a requirement into supporting / contextual /
 * contradicting / insufficient. Score-only — no topic-specific branches.
 * Recall comes from the hybrid retriever (R2); this classifier is only used
 * by the grouped-LLM path (`resolveEvidence` / `packetsByRequirement`).
 */
export function classifyEvidenceRole(
  item: SharedEvidenceItem,
  requirementId: string,
  hints: string[],
  context: EvidenceScoreContext = {}
): EvidenceRole {
  const score = scoreEvidenceItem(item, hints, {
    ...context,
    requirementId,
  });

  if (score <= 0) return "insufficient";
  return "supporting";
}

/**
 * Build a per-requirement EvidencePacket from the package candidate pool.
 */
export function resolveEvidence(
  requirementId: string,
  candidatePool: SharedEvidenceItem[],
  extractionTargets: string[] = [],
  profile?: RequirementEvidenceProfile
): EvidencePacket {
  const hints = hintsForRequirement(requirementId, extractionTargets, profile);
  const context: EvidenceScoreContext = { requirementId, extractionTargets };
  const supporting: SharedEvidenceItem[] = [];
  const contextual: SharedEvidenceItem[] = [];
  const contradicting: SharedEvidenceItem[] = [];
  const insufficient: SharedEvidenceItem[] = [];

  const ranked = [...candidatePool].sort(
    (a, b) =>
      scoreEvidenceItem(b, hints, context) - scoreEvidenceItem(a, hints, context)
  );

  for (const item of ranked) {
    const role = classifyEvidenceRole(item, requirementId, hints, context);
    if (role === "supporting" && supporting.length < MAX_SUPPORTING) {
      supporting.push(item);
    } else if (role === "contextual" && contextual.length < MAX_CONTEXTUAL) {
      contextual.push(item);
    } else if (role === "contradicting" && contradicting.length < MAX_CONTEXTUAL) {
      contradicting.push(item);
    } else if (role === "insufficient" && insufficient.length < MAX_INSUFFICIENT) {
      // Only keep insufficient when it scored somehow (noise we want to demote
      // explicitly) or when we have nothing else yet.
      const score = scoreEvidenceItem(item, hints, context);
      if (score > 0 || (supporting.length === 0 && contextual.length === 0)) {
        insufficient.push(item);
      }
    }
  }

  if (supporting.length === 0) {
    for (const item of ranked) {
      if (supporting.length >= MAX_SUPPORTING) break;
      if (scoreEvidenceItem(item, hints, context) <= 0) continue;
      if (
        supporting.includes(item) ||
        contextual.includes(item) ||
        insufficient.includes(item)
      ) {
        continue;
      }
      supporting.push(item);
    }
  }

  return {
    requirementId,
    supporting,
    contradicting,
    contextual,
    insufficient,
  };
}

/** Refs the evaluator may cite: supporting ∪ contextual only. */
export function citeableRefsFromPacket(packet: EvidencePacket): string[] {
  return unique([
    ...packet.supporting.map((i) => i.ref),
    ...packet.contextual.map((i) => i.ref),
  ]).slice(0, MAX_REFS_PER_REQUIREMENT);
}

/**
 * Assign a candidate subset of package evidence to each requirement.
 * An extract may be a candidate for more than one requirement when it
 * scores on both hypotheses.
 */
export function candidateRefsByRequirement(
  requirementIds: string[],
  items: SharedEvidenceItem[],
  extractionTargets: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined> = {}
): Record<string, string[]> {
  const assigned: Record<string, string[]> = {};
  for (const requirementId of requirementIds) {
    const packet = resolveEvidence(
      requirementId,
      items,
      extractionTargets,
      profiles[requirementId]
    );
    assigned[requirementId] = citeableRefsFromPacket(packet);
  }
  return assigned;
}

export function packetsByRequirement(
  requirementIds: string[],
  items: SharedEvidenceItem[],
  extractionTargets: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined> = {}
): Record<string, EvidencePacket> {
  const out: Record<string, EvidencePacket> = {};
  for (const requirementId of requirementIds) {
    out[requirementId] = resolveEvidence(
      requirementId,
      items,
      extractionTargets,
      profiles[requirementId]
    );
  }
  return out;
}

/**
 * Drop cites that are unknown or that fail a keyword overlap with the
 * requirement's hints. A cite that scores on this hypothesis is kept even if
 * a sibling requirement also scored higher on the same extract.
 */
export function validateEvidenceRefs(
  refs: string[],
  items: SharedEvidenceItem[],
  _candidates: string[] | undefined,
  hints: string[],
  context: EvidenceScoreContext = {}
): string[] {
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const out: string[] = [];
  for (const ref of refs) {
    const item = byRef.get(ref);
    if (!item) continue;
    const score = hints.length > 0 ? scoreEvidenceItem(item, hints, context) : 1;
    if (score <= 0) continue;
    out.push(ref);
  }
  return out;
}

/**
 * Prefer the model's cites when they overlap this requirement. If isolation
 * emptied the cite list, recover this requirement's candidate packet, then any
 * remaining pool extracts that still score on the hypothesis.
 */
export function resolveEvidenceRefsForRequirement(
  cited: string[],
  items: SharedEvidenceItem[],
  candidates: string[] | undefined,
  hints: string[],
  context: EvidenceScoreContext = {}
): string[] {
  const validated = unique(
    validateEvidenceRefs(cited, items, candidates, hints, context)
  );
  if (validated.length > 0) return validated;
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const fromCandidates = unique(candidates ?? [])
    .map((ref) => byRef.get(ref))
    .filter((item): item is SharedEvidenceItem => Boolean(item))
    .filter((item) => scoreEvidenceItem(item, hints, context) > 0)
    .sort(
      (a, b) =>
        scoreEvidenceItem(b, hints, context) - scoreEvidenceItem(a, hints, context)
    )
    .slice(0, MAX_REFS_PER_REQUIREMENT)
    .map((item) => item.ref);
  if (fromCandidates.length > 0) return fromCandidates;
  return items
    .filter((item) => scoreEvidenceItem(item, hints, context) > 0)
    .sort(
      (a, b) =>
        scoreEvidenceItem(b, hints, context) - scoreEvidenceItem(a, hints, context)
    )
    .slice(0, MAX_REFS_PER_REQUIREMENT)
    .map((item) => item.ref);
}

const DEFAULT_RECALL_CAP = 10;

function semanticRetrievalEnabled(): boolean {
  return process.env.ANALYSIS_SEMANTIC_RETRIEVAL === "1";
}

/**
 * Recall-oriented candidate generation: rank the pool and return the top N.
 * When ANALYSIS_SEMANTIC_RETRIEVAL=1 and a clause index is provided, uses
 * hybrid dense+lexical retrieval (RRF fusion). Otherwise pure lexical.
 * Isolation's only job is "don't miss the right passage" — VERIFY is the
 * precision gate.
 */
export async function resolveRecallCandidates(
  requirementId: string,
  candidatePool: SharedEvidenceItem[],
  extractionTargets: string[] = [],
  profile?: RequirementEvidenceProfile,
  cap: number = DEFAULT_RECALL_CAP,
  options?: {
    index?: ClauseIndex;
    queryText?: string;
    trace?: (rows: RetrievalTraceRow[]) => void;
  }
): Promise<SharedEvidenceItem[]> {
  const hints = hintsForRequirement(requirementId, extractionTargets, profile);
  const context: EvidenceScoreContext = { requirementId, extractionTargets };

  if (semanticRetrievalEnabled() && options?.index && options?.queryText) {
    return retrieveCandidates({
      queryText: options.queryText,
      pool: candidatePool,
      index: options.index,
      lexicalScore: (item) => scoreEvidenceItem(item, hints, context),
      cap,
      trace: options.trace,
    });
  }

  return [...candidatePool]
    .filter((item) => item.quotedText.trim().length > 0)
    .sort(
      (a, b) => scoreEvidenceItem(b, hints, context) - scoreEvidenceItem(a, hints, context)
    )
    .slice(0, cap);
}

export function coverageShouldBePreserved(result: {
  compliance?: string;
  status?: string;
}): boolean {
  const compliance = result.compliance;
  const status = result.status;
  if (
    compliance === "present" ||
    compliance === "partial" ||
    compliance === "not_applicable"
  ) {
    return true;
  }
  if (
    status === "strong" ||
    status === "adequate" ||
    status === "covered" ||
    status === "conditional" ||
    status === "partial"
  ) {
    return true;
  }
  return false;
}
