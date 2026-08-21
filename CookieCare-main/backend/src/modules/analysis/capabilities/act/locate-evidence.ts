import type { EvidenceStatus } from "../../models/clause-object.js";
import type { DocumentSegment, SegmentedDocument } from "../../models/document-workspace.js";
import type { AnalysisSkillConfig, ClauseRetrievalDict } from "../../skills/runtime/catalog/types.js";
import { mergeClauseRetrievalMaps } from "../../skills/runtime/catalog/registry.js";

const MAX_CANDIDATES_PER_TYPE = 5;
const MIN_SCORE = 20;
const MAX_CANDIDATE_CHARS = 2_400;

const CROSS_REF_RE =
  /\b(?:set out|set forth|described|specified|detailed|contained|listed|as defined)\s+in\s+([^.;]{3,80})|\b(?:annex|schedule|exhibit|addendum|appendix|sow|statement of work)\s+[A-Z0-9][\w.-]*/gi;

export interface ClauseCandidate {
  clauseType: string;
  segmentId: string;
  sectionTitle?: string;
  startOffset: number;
  endOffset: number;
  text: string;
  matchReason: string;
  score: number;
}

export interface ClauseLocatorResult {
  clauseType: string;
  status: EvidenceStatus;
  candidates: ClauseCandidate[];
  referencedDocuments?: string[];
}

export interface DocumentSection {
  title: string;
  headingPath: string;
  startOffset: number;
  endOffset: number;
  text: string;
  headingText: string;
  firstLine: string;
}

/**
 * Merge authored `clauseRetrieval` with `textSynonyms` / definitions so skills
 * without a dictionary still retrieve on known aliases.
 */
export function buildRetrievalDictionary(
  skills: AnalysisSkillConfig[],
  clauseTypes: string[]
): Record<string, ClauseRetrievalDict> {
  const authored = mergeClauseRetrievalMaps(
    ...skills.map((s) => s.clauseRetrieval)
  );
  const wanted = new Set(clauseTypes);
  const out: Record<string, ClauseRetrievalDict> = {};

  for (const type of clauseTypes) {
    const fromAuthored = authored?.[type];
    const synonyms = skills.flatMap(
      (s) =>
        s.expectedClauses
          .filter((e) => e.clauseType === type)
          .flatMap((e) => e.textSynonyms ?? [])
    );
    const definition = skills
      .map((s) => s.clauseTypeDefinitions?.[type])
      .find(Boolean);
    const humanized = type.replace(/_/g, " ");
    out[type] = {
      headings: unique([...(fromAuthored?.headings ?? []), humanized]),
      aliases: unique([
        ...(fromAuthored?.aliases ?? []),
        ...synonyms,
        humanized,
      ]),
      anchorTerms: unique([
        ...(fromAuthored?.anchorTerms ?? []),
        ...synonyms,
        ...(definition ? extractAnchorishTerms(definition) : []),
      ]),
    };
  }

  // Keep only requested types (wanted is used so unused authored keys drop).
  for (const key of Object.keys(out)) {
    if (!wanted.has(key)) delete out[key];
  }
  return out;
}

