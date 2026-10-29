import { sourceLocations, type CandidateStructure, type CandidateSegment } from "./structure-provider.js";
import type { SourceMap } from "./source-map.js";

export function normalizeStructureType(type: string | null): string | null {
  if (!type) return type;
  const normalized = type.toLowerCase().trim().replace(/[ -]+/gu, "_");
  return ({ tablerow: "table_row", sub_section: "subsection", list_point: "point" } as Record<string, string>)[normalized] ?? normalized;
}

const heading = /^(section|article|rule)\s+([0-9]+[a-z]?|[ivxlcdm]+)\b/iu;
const hintKey = (hint: string) => hint.toLowerCase().trim()
  .replace(/^(sec|art)\b/u, token => token === "sec" ? "section" : "article")
  .replace(/^(sec|art)_/u, token => token === "sec_" ? "section " : "article ")
  .replace(/[_\s]+/gu, " ").replace(/[.:]$/u, "");

/** Source-ordered directory. A model-local ID is only a hint, never an identity. */
export function repairStructuralDirectory(map: SourceMap, input: CandidateStructure): CandidateStructure {
  const warnings = [...input.warnings];
  const segments = input.segments.map(segment => ({ ...segment, type: normalizeStructureType(segment.type),
    children: [...segment.children] }));
  const text = (segment: CandidateSegment) => map.text.slice(segment.span.start, segment.span.end).trimStart();
  const numbered = segments.filter(segment => ["section", "article", "rule"].includes(segment.type ?? "") &&
    /^\d+[a-z]?\./iu.test(text(segment)));
  const counts = new Map<string, number>();
  for (const segment of numbered) counts.set(segment.type!, (counts.get(segment.type!) ?? 0) + 1);
  const dominant = [...counts].sort((a, b) => b[1] - a[1])[0];
  for (const segment of segments) {
    const explicit = heading.exec(text(segment));
    if (explicit && ["section", "article", "rule"].includes(segment.type ?? "")) segment.type = explicit[1]!.toLowerCase();
    else if (dominant && dominant[1] >= 3 && dominant[1] / numbered.length >= 0.8 && numbered.includes(segment) &&
      segment.type !== dominant[0]) {
      warnings.push(`structure_type_corrected_from_document_pattern:${segment.id}:${segment.type}->${dominant[0]}; review required`);
      segment.type = dominant[0];
    }
  }
  const containers = segments.filter(segment => ["section", "article", "rule", "chapter", "part", "schedule", "annex"].includes(segment.type ?? ""))
    .sort((a, b) => a.span.start - b.span.start);
  const key = (segment: CandidateSegment) => {
    const explicit = heading.exec(text(segment));
    const number = explicit?.[2] ?? /^(\d+[a-z]?)\./iu.exec(text(segment))?.[1];
    const label = segment.code ?? segment.title;
    return number ? `${segment.type} ${number.toLowerCase()}` : label ? hintKey(map.text.slice(label.start, label.end)) : "";
  };
  // A recovered subsequent heading also bounds an earlier over-broad section.
  // Repeated headings of the same identity may be continuations, not new sections.
  for (const parent of containers.filter(p => ["section", "article", "rule"].includes(p.type ?? ""))) {
    if (!key(parent)) continue;
    const next = containers.find(other => other.span.start > parent.span.start && other.type === parent.type &&
      key(other) && key(other) !== key(parent) && !other.startsBeforeChunk);
    if (next && parent.span.end > next.span.start) {
      parent.span = { start: parent.span.start, end: next.span.start };
      parent.sourceSpans = sourceLocations(map, parent.span);
      warnings.push(`container_boundary_repaired:${parent.id}:before:${next.id}`);
    }
  }
  for (const segment of segments) {
    if (segment.parent || !segment.parentHint) continue;
    const expected = hintKey(segment.parentHint);
    const matches = containers.filter(parent => {
      if (parent.id === segment.id || key(parent) !== expected || parent.span.start > segment.span.start) return false;
      const next = containers.find(other => other.span.start > parent.span.start &&
        (other.type === parent.type || ["chapter", "part", "schedule", "annex"].includes(other.type ?? "")));
      return segment.span.end <= (next?.span.start ?? map.text.length);
    });
    if (matches.length !== 1) continue;
    const parent = matches[0]!;
    segment.parent = parent.id;
    parent.span = { start: parent.span.start, end: Math.max(parent.span.end, segment.span.end) };
    parent.sourceSpans = sourceLocations(map, parent.span);
    warnings.push(`parent_repaired_from_source_directory:${segment.id}->${parent.id}`);
  }
  for (const segment of segments) segment.children = segments.filter(child => child.parent === segment.id).map(child => child.id);
  return { ...input, segments, warnings };
}
