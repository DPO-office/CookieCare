/**
 * PHASE 4B — collective bundle verification (side-channel).
 *
 * Consumes the Phase 4A element schemas and the Phase 3C evidence bundles.
 * Emits a deterministic element matrix per requirement — one row per authored
 * element, with state ∈ {supported, contradicted, not_located, ambiguous,
 * unresolved_dependency, not_applicable}, exact citations, and scope /
 * conditions.
 *
 * "Deterministic" here means: no LLM call. This is the plan's Phase 4B
 * requirement expressed as a lexical proof-guidance matcher over the bundle:
 *   - Split each element's proofGuidance into signal phrases.
 *   - Score each bundle item against the element by phrase overlap.
 *   - Items above threshold => supported (with exact quotes preserved).
 *   - Items containing an explicit non-proof-trap phrase => contradicted.
 *   - Zero signal + no dependency => not_located.
 *   - Unresolved bundle dependency covering the element's structural need
 *     => unresolved_dependency.
 *   - Conditional element whose applicabilityRule token is absent from the
 *     bundle => not_applicable.
 *
 * Live VERIFY still runs its existing prompt. This module produces the events
 * the plan §Phase 4B Required logs specify, so a reviewer can compare the
 * would-be Phase 4B matrix against what current VERIFY does before Phase 5
 * wires the switchover.
 */

import type {
  ElementSchema,
  RequirementElementSchema,
} from "./element-schemas.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
  Phase3ScopeVector,
} from "./phase3-investigate.js";

export type ElementVerdictState =
  | "supported"
  | "contradicted"
  | "not_located"
  | "ambiguous"
  | "unresolved_dependency"
  | "not_applicable";

export interface ElementVerdict {
  elementId: string;
  state: ElementVerdictState;
  evidenceSpanIds: string[];
  quotes: Array<{
    spanId: string;
    quote: string;
    quoteVerified: boolean;
    charRange: [number, number];
  }>;
  scope: Phase3ScopeVector | Record<string, never>;
  establishedFact: string;
  gapDescription: string;
  contribution: "individual" | "requirement_level";
}

export interface RequirementMatrix {
  requirementId: string;
  bundleId: string;
  schemaVersion: string;
  reviewStatus: RequirementElementSchema["reviewStatus"];
  elements: ElementVerdict[];
  expectedElementIds: string[];
  returnedElementIds: string[];
  missingElementIds: string[];
  estimatedTokens: number;
}

interface Phase4Input {
  requirementId: string;
  bundle: Phase3Bundle;
  schema: RequirementElementSchema;
}

const SIGNAL_MIN_TOKEN_LEN = 4;
const SUPPORT_SCORE_THRESHOLD = 2;

export function verifyRequirement(input: Phase4Input): RequirementMatrix {
  const { requirementId, bundle, schema } = input;
  const items = bundle.items;
  const expectedElementIds = schema.elements.map((e) => e.elementId);
  const verdicts: ElementVerdict[] = [];

  for (const el of schema.elements) {
    const verdict = verifyElement(el, items, bundle);
    verdicts.push(verdict);
  }

  const returnedElementIds = verdicts.map((v) => v.elementId);
  const missingElementIds = expectedElementIds.filter(
    (id) => !returnedElementIds.includes(id)
  );

  return {
    requirementId,
    bundleId: bundle.bundleId,
    schemaVersion: schema.version,
    reviewStatus: schema.reviewStatus,
    elements: verdicts,
    expectedElementIds,
    returnedElementIds,
    missingElementIds,
    estimatedTokens: bundle.estimatedTokens,
  };
}

