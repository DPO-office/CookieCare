/**
 * PHASE 3 — batched multi-query retrieval + deterministic structural expansion
 * + evidence bundle with scope partitions.
 *
 * SIDE-CHANNEL ONLY. Per the plan (§Phase 3A Stop gate): "Verification
 * behaviour must remain unchanged until Phase 4." Nothing here is consumed by
 * evaluate_package / verify / aggregate / render. This module produces the
 * candidate unions and bundles a reviewer will approve before Phase 4 wires
 * them in.
 *
 * Query mix per requirement (§Phase 3A Implementation):
 *   1. requirement-level query      (proof standard / hypothesis)
 *   2. element-specific queries     (one per authored element, or the proof-
 *                                    standard sentences when no elements are
 *                                    authored yet — Phase 4A will formalise)
 *   3. exact lexical anchors        (>=3-word quoted phrases in the standard)
 *   4. clause-type anchors          (package clauseTypes / extractionTargets)
 *   5. definition targets           (defined-term uses relevant to the req)
 *   6. cross-reference targets      (spans that reference this req's article)
 *
 * Retrieval fuses lexical hits over the document's section candidates and
 * records which arm contributed each hit.
 */

import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  SharedEvidenceItem,
  EvidenceRelationshipScope,
} from "../../models/evidence-package.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import type { StructuralNode } from "../../segmentation/structural-nodes.js";
import type {
  DefinitionIndexEntry,
  ReferenceRecord,
} from "../../segmentation/reference-index.js";
import type { RequirementEvidenceProfile } from "./isolate-requirement-evidence.js";
import { tokenizeForEvidence } from "./isolate-requirement-evidence.js";
import { buildSectionCandidates, inferEvidenceRelationshipScope } from "./select-candidates.js";
import { articleNumberFromRequirementId } from "../../shared/article-linkage.js";

export interface Phase3Query {
  queryId: string;
  requirementId: string;
  kind:
    | "requirement"
    | "element"
    | "exact_anchor"
    | "clause_type"
    | "definition"
    | "cross_reference";
  text: string;
  elementIds?: string[];
  anchor?: string;
}

export interface Phase3Hit {
  queryId: string;
  spanId: string;
  ref: string;
  denseRank: number | null;
  lexicalRank: number | null;
  selectedBy: string[];
  score: number;
}

export interface Phase3RecallSummary {
  requirementId: string;
  uniqueCandidateCount: number;
  elementsWithCandidates: string[];
  elementsWithoutCandidates: string[];
  totalQueries: number;
}

export type ExpansionReason =
  | "internal_reference"
  | "definition"
  | "child"
  | "parent"
  | "sibling"
  | "heading";

export interface Phase3Expansion {
  requirementId: string;
  seedSpanId: string;
  addedSpanId: string;
  reason: ExpansionReason;
}

export interface Phase3ExpansionLimit {
  requirementId: string;
  limitType: "token" | "node" | "depth";
  omittedSpanIds: string[];
}

export interface Phase3ScopeVector {
  party?: string;
  relationship?: EvidenceRelationshipScope;
  jurisdiction?: string;
  timePeriod?: string;
  condition?: string;
  exception?: "main_rule" | "exception";
  documentId?: string;
  structuralPath?: string;
}

export interface Phase3BundleItem {
  spanId: string;
  ref: string;
  quotedText: string;
  structuralPath: string;
  charRange: [number, number];
  scope: Phase3ScopeVector;
  source: "seed" | "expansion";
  addedReason?: ExpansionReason;
}

export interface Phase3BundlePartition {
  partitionId: string;
  scope: Phase3ScopeVector;
  itemSpanIds: string[];
}

export interface Phase3Exclusion {
  spanId: string;
  reason: "incompatible_scope" | "duplicate" | "budget";
  detail?: string;
}

export interface Phase3BundleDependency {
  reference: string;
  state: "resolved_internal" | "unresolved_external" | "ambiguous";
  targetSpanIds: string[];
}

