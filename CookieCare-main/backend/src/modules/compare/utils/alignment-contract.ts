/**
 * alignment-contract.ts
 *
 * Canonical alignment relationship model and the invariants that every
 * alignment producer (deterministic matcher, structural scorer, LLM verify)
 * and consumer (diff-detect, critique) must honour.
 *
 * Legacy AlignedPair.alignmentType / status remain the UI-facing projection.
 * relationshipType is the source of truth for confirmed vs uncertain.
 */

import type {
  AlignedPair,
  AlignmentMethod,
  AlignmentRelationship,
  AlignmentStatus,
  AlignmentType,
} from "../models/compare-state.js";

/** Score at/above which a structural pair is a confident MATCH without AI. */
export const CONFIDENT_MATCH_THRESHOLD = 0.72;

/** Score at/above which a pair is worth AI verification (ambiguous). */
export const AMBIGUOUS_MATCH_FLOOR = 0.40;

/** Title-token overlap below which a shared section number is a collision, not a match. */
export const NUMERIC_TITLE_GUARD = 0.20;

/** Content similarity below which a shared section number is a collision. */
export const NUMERIC_CONTENT_GUARD = 0.35;

/** AI MATCH below this confidence is treated as UNCERTAIN, not a claimed match. */
export const AI_MATCH_CONFIDENCE_FLOOR = 0.55;

/** Document length ratio below which leftover-A is treated as condensation, not deletion. */
export const CONDENSATION_RATIO = 0.45;

export interface AlignmentProjection {
  alignmentType: AlignmentType;
  status: AlignmentStatus;
}

export function isOrdinaryMatch(rel: AlignmentRelationship | undefined): boolean {
  return rel === "MATCH" || rel === "MOVED";
}

export function allowsDuplicateClause(rel: AlignmentRelationship | undefined): boolean {
  return rel === "SPLIT" || rel === "MERGED";
}

export function isUncertainRelationship(
  rel: AlignmentRelationship | undefined
): boolean {
  return rel === "UNCERTAIN";
}

export function isConfirmedAdded(pair: AlignedPair): boolean {
  return pair.relationshipType === "ADDED" && pair.clauseAId === null && pair.clauseBId !== null;
}

export function isConfirmedRemoved(pair: AlignedPair): boolean {
  return pair.relationshipType === "REMOVED" && pair.clauseBId === null && pair.clauseAId !== null;
}

/**
 * Project a canonical relationship onto the legacy UI fields.
 * UNCERTAIN maps to unmatched/restructured so it is visible in the alignment
 * pane without being treated as a confirmed add/remove.
 */
export function toLegacyAlignmentFields(
  rel: AlignmentRelationship,
  method: AlignmentMethod,
  confidence: number
): AlignmentProjection {
  switch (rel) {
    case "MATCH":
      return {
        alignmentType: method === "structural" && confidence >= 0.9 ? "exact" : "semantic",
        status: "matched",
      };
    case "MOVED":
    case "SPLIT":
    case "MERGED":
      return { alignmentType: "semantic", status: "restructured" };
    case "ADDED":
      return { alignmentType: "unmatched", status: "added" };
    case "REMOVED":
      return { alignmentType: "unmatched", status: "removed" };
    case "UNCERTAIN":
      return { alignmentType: "unmatched", status: "restructured" };
  }
}

export interface PairFactoryInput {
  clauseAId: string | null;
  clauseBId: string | null;
  relationshipType: AlignmentRelationship;
  matchConfidence: number;
  alignmentMethod: AlignmentMethod;
  alignmentReasons: string[];
}

export function makePairFactory(startSeq: number): () => string {
  let seq = startSeq;
  return () => {
    seq += 1;
    return `pair-${seq}`;
  };
}

