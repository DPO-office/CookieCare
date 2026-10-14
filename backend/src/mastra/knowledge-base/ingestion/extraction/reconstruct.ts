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
  status: "candidate" | "needs_review";
}
export interface DraftRelationship {
  id: string;
  occurrenceId: string;
  sourceProvisionId: string | null;
  targetProvisionId: string | null;
  exactMention: string;
  start: number;
  end: number;
  status: "proposed" | "unresolved" | "ambiguous";
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
  "definition", "rule", "schedule", "recital", "chapter", "section", "illustration"]);

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

function targetCandidates(mention: string, provisions: DraftProvision[]): DraftProvision[] {
  const normalized = mention.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const schedule = normalized.includes("schedule");
  const kind = schedule ? "schedule" : normalized.split(" ")[0]!.replace(/s$/, "");
  const exact = provisions.filter(provision => provision.kind === kind &&
    [provision.label, provision.text.split("\n", 1)[0]].some(value => value &&
      value.toLocaleLowerCase("en").replace(/\s+/g, " ").includes(normalized)));
  if (exact.length) return exact;
  return provisions.filter(provision => provision.kind === kind && provision.label &&
    normalized.includes(provision.label.toLocaleLowerCase("en").replace(/\s+/g, " ")));
}

/** Drafts only. A legal reviewer must accept coverage and relationships before publication. */
export function reconstructSource(map: SourceMap, candidate: CandidateStructure,
  detection: ReferenceDetection): ReconstructionDraft {
  if (candidate.textHash !== map.textHash || detection.textHash !== map.textHash ||
      detection.sourceVersionId.length === 0) throw new Error("Reconstruction inputs refer to different text");
  const sourceVersionId = detection.sourceVersionId;
  const warnings = [...map.warnings, ...candidate.warnings, ...detection.warnings];
  const bySegment = new Map(candidate.segments.map(segment => [segment.id,
    hashRevision({ sourceVersionId, segmentId: segment.id })]));
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
      status: hasLocation && kind !== "unknown" ? "candidate" as const : "needs_review" as const };
  });
  const unresolvedText = uncoveredText(map.text, candidate.segments.map(segment => segment.span));
  for (const gap of unresolvedText) warnings.push(`Unclassified source text at ${gap.start}-${gap.end}`);
  const relationships = detection.references.map((occurrence: DetectedReference) => {
    const owners = provisions.filter(provision => provision.start <= occurrence.start && provision.end >= occurrence.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const owner = owners[0] ?? null;
    const targets = targetCandidates(occurrence.exactMention, provisions)
      .filter(target => target.id !== owner?.id);
    const target = targets.length === 1 ? targets[0]! : null;
    const status = targets.length > 1 ? "ambiguous" : target ? "proposed" : "unresolved";
    if (!owner || status !== "proposed") warnings.push(`Reference needs review: ${occurrence.exactMention} at ${occurrence.start}`);
    return { id: hashRevision({ sourceVersionId, occurrenceId: occurrence.id,
      sourceProvisionId: owner?.id ?? null, targetProvisionId: target?.id ?? null }),
      occurrenceId: occurrence.id, sourceProvisionId: owner?.id ?? null,
      targetProvisionId: target?.id ?? null, exactMention: occurrence.exactMention,
      start: occurrence.start, end: occurrence.end, status } satisfies DraftRelationship;
  });
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash, provisions,
    relationships, unresolvedText, warnings,
    status: warnings.length ? "needs_review" : "candidate_ready" };
}