export interface Phase3Bundle {
  bundleId: string;
  requirementId: string;
  items: Phase3BundleItem[];
  partitions: Phase3BundlePartition[];
  exclusions: Phase3Exclusion[];
  dependencies: Phase3BundleDependency[];
  estimatedTokens: number;
}

export interface Phase3PerRequirementResult {
  requirementId: string;
  packageId: string;
  queries: Phase3Query[];
  hits: Phase3Hit[];
  recall: Phase3RecallSummary;
  expansions: Phase3Expansion[];
  expansionLimits: Phase3ExpansionLimit[];
  bundle: Phase3Bundle;
}

export interface Phase3Input {
  packageId: string;
  docId: string;
  requirementId: string;
  profile?: RequirementEvidenceProfile;
  clauseTypes: string[];
  extractionTargets: string[];
}

const MAX_QUERIES_PER_REQ = 20;
const MAX_HITS_PER_QUERY = 10;
const MAX_EXPANSION_NODES = 20;
const MAX_BUNDLE_TOKENS = 6000; // approx chars/4

/**
 * Compute the Phase 3 side-channel for a batch of requirements over one
 * primary document. Structural nodes and reference records come from the
 * Phase 1B/1C caches (already emitted).
 */
export function computePhase3Investigate(args: {
  state: AnalysisState;
  requirements: Phase3Input[];
  structuralNodesByDoc: Map<string, StructuralNode[]>;
  references: ReferenceRecord[];
  definitions?: DefinitionIndexEntry[];
}): Phase3PerRequirementResult[] {
  const { state, requirements, structuralNodesByDoc, references } = args;
  const definitions = args.definitions ?? [];
  const out: Phase3PerRequirementResult[] = [];

  const docCache = new Map<string, { sections: SharedEvidenceItem[]; doc: SegmentedDocument | undefined }>();
  const getDocContext = (docId: string) => {
    if (!docCache.has(docId)) {
      const doc = state.workspace.documents.find((d) => d.docId === docId);
      const sections = doc ? buildSectionCandidates(doc) : [];
      docCache.set(docId, { doc, sections });
    }
    return docCache.get(docId)!;
  };

  const refsBySource = groupBy(references, (r) => r.sourceSpanId);

  for (const req of requirements) {
    const { sections, doc } = getDocContext(req.docId);
    const nodes = structuralNodesByDoc.get(req.docId) ?? [];
    const nodesBySpanId = new Map(nodes.map((n) => [n.spanId, n] as const));
    const nodesByOffset = nodes
      .filter((n) => n.kind !== "document")
      .sort((a, b) => a.sourceOffsets[0] - b.sourceOffsets[0]);

    const queries = buildQueries(req, references, definitions);
    const boundedQueries = capQueriesRoundRobin(queries, MAX_QUERIES_PER_REQ);
    const hits = runQueries(boundedQueries, sections);

    const uniqueSectionRefs = new Set(hits.map((h) => h.ref));
    const perElementHits = new Map<string, Phase3Hit[]>();
    for (const q of boundedQueries) {
      if (q.kind !== "element" || !q.elementIds?.length) continue;
      for (const eid of q.elementIds) {
        const list = perElementHits.get(eid) ?? [];
        list.push(...hits.filter((h) => h.queryId === q.queryId));
        perElementHits.set(eid, list);
      }
    }
    const elementsWithCandidates: string[] = [];
    const elementsWithoutCandidates: string[] = [];
    for (const q of boundedQueries) {
      if (q.kind !== "element" || !q.elementIds?.length) continue;
      for (const eid of q.elementIds) {
        const list = perElementHits.get(eid) ?? [];
        if (list.length > 0) elementsWithCandidates.push(eid);
        else elementsWithoutCandidates.push(eid);
      }
    }

    const recall: Phase3RecallSummary = {
      requirementId: req.requirementId,
      uniqueCandidateCount: uniqueSectionRefs.size,
      elementsWithCandidates: [...new Set(elementsWithCandidates)],
      elementsWithoutCandidates: [...new Set(elementsWithoutCandidates)],
      totalQueries: boundedQueries.length,
    };

    const seedSpans = seedsFromHits(hits, sections, nodesByOffset);
    const { expansions, expansionLimits, expandedSpans } = expandStructurally(
      req.requirementId,
      seedSpans,
      nodesBySpanId,
      refsBySource
    );

    const bundle = buildBundle({
      requirementId: req.requirementId,
      packageId: req.packageId,
      docId: req.docId,
      doc,
      seedSpans,
      expandedSpans,
      nodesBySpanId,
      references,
    });

    out.push({
      requirementId: req.requirementId,
      packageId: req.packageId,
      queries: boundedQueries,
      hits,
      recall,
      expansions,
      expansionLimits,
      bundle,
    });
  }
  return out;
}

