import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import type { CandidateStructure, CandidateSegment, SourceLocation } from "./structure-provider.js";
import type { DetectedReference, ReferenceDetection } from "./reference-detection.js";

export interface DraftProvision {
  id: string;
  candidateSegmentId: string;
  parentId: string | null;
  kind: string;
  label: string | null;
  text: string;
  start: number;
  end: number;
  sourceSpans: SourceLocation[];
  childIds: string[];
  structuralPath: string[];
  inheritedParentIds: string[];
  boundaryStatus: "complete" | "cross_chunk" | "uncertain";
  status: "candidate" | "needs_review";
}
export interface DraftRelationship {
  id: string;
  occurrenceId: string;
  sourceProvisionId: string | null;
  targetProvisionId: string | null;
  targetProvisionIds: string[];
  exactMention: string;
  start: number;
  end: number;
  status: "proposed" | "unresolved" | "ambiguous" | "external_unavailable";
  detectedBy: Array<"model" | "source_detector">;
  targetHint: string | null;
  externalTarget: { instrumentHint: string; provisionHint: string | null;
    versionStatus: "unresolved"; availability: "unavailable" } | null;
  rangeTarget: { kind: "article" | "rule" | "section"; from: number; to: number;
    complete: boolean } | null;
}
export interface ReconstructionDraft {
  schemaVersion: 1;
  sourceVersionId: string;
  textHash: string;
  provisions: DraftProvision[];
  relationships: DraftRelationship[];
  unresolvedText: Array<{ start: number; end: number; text: string }>;
  warnings: string[];
  status: "candidate_ready" | "needs_review";
}

const KINDS = new Set(["article", "paragraph", "point", "table", "footnote", "annex",
  "definition", "rule", "schedule", "recital", "chapter", "section", "illustration",
  "subsection", "subparagraph", "list_item", "table_row", "part", "title"]);

function labelOf(segment: CandidateSegment, text: string): string | null {
  const range = segment.code ?? segment.title;
  return range ? text.slice(range.start, range.end).trim() || null : null;
}

function uncoveredText(text: string, intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const gaps: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor && text.slice(cursor, span.start).trim()) {
      gaps.push({ start: cursor, end: span.start, text: text.slice(cursor, span.start) });
    }
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length && text.slice(cursor).trim()) gaps.push({ start: cursor,
    end: text.length, text: text.slice(cursor) });
  return gaps;
}

interface CitationPath {
  kind: "article" | "rule" | "section" | "schedule";
  number: string;
  subpoints: string[];
}

const ORDINALS: Record<string, string> = {
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6",
  seventh: "7", eighth: "8", ninth: "9", tenth: "10",
};

