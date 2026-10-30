import type { DraftProvision, DraftRelationship } from "./reconstruct.js";

/** Whitespace normalization only, with an exact map back to the immutable source. */
export function groundedQuote(text: string, quote: string): { start: number; end: number; text: string } | null {
  if (!quote.trim()) return null;
  const normalize = (value: string) => {
    let normalized = "";
    const starts: number[] = [], ends: number[] = [];
    for (const match of value.matchAll(/\s+|\S/gu)) {
      normalized += /^\s/u.test(match[0]) ? " " : match[0];
      // \S can contain a surrogate pair; offsets remain UTF-16 positions.
      for (let i = 0; i < (/^\s/u.test(match[0]) ? 1 : match[0].length); i++) {
        starts.push(match.index!); ends.push(match.index! + match[0].length);
      }
    }
    return { normalized, starts, ends };
  };
  const raw = normalize(text), needle = normalize(quote).normalized.trim();
  const index = raw.normalized.indexOf(needle);
  if (index < 0 || raw.normalized.indexOf(needle, index + 1) >= 0) return null;
  const start = raw.starts[index]!, end = raw.ends[index + needle.length - 1]!;
  return { start, end, text: text.slice(start, end) };
}

/** Introductory and trailing wording owned by a parent, without repeating its children. */
export function ownSourceRanges(provision: DraftProvision, provisions: DraftProvision[]) {
  const children = provisions.filter(p => p.parentId === provision.id && p.id !== provision.id &&
    p.start >= provision.start && p.end <= provision.end).sort((a, b) => a.start - b.start);
  let cursor = provision.start;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const child of children) {
    if (child.start > cursor) ranges.push({ start: cursor, end: child.start });
    cursor = Math.max(cursor, child.end);
  }
  if (cursor < provision.end) ranges.push({ start: cursor, end: provision.end });
  return ranges;
}

export function relationshipUsable(relation: DraftRelationship): boolean {
  return relation.status === "proposed" && relation.semanticStatus !== "needs_review";
}
