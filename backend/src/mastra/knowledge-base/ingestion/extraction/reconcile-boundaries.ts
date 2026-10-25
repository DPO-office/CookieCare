import type { CandidateStructure, CandidateSegment } from "./structure-provider.js";
import { sourceLocations } from "./structure-provider.js";
import type { SourceMap } from "./source-map.js";

/** Conservative source-backed stitching. Unlabelled or conflicting fragments stay unresolved.
 * Matching words alone are never enough: both sides must explicitly report continuation.
 */
export function reconcileBoundaries(map: SourceMap, input: CandidateStructure): CandidateStructure {
  const segments = input.segments.map(segment => ({ ...segment, children: [...segment.children] }));
  const redirects = new Map<string, string>();
  const canonical = (id: string): string => redirects.has(id) ? canonical(redirects.get(id)!) : id;
  const label = (s: CandidateSegment) => {
    const span = s.code ?? s.title;
    return span ? map.text.slice(span.start, span.end).replace(/\s+/gu, " ").trim().toLowerCase() : "";
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const left of segments.filter(s => !redirects.has(s.id) && s.continuesAfterChunk)) {
      const matches = segments.filter(right => right.id !== left.id && !redirects.has(right.id) &&
        right.startsBeforeChunk && right.span.start > left.span.start && right.span.end > left.span.end &&
        right.type === left.type && right.kind === left.kind && label(left) !== "" && label(left) === label(right) &&
        (left.parent && right.parent ? canonical(left.parent) === canonical(right.parent) :
          left.parent === null && right.parent === null && left.parentHint === right.parentHint) &&
        (right.span.start <= left.span.end || !map.text.slice(left.span.end, right.span.start).trim()));
      if (matches.length !== 1) continue;
      const right = matches[0]!;
      // Reject a right fragment also claimed by a different compatible left boundary.
      if (segments.some(other => other.id !== left.id && !redirects.has(other.id) && other.continuesAfterChunk &&
        other.type === left.type && label(other) === label(left) && other.span.start < right.span.start &&
        other.span.end >= right.span.start)) continue;
      left.span = { start: left.span.start, end: right.span.end };
      left.sourceSpans = sourceLocations(map, left.span);
      left.continuesAfterChunk = right.continuesAfterChunk ?? false;
      left.children = [...new Set([...left.children, ...right.children])];
      left.reconciliation = { basis: "matching_label_and_contiguous_source", fragmentIds: [
        ...(left.reconciliation?.fragmentIds ?? [left.id]), ...(right.reconciliation?.fragmentIds ?? [right.id]),
      ] };
      redirects.set(right.id, left.id); changed = true;
    }
  }
  const retained = segments.filter(s => !redirects.has(s.id)).map(segment => ({ ...segment,
    parent: segment.parent ? canonical(segment.parent) : null,
    children: [...new Set(segment.children.map(canonical))],
  }));
  const warnings = [...input.warnings];
  for (const segment of retained) if (segment.startsBeforeChunk || segment.continuesAfterChunk) {
    warnings.push(`unreconciled_boundary:${segment.id}`);
  }
  return { ...input, segments: retained, warnings,
    references: input.references.map(ref => ({ ...ref,
      targetSegmentIds: [...new Set(ref.targetSegmentIds.map(canonical))] })) };
}