function buildQueries(
  req: Phase3Input,
  references: ReferenceRecord[],
  definitions: DefinitionIndexEntry[]
): Phase3Query[] {
  const queries: Phase3Query[] = [];
  const rid = req.requirementId;
  const push = (q: Omit<Phase3Query, "queryId" | "requirementId"> & { queryId?: string }) => {
    const queryId = q.queryId ?? `Q${queries.length + 1}`;
    queries.push({ queryId, requirementId: rid, ...q });
  };

  const proof = req.profile?.proofStandard?.trim() ?? "";
  const hypothesis = req.profile?.hypothesis?.trim() ?? "";
  const proofAndHyp = `${proof} ${hypothesis}`.trim();
  const ridTokens = ridTopicTokens(rid);

  // 1. Requirement-level.
  const reqText = proof || hypothesis || rid.replace(/[._]/g, " ");
  push({ kind: "requirement", text: reqText });

  // 2. Element-specific queries — split proof standard into sentences as a
  // stand-in until Phase 4A authors element schemas.
  const sentences = splitSentences(proof || hypothesis);
  sentences.slice(0, 4).forEach((s, idx) => {
    if (!s.trim()) return;
    push({
      kind: "element",
      text: s,
      elementIds: [`E${idx + 1}`],
    });
  });

  // 3. Exact lexical anchors — quoted phrases first, then salient multi-word
  // noun phrases derived from the requirement id / proof standard. Real
  // authored proof standards rarely quote statutory text verbatim, so relying
  // only on `"..."` quotes produced zero anchors on both Bitrix and
  // Mastercard runs. The id's own topic phrase (e.g. `subject_matter_and_duration`
  // → "subject matter and duration") is a reliable statutory anchor.
  const anchors = new Set<string>();
  for (const q of extractQuotedPhrases(proofAndHyp)) anchors.add(q);
  const ridPhrase = ridTokens.join(" ");
  if (ridPhrase.split(/\s+/).length >= 2) anchors.add(ridPhrase);
  for (const np of extractCapitalizedNounPhrases(proofAndHyp)) anchors.add(np);
  for (const anchor of [...anchors].slice(0, 4)) {
    push({ kind: "exact_anchor", text: anchor, anchor });
  }

  // 4. Clause-type anchors. Fall back to the requirement id's topic tokens
  // when the package's authored `clauseTypes` are empty (which is common —
  // most packages leave clauseTypes to be inferred).
  const clauseTypeSeeds = new Set<string>();
  for (const ct of req.clauseTypes) clauseTypeSeeds.add(ct);
  for (const t of ridTokens) if (t.length >= 4) clauseTypeSeeds.add(t);
  for (const ct of [...clauseTypeSeeds].slice(0, 4)) {
    push({
      kind: "clause_type",
      text: ct.replace(/[_-]/g, " "),
      anchor: ct.toLowerCase(),
    });
  }

  // 5. Definition targets — use the actual definition index (Phase 1C),
  // matching any defined term whose name intersects the requirement id
  // tokens or appears verbatim in the proof standard. `evidenceHints` is
  // still checked as a supplementary source.
  const defTargets = new Set<string>();
  for (const d of definitions) {
    const termLower = d.term.toLowerCase();
    const termTokens = termLower.split(/\s+/);
    const intersects = termTokens.some((tok) => ridTokens.includes(tok));
    if (intersects || proofAndHyp.toLowerCase().includes(termLower)) {
      defTargets.add(d.term);
    }
  }
  for (const hint of req.profile?.evidenceHints ?? []) {
    if (/^[A-Z][a-zA-Z ]+$/.test(hint) && hint.length < 30) defTargets.add(hint);
  }
  for (const term of [...defTargets].slice(0, 3)) {
    push({ kind: "definition", text: term, anchor: term });
  }

  // 6. Cross-reference targets — any reference whose target article matches
  // this requirement's article number.
  const reqArticle = articleNumberFromRequirementId(rid);
  if (reqArticle) {
    const xrefs = references.filter(
      (r) =>
        r.referenceKind === "article" &&
        /(\d+)/.test(r.referenceText) &&
        Number(RegExp.$1) === reqArticle
    );
    for (const xref of xrefs.slice(0, 3)) {
      push({ kind: "cross_reference", text: xref.referenceText });
    }
  }
  return queries;
}