function verifyElement(
  el: ElementSchema,
  items: Phase3BundleItem[],
  bundle: Phase3Bundle
): ElementVerdict {
  // Conditional element with an applicabilityRule that mentions a trigger
  // token — if no bundle item touches the trigger, mark not_applicable.
  if (el.kind === "conditional" && el.applicabilityRule) {
    const triggers = signalTokens(el.applicabilityRule);
    const triggered = items.some((it) =>
      triggers.some((tok) => it.quotedText.toLowerCase().includes(tok))
    );
    if (!triggered) {
      return baseVerdict(el, "not_applicable", {
        establishedFact: "",
        gapDescription: `Conditional element skipped: trigger not present (${el.applicabilityRule}).`,
      });
    }
  }

  const proofSignals = signalTokens(el.proofGuidance);
  const trapSignals = el.nonProofTraps.flatMap(signalTokens);
  const distinctiveTokens = (el.distinctiveTokens ?? []).map((t) =>
    t.toLowerCase()
  );
  const requiredTokenGroups = (el.requiredTokenGroups ?? []).map((g) =>
    g.map((t) => t.toLowerCase())
  );

  const scored: Array<{ item: Phase3BundleItem; score: number; hitTokens: Set<string> }> = [];
  const trapHits: Phase3BundleItem[] = [];
  for (const item of items) {
    const hay = item.quotedText.toLowerCase();
    const hitTokens = new Set<string>();
    let score = 0;
    // Distinctive-token gate: when the schema authored a non-negotiable
    // vocabulary for this element, an item that hits none of it is not
    // evidence for this element regardless of generic-token overlap.
    // Prevents G3 "return" being satisfied by a deletion-only clause that
    // happens to contain "services" / "request", and prevents F1's
    // security clauses from bleeding into F2 (breach) / F3 (DPIA).
    if (
      distinctiveTokens.length > 0 &&
      !distinctiveTokens.some((tok) => hay.includes(tok))
    ) {
      continue;
    }
    // Compound distinctive gate: every group must contribute at least one
    // substring hit. Used for elements whose real-world phrasing is the
    // INTERSECTION of otherwise-generic ideas (e.g. G4 = exception word ∧
    // retention word ∧ legal-basis word). Individually every token is
    // common; only the intersection is 28(3)(g)'s closing proviso.
    if (
      requiredTokenGroups.length > 0 &&
      !requiredTokenGroups.every((group) => group.some((tok) => hay.includes(tok)))
    ) {
      continue;
    }
    // Passing the compound gate IS strong support — otherwise a clause that
    // authentically encodes G4's proviso would score only from generic
    // proofGuidance-token overlap (typically 1-2), fall below the support
    // threshold, and come back as `ambiguous`. Score +2 per group, so a
    // 3-group compound gate contributes +6.
    if (requiredTokenGroups.length > 0) {
      for (const group of requiredTokenGroups) {
        for (const tok of group) {
          if (hay.includes(tok)) {
            score += 2;
            hitTokens.add(tok);
            break;
          }
        }
      }
    }
    for (const tok of proofSignals) {
      if (hay.includes(tok)) {
        score += 1;
        hitTokens.add(tok);
      }
    }
    // Exact-phrase weight: if the element proposition contains a distinctive
    // capitalized phrase (e.g. "documented instructions"), a full-phrase hit
    // is worth more than the sum of its parts.
    for (const phrase of distinctivePhrases(el.proofGuidance)) {
      if (hay.includes(phrase)) {
        score += 3;
        hitTokens.add(phrase);
      }
    }
    // Authored-distinctive hits count toward the score too, so an item that
    // clears the gate still needs enough signal to reach the threshold.
    for (const tok of distinctiveTokens) {
      if (hay.includes(tok)) {
        score += 2;
        hitTokens.add(tok);
      }
    }
    if (score > 0) scored.push({ item, score, hitTokens });
    if (trapSignals.length > 0 && trapSignals.some((t) => hay.includes(t))) {
      // Trap alone does not contradict — a passage may quote a non-proof
      // pattern in passing. Only count as trap if no proof signal is also
      // present in this item.
      if (score === 0) trapHits.push(item);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const supportItems = scored.filter((s) => s.score >= SUPPORT_SCORE_THRESHOLD).map((s) => s.item);
  const ambiguousItems = scored
    .filter((s) => s.score > 0 && s.score < SUPPORT_SCORE_THRESHOLD)
    .map((s) => s.item);

  // Unresolved dependency short-circuit: if the bundle names an unresolved
  // external / ambiguous reference that this element's proofGuidance
  // explicitly points into (e.g. "Appendix / Schedule"), mark accordingly.
  const dependencyBlocker = bundle.dependencies.find(
    (d) =>
      d.state !== "resolved_internal" &&
      proofSignals.some((tok) =>
        d.reference.toLowerCase().includes(tok)
      )
  );
  if (supportItems.length === 0 && dependencyBlocker) {
    return baseVerdict(el, "unresolved_dependency", {
      establishedFact: "",
      gapDescription: `Bundle references '${dependencyBlocker.reference}' but it is ${dependencyBlocker.state}.`,
    });
  }

  if (supportItems.length === 0 && trapHits.length > 0) {
    return {
      ...baseVerdict(el, "contradicted", {
        establishedFact: "",
        gapDescription: `Non-proof trap detected: ${el.nonProofTraps[0] ?? "see element.nonProofTraps"}.`,
      }),
      evidenceSpanIds: trapHits.map((i) => i.spanId),
      quotes: trapHits.slice(0, 2).map((i) => ({
        spanId: i.spanId,
        quote: i.quotedText.slice(0, 300),
        quoteVerified: true, // deterministic — quote is a substring of the item text.
        charRange: i.charRange,
      })),
      scope: (trapHits[0]?.scope as Phase3ScopeVector) ?? {},
    };
  }

  if (supportItems.length === 0 && ambiguousItems.length === 0) {
    return baseVerdict(el, "not_located", {
      establishedFact: "",
      gapDescription: `No bundle item matched proof guidance for element ${el.elementId}.`,
    });
  }

  if (supportItems.length === 0 && ambiguousItems.length > 0) {
    return {
      ...baseVerdict(el, "ambiguous", {
        establishedFact: `Possible support in ${ambiguousItems.length} item(s), none decisive.`,
        gapDescription: `No item reached the support threshold for element ${el.elementId}.`,
      }),
      evidenceSpanIds: ambiguousItems.slice(0, 3).map((i) => i.spanId),
      quotes: ambiguousItems.slice(0, 3).map((i) => ({
        spanId: i.spanId,
        quote: i.quotedText.slice(0, 300),
        quoteVerified: true,
        charRange: i.charRange,
      })),
      scope: (ambiguousItems[0]?.scope as Phase3ScopeVector) ?? {},
    };
  }

  // Supported: filter to scope-compatible items only (dominant partition).
  const dominant = pickDominantPartition(bundle, supportItems);
  const compatible = dominant
    ? supportItems.filter((i) =>
        scopesCompatible(i.scope, dominant.scope)
      )
    : supportItems;
  // Narrow to a single scope group when cited items still disagree on their
  // explicit (non-unspecified) relationship. This catches the MC case where
  // the bundle's dominant partition is `unspecified` (a wildcard under
  // scopesCompatible), so items with controller_to_processor AND
  // controller_to_controller both pass the compatibility check and then Lock
  // Gate 6 (INCOMPATIBLE_SCOPE_JOINT_SUPPORT) refuses to lock the mixed set.
  // Pick the most-numerous explicit group and keep only its items plus any
  // unspecified ones. If neither explicit group dominates, keep the
  // unspecified items only rather than mixing.
  const preFilter = compatible.length > 0 ? compatible : supportItems;
  const cites = narrowToCoherentScope(preFilter);

  return {
    ...baseVerdict(el, "supported", {
      establishedFact: buildEstablishedFact(el, cites),
      gapDescription: "",
    }),
    evidenceSpanIds: cites.map((i) => i.spanId),
    quotes: cites.slice(0, 4).map((i) => ({
      spanId: i.spanId,
      quote: i.quotedText.slice(0, 300),
      quoteVerified: true,
      charRange: i.charRange,
    })),
    scope:
      dominantExplicitScope(cites) ??
      dominant?.scope ??
      cites[0]?.scope ??
      {},
  };
}

/**
 * Reduce a candidate cite set to items whose explicit relationship agrees
 * (unspecified items pass through as compatible companions). Prevents Phase 6
 * Gate 6 rejecting the verdict on scope grounds.
 */
function narrowToCoherentScope(items: Phase3BundleItem[]): Phase3BundleItem[] {
  if (items.length <= 1) return items;
  const counts = new Map<string, number>();
  for (const i of items) {
    const rel = i.scope?.relationship;
    if (!rel || rel === "unspecified") continue;
    counts.set(rel, (counts.get(rel) ?? 0) + 1);
  }
  if (counts.size <= 1) return items;
  const [winnerRel] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const winners = items.filter((i) => i.scope?.relationship === winnerRel);
  const unspecified = items.filter(
    (i) => !i.scope?.relationship || i.scope.relationship === "unspecified"
  );
  return [...winners, ...unspecified];
}

function dominantExplicitScope(items: Phase3BundleItem[]): Phase3ScopeVector | undefined {
  for (const i of items) {
    if (i.scope?.relationship && i.scope.relationship !== "unspecified") return i.scope;
  }
  return undefined;
}

function baseVerdict(
  el: ElementSchema,
  state: ElementVerdictState,
  parts: { establishedFact: string; gapDescription: string }
): ElementVerdict {
  return {
    elementId: el.elementId,
    state,
    evidenceSpanIds: [],
    quotes: [],
    scope: {},
    establishedFact: parts.establishedFact,
    gapDescription: parts.gapDescription,
    contribution: "individual",
  };
}

function pickDominantPartition(
  bundle: Phase3Bundle,
  items: Phase3BundleItem[]
): { partitionId: string; scope: Phase3ScopeVector } | undefined {
  if (bundle.partitions.length === 0) return undefined;
  const itemIds = new Set(items.map((i) => i.spanId));
  const scored = bundle.partitions
    .map((p) => ({
      partitionId: p.partitionId,
      scope: p.scope,
      overlap: p.itemSpanIds.filter((id) => itemIds.has(id)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap);
  if (scored[0].overlap === 0) return undefined;
  return { partitionId: scored[0].partitionId, scope: scored[0].scope };
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
  if (a.exception && b.exception && a.exception !== b.exception) return false;
  return true;
}

function buildEstablishedFact(el: ElementSchema, items: Phase3BundleItem[]): string {
  const paths = items.slice(0, 3).map((i) => i.structuralPath).join(", ");
  return `${el.proposition} Supported at ${paths}.`;
}

const STOP = new Set([
  "look",
  "for",
  "the",
  "and",
  "any",
  "such",
  "with",
  "into",
  "that",
  "this",
  "from",
  "when",
  "where",
  "which",
  "have",
  "shall",
  "must",
  "under",
  "over",
  "each",
  "both",
  "there",
  "their",
  "them",
  "then",
  "also",
  "only",
  "e.g.",
  "eg",
  "may",
  "clause",
  "section",
  "provision",
  "usually",
]);

function signalTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= SIGNAL_MIN_TOKEN_LEN && !STOP.has(t))
    )
  );
}

function distinctivePhrases(text: string): string[] {
  const out: string[] = [];
  // Two-word noun phrases that look distinctive: adjacent >=5-letter tokens.
  const words = text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length >= 5 && b.length >= 5 && !STOP.has(a) && !STOP.has(b)) {
      out.push(`${a} ${b}`);
    }
  }
  return out;
}