export function buildAlignedPair(
  nextId: () => string,
  input: PairFactoryInput
): AlignedPair {
  const { alignmentType, status } = toLegacyAlignmentFields(
    input.relationshipType,
    input.alignmentMethod,
    input.matchConfidence
  );
  const reasons = input.alignmentReasons.filter((r) => r.trim().length > 0);
  return {
    id: nextId(),
    clauseAId: input.clauseAId,
    clauseBId: input.clauseBId,
    matchConfidence: Math.min(1, Math.max(0, input.matchConfidence)),
    alignmentType,
    alignmentReason: reasons.join("; ") || "Alignment produced by structural reasoning.",
    status,
    relationshipType: input.relationshipType,
    alignmentMethod: input.alignmentMethod,
    alignmentReasons: reasons,
  };
}

export interface DuplicateMappingViolation {
  side: "A" | "B";
  clauseId: string;
  pairIds: string[];
}

/**
 * Invariant #1: ordinary MATCH/MOVED mappings are 1:1.
 * SPLIT/MERGED may reuse a clause. UNCERTAIN/ADDED/REMOVED do not consume
 * the opposite side.
 */
export function findDuplicateOrdinaryMappings(
  pairs: AlignedPair[]
): DuplicateMappingViolation[] {
  const aToPairs = new Map<string, string[]>();
  const bToPairs = new Map<string, string[]>();

  for (const pair of pairs) {
    if (!isOrdinaryMatch(pair.relationshipType)) continue;
    if (pair.clauseAId) {
      const list = aToPairs.get(pair.clauseAId) ?? [];
      list.push(pair.id);
      aToPairs.set(pair.clauseAId, list);
    }
    if (pair.clauseBId) {
      const list = bToPairs.get(pair.clauseBId) ?? [];
      list.push(pair.id);
      bToPairs.set(pair.clauseBId, list);
    }
  }

  const violations: DuplicateMappingViolation[] = [];
  for (const [clauseId, pairIds] of aToPairs) {
    if (pairIds.length > 1) violations.push({ side: "A", clauseId, pairIds });
  }
  for (const [clauseId, pairIds] of bToPairs) {
    if (pairIds.length > 1) violations.push({ side: "B", clauseId, pairIds });
  }
  return violations;
}

/**
 * Resolve duplicate ordinary MATCH/MOVED by keeping the highest-confidence
 * pair and downgrading the rest to UNCERTAIN (never silently to ADDED/REMOVED).
 */
export function enforceOrdinaryMatchUniqueness(pairs: AlignedPair[]): AlignedPair[] {
  const violations = findDuplicateOrdinaryMappings(pairs);
  if (violations.length === 0) return pairs;

  const drop = new Set<string>();
  const byId = new Map(pairs.map((p) => [p.id, p]));

  for (const v of violations) {
    const ranked = v.pairIds
      .map((id) => byId.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.matchConfidence - a.matchConfidence);
    for (const extra of ranked.slice(1)) drop.add(extra.id);
  }

  return pairs.map((pair) => {
    if (!drop.has(pair.id)) return pair;
    const reasons = [
      ...(pair.alignmentReasons ?? []),
      "duplicate ordinary mapping rejected — kept higher-confidence pair",
    ];
    const { alignmentType, status } = toLegacyAlignmentFields(
      "UNCERTAIN",
      pair.alignmentMethod ?? "structural",
      0
    );
    return {
      ...pair,
      clauseAId: pair.clauseAId,
      clauseBId: pair.clauseBId,
      relationshipType: "UNCERTAIN" as const,
      alignmentType,
      status,
      matchConfidence: Math.min(pair.matchConfidence, 0.4),
      alignmentReason: reasons.join("; "),
      alignmentReasons: reasons,
    };
  });
}

export function claimedClauseIds(pairs: AlignedPair[]): {
  claimedA: Set<string>;
  claimedB: Set<string>;
} {
  const claimedA = new Set<string>();
  const claimedB = new Set<string>();
  for (const pair of pairs) {
    const rel = pair.relationshipType;
    if (!isOrdinaryMatch(rel) && !allowsDuplicateClause(rel)) continue;
    if (pair.clauseAId) claimedA.add(pair.clauseAId);
    if (pair.clauseBId) claimedB.add(pair.clauseBId);
  }
  return { claimedA, claimedB };
}