function ridTopicTokens(rid: string): string[] {
  const STOP = new Set([
    "gdpr",
    "ukgdpr",
    "ccpa",
    "cpra",
    "hipaa",
    "article",
    "articles",
    "art",
    "para",
    "paragraph",
    "section",
    "req",
    "requirement",
    "the",
    "and",
    "of",
    "a",
    "an",
    "to",
    "for",
    "or",
    "in",
  ]);
  return rid
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t) && !STOP.has(t));
}

/**
 * Round-robin over query kinds so the cap can never silently drop a whole
 * kind (which is what hid `definition` / `exact_anchor` / `clause_type` from
 * the earlier Phase 3 telemetry on Bitrix and Mastercard). Preserves the
 * per-kind emission order authored in `buildQueries`.
 */
function capQueriesRoundRobin(queries: Phase3Query[], cap: number): Phase3Query[] {
  if (queries.length <= cap) return queries;
  const buckets = new Map<Phase3Query["kind"], Phase3Query[]>();
  for (const q of queries) {
    const list = buckets.get(q.kind) ?? [];
    list.push(q);
    buckets.set(q.kind, list);
  }
  const kindOrder: Phase3Query["kind"][] = [
    "requirement",
    "element",
    "exact_anchor",
    "clause_type",
    "definition",
    "cross_reference",
  ];
  const out: Phase3Query[] = [];
  let progressed = true;
  while (out.length < cap && progressed) {
    progressed = false;
    for (const kind of kindOrder) {
      if (out.length >= cap) break;
      const list = buckets.get(kind);
      if (!list || list.length === 0) continue;
      out.push(list.shift()!);
      progressed = true;
    }
  }
  return out;
}

function extractCapitalizedNounPhrases(text: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Z][a-z]+(?:\s+[a-z]+){0,2}\s+[A-Z][a-z]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1].trim();
    if (phrase.split(/\s+/).length >= 2) out.push(phrase);
  }
  return out;
}

function runQueries(queries: Phase3Query[], sections: SharedEvidenceItem[]): Phase3Hit[] {
  const hits: Phase3Hit[] = [];
  for (const q of queries) {
    const tokens = tokenizeForEvidence(q.text);
    if (tokens.length === 0 && !q.anchor) continue;
    const scored: Array<{ item: SharedEvidenceItem; score: number; arms: string[] }> = [];
    for (const item of sections) {
      const hay = `${item.clauseType} ${item.structuralPath ?? ""} ${item.quotedText}`.toLowerCase();
      let score = 0;
      const arms: string[] = [];
      for (const t of tokens) {
        if (t.length < 3) continue;
        if (hay.includes(t)) {
          score += Math.min(t.length, 10);
          arms.push("lexical");
          break;
        }
      }
      let lexScore = 0;
      for (const t of tokens) {
        if (t.length < 3) continue;
        if (hay.includes(t)) lexScore += Math.min(t.length, 10);
      }
      if (lexScore > 0) {
        score = lexScore;
        if (!arms.includes("lexical")) arms.push("lexical");
      }
      if (q.anchor && hay.includes(q.anchor.toLowerCase())) {
        score += 25;
        arms.push(q.kind === "exact_anchor" ? "exact" : q.kind);
      }
      if (q.kind === "clause_type" && item.clauseType.toLowerCase().includes((q.anchor ?? "").toLowerCase())) {
        score += 20;
        arms.push("clause_type_match");
      }
      if (score > 0) scored.push({ item, score, arms: [...new Set(arms)] });
    }
    scored.sort((a, b) => b.score - a.score);
    scored.slice(0, MAX_HITS_PER_QUERY).forEach((row, idx) => {
      hits.push({
        queryId: q.queryId,
        spanId: refToSpanId(row.item),
        ref: row.item.ref,
        denseRank: null,
        lexicalRank: idx + 1,
        selectedBy: row.arms,
        score: row.score,
      });
    });
  }
  return hits;
}