export function groupDocumentSections(doc: SegmentedDocument): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: {
    title: string;
    headingPath: string;
    start: number;
    headingText: string;
    parts: DocumentSegment[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const end =
      current.parts.length > 0
        ? current.parts[current.parts.length - 1].locator.charRange[1]
        : current.start;
    const text = doc.fullText.slice(current.start, end).trim() || current.headingText;
    const firstBody = current.parts.find((p) => p.kind !== "heading");
    sections.push({
      title: current.title,
      headingPath: current.headingPath,
      startOffset: current.start,
      endOffset: end,
      text,
      headingText: current.headingText,
      firstLine: (firstBody?.text ?? current.headingText).slice(0, 180),
    });
    current = null;
  };

  for (const seg of doc.segments) {
    const isStart = seg.kind === "heading" || seg.kind === "clause";
    if (isStart) {
      flush();
      current = {
        title: seg.text.replace(/^(#{1,3}\s+|\d+(?:\.\d+)*[.)]\s+)/, "").trim(),
        headingPath: seg.locator.structuralPath,
        start: seg.locator.charRange[0],
        headingText: seg.text,
        parts: [seg],
      };
      continue;
    }
    if (!current) {
      current = {
        title: "preamble",
        headingPath: seg.locator.structuralPath,
        start: seg.locator.charRange[0],
        headingText: "",
        parts: [seg],
      };
      continue;
    }
    current.parts.push(seg);
  }
  flush();
  return sections;
}

/**
 * Score each document section against each requested clause type using
 * heading > alias > anchor-term matches. Recall-oriented: over-retrieve.
 */
export function locateEvidence(
  doc: SegmentedDocument,
  clauseTypes: string[],
  dictionary: Record<string, ClauseRetrievalDict>
): ClauseLocatorResult[] {
  const sections = groupDocumentSections(doc);
  return clauseTypes.map((clauseType) =>
    locateOneType(clauseType, sections, dictionary[clauseType], doc)
  );
}

export function extractCrossReferences(text: string): string[] {
  const found: string[] = [];
  const re = new RegExp(CROSS_REF_RE.source, CROSS_REF_RE.flags);
  for (const match of text.matchAll(re)) {
    const named = (match[1] ?? match[0] ?? "").replace(/\s+/g, " ").trim();
    if (named.length >= 3 && named.length <= 80) found.push(named);
  }
  return unique(found);
}

function locateOneType(
  clauseType: string,
  sections: DocumentSection[],
  dict: ClauseRetrievalDict | undefined,
  doc: SegmentedDocument
): ClauseLocatorResult {
  const headings = (dict?.headings ?? []).map(normalize);
  const aliases = (dict?.aliases ?? []).map(normalize);
  const anchors = (dict?.anchorTerms ?? []).map(normalize);

  const scored: ClauseCandidate[] = [];
  const referenced = new Set<string>();

  for (const section of sections) {
    const headingNorm = normalize(section.headingText || section.title);
    const bodyNorm = normalize(section.text);
    let score = 0;
    const reasons: string[] = [];

    const headingHit = headings.find(
      (h) => h.length >= 4 && (headingNorm.includes(h) || h.includes(headingNorm))
    );
    if (headingHit) {
      score += 100;
      reasons.push(`heading:${headingHit}`);
    }

    const headingAlias = aliases.find(
      (a) => a.length >= 4 && headingNorm.includes(a)
    );
    if (headingAlias) {
      score += 80;
      reasons.push(`heading-alias:${headingAlias}`);
    }

    const aliasHits = aliases.filter((a) => a.length >= 4 && bodyNorm.includes(a));
    if (aliasHits.length > 0) {
      score += Math.min(40 + 10 * (aliasHits.length - 1), 70);
      reasons.push(`alias:${aliasHits.slice(0, 3).join("|")}`);
    }

    const anchorHits = anchors.filter((a) => a.length >= 4 && bodyNorm.includes(a));
    if (anchorHits.length > 0) {
      score += Math.min(20 * anchorHits.length, 60);
      reasons.push(`anchor:${anchorHits.slice(0, 3).join("|")}`);
    }

    const refs = extractCrossReferences(section.text);
    if (score > 0) {
      for (const r of refs) referenced.add(r);
    }

    if (score < MIN_SCORE) continue;

    const span = clampSpan(doc, section.startOffset, section.endOffset);
    scored.push({
      clauseType,
      segmentId: section.headingPath,
      sectionTitle: section.title,
      startOffset: span[0],
      endOffset: span[1],
      text: doc.fullText.slice(span[0], span[1]).trim().slice(0, MAX_CANDIDATE_CHARS),
      matchReason: reasons.join("; "),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = dedupeBySpan(scored).slice(0, MAX_CANDIDATES_PER_TYPE);
  const refs = [...referenced];

  if (candidates.length === 0) {
    const elsewhere = findReferencedElsewhere(doc, headings, aliases, anchors);
    if (elsewhere.refs.length > 0) {
      return {
        clauseType,
        status: "referenced_elsewhere",
        candidates: elsewhere.candidates.map((c) => ({ ...c, clauseType })),
        referencedDocuments: elsewhere.refs,
      };
    }
    return { clauseType, status: "not_found", candidates: [] };
  }

  const status: EvidenceStatus =
    candidates.length > 1 ? "multiple_candidates" : "found";
  return {
    clauseType,
    status,
    candidates,
    referencedDocuments: refs.length > 0 ? refs : undefined,
  };
}

function findReferencedElsewhere(
  doc: SegmentedDocument,
  headings: string[],
  aliases: string[],
  anchors: string[]
): { refs: string[]; candidates: ClauseCandidate[] } {
  const terms = [...headings, ...aliases, ...anchors].filter((t) => t.length >= 5);
  if (terms.length === 0) return { refs: [], candidates: [] };
  const windows = doc.fullText.split(/(?<=[.?!])\s+/);
  let cursor = 0;
  const refs: string[] = [];
  const candidates: ClauseCandidate[] = [];
  for (const sentence of windows) {
    const start = doc.fullText.indexOf(sentence, cursor);
    cursor = start >= 0 ? start + sentence.length : cursor;
    const norm = normalize(sentence);
    if (!terms.some((t) => norm.includes(t))) continue;
    const found = extractCrossReferences(sentence);
    if (found.length === 0) continue;
    refs.push(...found);
    const lo = Math.max(0, start);
    const hi = Math.min(doc.fullText.length, start + sentence.length);
    candidates.push({
      clauseType: "",
      segmentId: "cross-ref",
      startOffset: lo,
      endOffset: hi,
      text: sentence.trim(),
      matchReason: `referenced_elsewhere:${found.join("|")}`,
      score: MIN_SCORE,
    });
    if (candidates.length >= 2) break;
  }
  return { refs: unique(refs), candidates };
}

function clampSpan(
  doc: SegmentedDocument,
  start: number,
  end: number
): [number, number] {
  const lo = Math.max(0, start);
  const hi = Math.min(doc.fullText.length, end);
  return [lo, Math.max(lo, hi)];
}

function dedupeBySpan(candidates: ClauseCandidate[]): ClauseCandidate[] {
  const out: ClauseCandidate[] = [];
  for (const c of candidates) {
    const overlap = out.some(
      (o) =>
        o.segmentId === c.segmentId ||
        (c.startOffset < o.endOffset && c.endOffset > o.startOffset)
    );
    if (!overlap) out.push(c);
  }
  return out;
}

function extractAnchorishTerms(definition: string): string[] {
  return definition
    .split(/[.,;:]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 48)
    .slice(0, 4);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const n = v.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