function citationPath(value: string): CitationPath | null {
  const normalized = value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
  const ordinalSchedule = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+schedule\b/iu.exec(normalized);
  if (ordinalSchedule) return { kind: "schedule", number: ORDINALS[ordinalSchedule[1]!.toLocaleLowerCase("en")]!,
    subpoints: [] };
  const match = /\b(article|rule|section|schedule)\s+(\d+[a-z]?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b((?:\s*\([a-z0-9ivxlcdm]+\))*)/iu.exec(normalized);
  if (!match) return null;
  const rawNumber = match[2]!.toLocaleLowerCase("en");
  return { kind: match[1]!.toLocaleLowerCase("en") as CitationPath["kind"],
    number: ORDINALS[rawNumber] ?? rawNumber,
    subpoints: [...match[3]!.matchAll(/\(([a-z0-9ivxlcdm]+)\)/giu)].map(item => item[1]!.toLocaleLowerCase("en")) };
}

function targetCandidates(mention: string, provisions: DraftProvision[]): DraftProvision[] {
  const citation = citationPath(mention);
  if (!citation) return [];
  return provisions.filter(provision => {
    if (provision.kind !== citation.kind) return false;
    const candidate = citationPath(provision.label ?? provision.text.split("\n", 1)[0] ?? "");
    return candidate?.kind === citation.kind && candidate.number === citation.number &&
      candidate.subpoints.join(".") === citation.subpoints.join(".");
  });
}

function containingProvision(start: number, end: number, provisions: DraftProvision[]): DraftProvision | null {
  return provisions.filter(provision => provision.start <= start && provision.end >= end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? null;
}

function referencedRange(mention: string, provisions: DraftProvision[]) {
  mention = mention.replace(/[\u2010-\u2015]/gu, "-");
  const match = /\b(articles?|rules?|sections?)\s+(\d+)\s*[-–—]\s*(\d+)/iu.exec(mention);
  if (!match) return null;
  const kind = match[1]!.toLocaleLowerCase("en").replace(/s$/, "") as "article" | "rule" | "section";
  const from = Number(match[2]), to = Number(match[3]);
  if (to < from || to - from > 500) return null;
  const byNumber = new Map<number, DraftProvision[]>();
  for (const provision of provisions) {
    const citation = citationPath(provision.label ?? provision.text.split("\n", 1)[0] ?? "");
    if (citation?.kind !== kind || citation.subpoints.length) continue;
    const value = Number(citation.number);
    if (Number.isInteger(value) && value >= from && value <= to) {
      byNumber.set(value, [...(byNumber.get(value) ?? []), provision]);
    }
  }
  const expected = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const candidates = expected.flatMap(value => byNumber.get(value) ?? []);
  return { kind, from, to, candidates,
    complete: expected.every(value => byNumber.get(value)?.length === 1) };
}

function relativeTargets(mention: string, owner: DraftProvision | null,
  provisions: DraftProvision[]): DraftProvision[] {
  const match = /\b(paragraph|subparagraph|point)\s+\(?([A-Za-z0-9]+)\)?\s+of\s+this\s+(article|rule|section)\b/iu.exec(mention);
  if (!match || !owner) return [];
  const byId = new Map(provisions.map(provision => [provision.id, provision]));
  let container: DraftProvision | undefined = owner;
  while (container && container.kind !== match[3]!.toLocaleLowerCase("en")) {
    container = container.parentId ? byId.get(container.parentId) : undefined;
  }
  if (!container) return [];
  const token = match[2]!.toLocaleLowerCase("en");
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const localLabel = new RegExp(`^(?:paragraph|subparagraph|point)?\\s*\\(${escapedToken}\\)(?:\\s|$)`, "iu");
  return provisions.filter(provision => provision.id !== owner.id &&
    (provision.parentId === container!.id || provision.inheritedParentIds.includes(container!.id)) &&
    ["paragraph", "point"].includes(provision.kind) &&
    localLabel.test((provision.label ?? provision.text.slice(0, 60)).trim()));
}

function structuralPaths(provisions: DraftProvision[]): void {
  const byId = new Map(provisions.map(provision => [provision.id, provision]));
  for (const provision of provisions) {
    const path: string[] = [], inherited: string[] = [], seen = new Set<string>();
    let current = provision.parentId ? byId.get(provision.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      seen.add(current.id); path.unshift(current.label ?? current.id); inherited.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    provision.structuralPath = [...path, provision.label ?? provision.id];
    provision.inheritedParentIds = inherited;
  }
  for (const provision of provisions) provision.childIds = provisions
    .filter(child => child.parentId === provision.id).map(child => child.id);
}

/** Drafts only. A legal reviewer must accept coverage and relationships before publication. */
export function reconstructSource(map: SourceMap, candidate: CandidateStructure,
  detection: ReferenceDetection): ReconstructionDraft {
  if (candidate.textHash !== map.textHash || detection.textHash !== map.textHash ||
      detection.sourceVersionId.length === 0) throw new Error("Reconstruction inputs refer to different text");
  const sourceVersionId = detection.sourceVersionId;
  const warnings = [...map.warnings, ...candidate.warnings, ...candidate.unresolvedItems, ...detection.warnings];
  const bySegment = new Map(candidate.segments.map(segment => [segment.id,
    hashRevision({ sourceVersionId, textHash: map.textHash, kind: segment.kind,
      type: segment.type, category: segment.category, start: segment.span.start, end: segment.span.end })]));
  const provisions = candidate.segments.map(segment => {
    const sourceSpans = segment.sourceSpans;
    const hasLocation = sourceSpans.length > 0 && sourceSpans.every(location => location.physicalPage !== null);
    const kind = segment.type && KINDS.has(segment.type) ? segment.type : "unknown";
    if (kind === "unknown") warnings.push(`Unknown structure: ${segment.id}`);
    if (!hasLocation) warnings.push(`Provision has uncertain PDF location: ${segment.id}`);
    return { id: bySegment.get(segment.id)!, candidateSegmentId: segment.id,
      parentId: segment.parent ? bySegment.get(segment.parent) ?? null : null,
      kind, label: labelOf(segment, map.text), text: map.text.slice(segment.span.start, segment.span.end),
      start: segment.span.start, end: segment.span.end, sourceSpans,
      childIds: [], structuralPath: [], inheritedParentIds: [],
      boundaryStatus: segment.startsBeforeChunk || segment.continuesAfterChunk ? "cross_chunk" as const :
        sourceSpans.length ? "complete" as const : "uncertain" as const,
      status: hasLocation && kind !== "unknown" && !segment.startsBeforeChunk && !segment.continuesAfterChunk ?
        "candidate" as const : "needs_review" as const };
  });
  structuralPaths(provisions);
  const unresolvedText = uncoveredText(map.text, candidate.segments.map(segment => segment.span));
  for (const gap of unresolvedText) warnings.push(`Unclassified source text at ${gap.start}-${gap.end}`);
  const relationships: DraftRelationship[] = [];
  const addRelationship = (occurrence: { id: string; start: number; end: number; exactMention: string;
    targetHint?: string | null; externalInstrumentHint?: string | null }, detectedBy: "model" | "source_detector",
    directTargetIds: string[] = [], resolutionStatus?: string) => {
    const owner = containingProvision(occurrence.start, occurrence.end, provisions);
    const directTargets = directTargetIds.map(id => bySegment.get(id)).filter((id): id is string => !!id)
      .map(id => provisions.find(provision => provision.id === id)!).filter(Boolean);
    const range = referencedRange(occurrence.exactMention, provisions);
    const targets = [...targetCandidates(occurrence.exactMention, provisions),
      ...relativeTargets(occurrence.exactMention, owner, provisions), ...(range?.candidates ?? [])]
      .filter(target => target.id !== owner?.id);
    const candidates = [...new Map([...directTargets, ...targets].map(target => [target.id, target])).values()];
    const target = candidates.length === 1 ? candidates[0]! : null;
    const external = resolutionStatus === "external" || !!occurrence.externalInstrumentHint;
    const status = external ? "external_unavailable" : range ? (range.complete ? "proposed" : "unresolved") :
      candidates.length > 1 ? "ambiguous" :
      target ? "proposed" : "unresolved";
    if (!owner || status !== "proposed") warnings.push(`Reference needs review: ${occurrence.exactMention} at ${occurrence.start}`);
    const identity = hashRevision({ sourceVersionId, start: occurrence.start, end: occurrence.end,
      sourceProvisionId: owner?.id ?? null });
    const existing = relationships.find(relation => relation.id === identity);
    if (existing) {
      if (!existing.detectedBy.includes(detectedBy)) existing.detectedBy.push(detectedBy);
      existing.targetProvisionIds = [...new Set([...existing.targetProvisionIds, ...candidates.map(item => item.id)])];
      if (external && !existing.externalTarget) {
        existing.externalTarget = { instrumentHint: occurrence.externalInstrumentHint ??
          occurrence.targetHint ?? occurrence.exactMention, provisionHint: null,
          versionStatus: "unresolved", availability: "unavailable" };
      }
      if (range && !existing.rangeTarget) {
        existing.rangeTarget = { kind: range.kind, from: range.from, to: range.to, complete: range.complete };
      }
      if (existing.externalTarget) {
        existing.status = "external_unavailable";
        existing.targetProvisionId = null;
      } else if (existing.rangeTarget) {
        existing.status = existing.rangeTarget.complete ? "proposed" : "unresolved";
        existing.targetProvisionId = null;
      } else if (existing.targetProvisionIds.length === 1) {
        existing.targetProvisionId = existing.targetProvisionIds[0]!;
        existing.status = "proposed";
      } else if (existing.targetProvisionIds.length > 1) {
        existing.targetProvisionId = null;
        existing.status = "ambiguous";
      } else {
        existing.targetProvisionId = null;
        existing.status = "unresolved";
      }
      return;
    }
    relationships.push({ id: identity, occurrenceId: occurrence.id, sourceProvisionId: owner?.id ?? null,
      targetProvisionId: target?.id ?? null, targetProvisionIds: candidates.map(item => item.id), exactMention: occurrence.exactMention,
      start: occurrence.start, end: occurrence.end, status, detectedBy: [detectedBy],
      targetHint: occurrence.targetHint ?? occurrence.exactMention,
      externalTarget: external ? { instrumentHint: occurrence.externalInstrumentHint ?? occurrence.targetHint ?? occurrence.exactMention,
        provisionHint: null, versionStatus: "unresolved", availability: "unavailable" } : null,
      rangeTarget: range ? { kind: range.kind, from: range.from, to: range.to, complete: range.complete } : null });
  };
  for (const occurrence of detection.references) addRelationship(occurrence, "source_detector");
  candidate.references.forEach((reference, index) => addRelationship({ id: `model:${index}`,
    start: reference.start, end: reference.end, exactMention: reference.exactMention,
    targetHint: reference.targetHint }, "model", reference.targetSegmentIds, reference.resolutionStatus));
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash, provisions,
    relationships, unresolvedText, warnings,
    status: warnings.length ? "needs_review" : "candidate_ready" };
}