function refToSpanId(item: SharedEvidenceItem): string {
  const [start, end] = item.charRange;
  return `${item.sourceDocId ?? "doc"}::section::${start}-${end}`;
}

function seedsFromHits(
  hits: Phase3Hit[],
  sections: SharedEvidenceItem[],
  nodesByOffset: StructuralNode[]
): Array<{ spanId: string; item: SharedEvidenceItem; node?: StructuralNode }> {
  const byRef = new Map(sections.map((s) => [s.ref, s]));
  const seen = new Set<string>();
  const out: Array<{ spanId: string; item: SharedEvidenceItem; node?: StructuralNode }> = [];
  for (const h of hits) {
    if (seen.has(h.ref)) continue;
    seen.add(h.ref);
    const item = byRef.get(h.ref);
    if (!item) continue;
    // Pick the DEEPEST containing node — a leaf clause/paragraph/list_item —
    // so `refsBySource` lookups can hit references authored on that leaf
    // rather than only the enclosing appendix/document container.
    let node: StructuralNode | undefined;
    let bestRange = Number.POSITIVE_INFINITY;
    for (const n of nodesByOffset) {
      if (
        n.sourceOffsets[0] <= item.charRange[0] &&
        item.charRange[1] <= n.sourceOffsets[1]
      ) {
        const range = n.sourceOffsets[1] - n.sourceOffsets[0];
        if (range < bestRange) {
          bestRange = range;
          node = n;
        }
      }
    }
    out.push({ spanId: h.spanId, item, node });
  }
  return out;
}

function expandStructurally(
  requirementId: string,
  seeds: Array<{ spanId: string; item: SharedEvidenceItem; node?: StructuralNode }>,
  nodesBySpanId: Map<string, StructuralNode>,
  refsBySource: Map<string, ReferenceRecord[]>
): {
  expansions: Phase3Expansion[];
  expansionLimits: Phase3ExpansionLimit[];
  expandedSpans: StructuralNode[];
} {
  const expansions: Phase3Expansion[] = [];
  const expansionLimits: Phase3ExpansionLimit[] = [];
  const added = new Map<string, StructuralNode>();
  const visited = new Set<string>();
  const omitted: string[] = [];

  const addNode = (
    seed: StructuralNode | undefined,
    n: StructuralNode | undefined,
    reason: ExpansionReason
  ) => {
    if (!n || !seed) return;
    if (added.has(n.spanId) || visited.has(n.spanId)) return;
    if (added.size >= MAX_EXPANSION_NODES) {
      omitted.push(n.spanId);
      return;
    }
    added.set(n.spanId, n);
    expansions.push({
      requirementId,
      seedSpanId: seed.spanId,
      addedSpanId: n.spanId,
      reason,
    });
  };

  // Precompute the set of nodes contained inside each seed's node — a seed
  // that maps to an appendix/section leaf still expands to references
  // authored on its clause/paragraph descendants.
  const allNodes = [...nodesBySpanId.values()];
  const descendantsOf = (root: StructuralNode): StructuralNode[] =>
    allNodes.filter(
      (n) =>
        n.spanId !== root.spanId &&
        n.sourceOffsets[0] >= root.sourceOffsets[0] &&
        n.sourceOffsets[1] <= root.sourceOffsets[1]
    );

  for (const seed of seeds) {
    if (!seed.node) continue;
    visited.add(seed.node.spanId);
    // Parent (for applicability context)
    if (seed.node.parentSpanId) {
      addNode(seed.node, nodesBySpanId.get(seed.node.parentSpanId), "parent");
    }
    // Children (rows, list items, headings)
    for (const [, node] of nodesBySpanId) {
      if (node.parentSpanId === seed.node.spanId) {
        addNode(seed.node, node, node.kind === "heading" ? "heading" : "child");
      }
    }
    // Referenced internal targets and definitions — collect from the seed's
    // own node AND every descendant so a container-seed still yields the
    // references authored on its leaf clauses/paragraphs.
    const refSources: string[] = [
      seed.node.spanId,
      ...descendantsOf(seed.node).map((d) => d.spanId),
    ];
    for (const sourceId of refSources) {
      const refs = refsBySource.get(sourceId) ?? [];
      for (const r of refs) {
        for (const tid of r.targetSpanIds) {
          const target = nodesBySpanId.get(tid);
          if (!target) continue;
          addNode(
            seed.node,
            target,
            r.referenceKind === "defined_term" ? "definition" : "internal_reference"
          );
        }
      }
    }
  }
  if (omitted.length > 0) {
    expansionLimits.push({
      requirementId,
      limitType: "node",
      omittedSpanIds: omitted,
    });
  }
  return {
    expansions,
    expansionLimits,
    expandedSpans: [...added.values()],
  };
}

function buildBundle(args: {
  requirementId: string;
  packageId: string;
  docId: string;
  doc: SegmentedDocument | undefined;
  seedSpans: Array<{ spanId: string; item: SharedEvidenceItem; node?: StructuralNode }>;
  expandedSpans: StructuralNode[];
  nodesBySpanId: Map<string, StructuralNode>;
  references: ReferenceRecord[];
}): Phase3Bundle {
  const bundleId = `B-${args.requirementId}-${args.docId}`.slice(0, 80);
  const items: Phase3BundleItem[] = [];
  const exclusions: Phase3Exclusion[] = [];
  const seenSpans = new Set<string>();
  let totalChars = 0;

  const scopeForNode = (n: StructuralNode): Phase3ScopeVector => ({
    documentId: args.docId,
    structuralPath: n.structuralPath,
    relationship: inferEvidenceRelationshipScope({
      text: n.rawText,
      structuralPath: n.structuralPath,
    }),
    exception: /\bexcept\b|\bunless\b|\bprovided that\b/i.test(n.rawText)
      ? "exception"
      : "main_rule",
    condition: /\bif\b|\bwhen\b/i.test(n.rawText) ? "conditional" : undefined,
  });
  const scopeForItem = (it: SharedEvidenceItem): Phase3ScopeVector => ({
    documentId: args.docId,
    structuralPath: it.structuralPath,
    relationship:
      it.relationshipScope ??
      inferEvidenceRelationshipScope({
        contextHeading: it.contextHeading,
        title: it.clauseType,
        structuralPath: it.structuralPath,
        text: it.quotedText,
      }),
  });

  const addBundleItem = (
    spanId: string,
    ref: string,
    quotedText: string,
    structuralPath: string,
    charRange: [number, number],
    scope: Phase3ScopeVector,
    source: "seed" | "expansion",
    reason?: ExpansionReason
  ) => {
    if (seenSpans.has(spanId)) {
      exclusions.push({ spanId, reason: "duplicate" });
      return;
    }
    if (totalChars + quotedText.length > MAX_BUNDLE_TOKENS * 4) {
      exclusions.push({ spanId, reason: "budget", detail: `over ${MAX_BUNDLE_TOKENS} tokens` });
      return;
    }
    seenSpans.add(spanId);
    totalChars += quotedText.length;
    items.push({ spanId, ref, quotedText, structuralPath, charRange, scope, source, addedReason: reason });
  };

  // Prioritise what actually makes VERIFY correct BEFORE the 4000-token cap
  // starts excluding items. Live Bitrix `duration` was hitting the cap at
  // ~3996 tokens — big generic sections were consuming budget before the Term
  // definition body / referenced clauses (6.4, 10) / Appendix list_items got
  // a slot. Order:
  //
  //   1. Expansion nodes reason=definition        (the "Term" body, etc.)
  //   2. Expansion nodes reason=internal_reference (clause 6.4 / 10 for 28(3)(f))
  //   3. Expansion nodes reason=child on a list / table / appendix (bullet
  //      body of Appendix 1, table_row values)
  //   4. Seeds that are NOT container-only (skip appendix/schedule/section
  //      seeds — their descendants already carry the operative bodies via #3
  //      and their own quotedText is a truncated 1500-char preview)
  //   5. Everything else — seeds that ARE containers, low-priority expansions
  //      (parent / heading / sibling)
  const CONTAINER_KINDS = new Set<StructuralNode["kind"]>([
    "appendix",
    "schedule",
    "section",
    "document",
  ]);

  const isBodyChild = (n: StructuralNode): boolean =>
    n.kind === "list_item" ||
    n.kind === "table_row" ||
    n.kind === "table_cell" ||
    n.kind === "list" ||
    n.kind === "table" ||
    n.kind === "definition";

  const expansionMeta = new Map<string, { reason: ExpansionReason | undefined }>();
  for (const e of args.seedSpans) {
    if (e.node) expansionMeta.set(e.node.spanId, { reason: undefined });
  }
  const highPriority: StructuralNode[] = [];
  const midPriority: StructuralNode[] = [];
  const lowPriority: StructuralNode[] = [];
  for (const n of args.expandedSpans) {
    const kind = n.kind;
    if (n.parentSpanId && kind === "definition") {
      highPriority.push(n);
    } else if (isBodyChild(n)) {
      midPriority.push(n);
    } else {
      lowPriority.push(n);
    }
  }
  // Expansion-reason attribution isn't threaded on the node itself, so the
  // ordering above uses node KIND (definition / list_item / table_row) as the
  // proxy for the reason label — matches the priority tiers 1:1 for the
  // cases the plan cares about.

  const containerSeeds: typeof args.seedSpans = [];
  const leafSeeds: typeof args.seedSpans = [];
  for (const s of args.seedSpans) {
    if (s.node && CONTAINER_KINDS.has(s.node.kind)) containerSeeds.push(s);
    else leafSeeds.push(s);
  }

  // Body / operative-content per-item caps. Previous 800/1500 caps cost the
  // matcher real evidence: MC §3.5.5 stretches ~2500 chars ("cooperate with
  // Mastercard … conducting data protection impact assessments …") and was
  // being cut before the DPIA sentence, hiding F3 support. Raised so a
  // typical numbered clause survives whole; the total bundle cap
  // (MAX_BUNDLE_TOKENS) still bounds the requirement bundle.
  const EXPANSION_BODY_CHAR_CAP = 3000;
  const LEAF_SEED_BODY_CHAR_CAP = 4000;

  // Pass 1: definitions.
  for (const n of highPriority) {
    addBundleItem(
      n.spanId,
      `X-${n.spanId.slice(-8)}`,
      n.rawText.slice(0, EXPANSION_BODY_CHAR_CAP),
      n.structuralPath,
      n.sourceOffsets,
      scopeForNode(n),
      "expansion",
      "definition"
    );
  }
  // Pass 2: referenced clauses + list_items + table_rows (Appendix body).
  for (const n of midPriority) {
    addBundleItem(
      n.spanId,
      `X-${n.spanId.slice(-8)}`,
      n.rawText.slice(0, EXPANSION_BODY_CHAR_CAP),
      n.structuralPath,
      n.sourceOffsets,
      scopeForNode(n),
      "expansion",
      n.kind === "definition" ? "definition" : "internal_reference"
    );
  }
  // Pass 3: leaf seeds (clauses / paragraphs / list_items directly retrieved).
  // Prefer the whole leaf-node rawText over the pre-truncated section-candidate
  // quotedText — a clause like MC §3.5.5 that runs past the section builder's
  // 1500-char cap now enters the bundle intact.
  for (const seed of leafSeeds) {
    const node = seed.node;
    const preferNodeBody =
      node !== undefined &&
      node.rawText.length > seed.item.quotedText.length &&
      node.rawText.length <= LEAF_SEED_BODY_CHAR_CAP;
    const bodyText = preferNodeBody
      ? node!.rawText
      : seed.item.quotedText.slice(0, LEAF_SEED_BODY_CHAR_CAP);
    const structuralPath = preferNodeBody ? node!.structuralPath : seed.item.structuralPath;
    const charRange: [number, number] = preferNodeBody
      ? node!.sourceOffsets
      : seed.item.charRange;
    addBundleItem(
      seed.spanId,
      seed.item.ref,
      bodyText,
      structuralPath,
      charRange,
      scopeForItem(seed.item),
      "seed"
    );
  }
  // Pass 4: container seeds (their descendants already added at higher
  // priority; a truncated container preview is only worth adding if the cap
  // still allows).
  for (const seed of containerSeeds) {
    addBundleItem(
      seed.spanId,
      seed.item.ref,
      seed.item.quotedText,
      seed.item.structuralPath,
      seed.item.charRange,
      scopeForItem(seed.item),
      "seed"
    );
  }
  // Pass 5: low-priority expansions (parent / heading / sibling context).
  for (const n of lowPriority) {
    addBundleItem(
      n.spanId,
      `X-${n.spanId.slice(-8)}`,
      n.rawText.slice(0, 600),
      n.structuralPath,
      n.sourceOffsets,
      scopeForNode(n),
      "expansion"
    );
  }

  // Partition by (relationship, exception) — scope-compatible groups.
  const partitions = new Map<string, Phase3BundlePartition>();
  for (const it of items) {
    const key = `${it.scope.relationship ?? "unspecified"}|${it.scope.exception ?? "main_rule"}`;
    let part = partitions.get(key);
    if (!part) {
      part = {
        partitionId: `P${partitions.size + 1}`,
        scope: { relationship: it.scope.relationship, exception: it.scope.exception },
        itemSpanIds: [],
      };
      partitions.set(key, part);
    }
    part.itemSpanIds.push(it.spanId);
  }
  // Any item whose scope conflicts with the dominant partition is flagged.
  const dominant = [...partitions.values()].sort(
    (a, b) => b.itemSpanIds.length - a.itemSpanIds.length
  )[0];
  if (dominant) {
    for (const it of items) {
      if (
        it.scope.relationship &&
        dominant.scope.relationship &&
        dominant.scope.relationship !== "unspecified" &&
        it.scope.relationship !== "unspecified" &&
        it.scope.relationship !== dominant.scope.relationship
      ) {
        exclusions.push({ spanId: it.spanId, reason: "incompatible_scope" });
      }
    }
  }

  // Bundle dependencies — every unresolved/ambiguous reference from a seed's
  // node becomes a dependency line.
  const dependencies: Phase3BundleDependency[] = [];
  const seedNodeIds = new Set(args.seedSpans.map((s) => s.node?.spanId).filter(Boolean) as string[]);
  for (const r of args.references) {
    if (!seedNodeIds.has(r.sourceSpanId)) continue;
    dependencies.push({
      reference: r.referenceText,
      state:
        r.state === "resolved_internal"
          ? "resolved_internal"
          : r.state === "ambiguous"
            ? "ambiguous"
            : "unresolved_external",
      targetSpanIds: r.targetSpanIds,
    });
  }

  return {
    bundleId,
    requirementId: args.requirementId,
    items,
    partitions: [...partitions.values()],
    exclusions,
    dependencies,
    estimatedTokens: Math.ceil(totalChars / 4),
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractQuotedPhrases(text: string): string[] {
  const out: string[] = [];
  const re = /["“](.{6,120}?)["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    if (p.split(/\s+/).length >= 3) out.push(p);
  }
  return out;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}
