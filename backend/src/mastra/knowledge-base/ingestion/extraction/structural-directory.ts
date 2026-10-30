import { sourceLocations, type CandidateStructure, type CandidateSegment } from "./structure-provider.js";
import type { SourceMap } from "./source-map.js";

export function normalizeStructureType(type: string | null): string | null {
  if (!type) return type;
  const normalized = type.toLowerCase().trim().replace(/[ -]+/gu, "_");
  if (/^(?:chapter|part|title|schedule|annex)_?heading$/u.test(normalized)) return normalized.replace(/_?heading$/u, "");
  if (/^(?:penalty_)?table_?row(?:_|$)/u.test(normalized)) return "table_row";
  if (/^(?:penalty_)?table(?:_|$)/u.test(normalized)) return "table";
  return ({ tablerow: "table_row", sub_section: "subsection", list_point: "point",
    explanation: "paragraph", illustrations: "illustration" } as Record<string, string>)[normalized] ?? normalized;
}

const heading = /^(section|article|rule)\s+([0-9]+[a-z]?|[ivxlcdm]+)\b/iu;
const hintKey = (hint: string) => hint.toLowerCase().trim()
  .replace(/^(sec|art)\b/u, token => token === "sec" ? "section" : "article")
  .replace(/^(sec|art)_/u, token => token === "sec_" ? "section " : "article ")
  .replace(/[_\s]+/gu, " ").replace(/[.:]$/u, "");

/** Source-ordered directory. A model-local ID is only a hint, never an identity. */
export function repairStructuralDirectory(map: SourceMap, input: CandidateStructure): CandidateStructure {
  // Never turn a quarantined/empty extraction into a successful-looking structure.
  if (!input.segments.length) return input;
  const warnings = [...input.warnings];
  let segments: CandidateSegment[] = input.segments.map(segment => ({ ...segment,
    originalType: segment.originalType ?? segment.type, type: normalizeStructureType(segment.type),
    children: [...segment.children] }));
  const text = (segment: CandidateSegment) => map.text.slice(segment.span.start, segment.span.end).trimStart();
  const trimEnd = (start: number, end: number) => start + map.text.slice(start, end).trimEnd().length;
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
  // Recover containers from source openings, including Docling's out-of-text marker.
  // Bare numbers require an established document convention; tables and furniture are excluded.
  const convention = dominant && dominant[1] >= 3 && dominant[1] / numbered.length >= 0.8
    ? dominant[0] as "section" | "article" | "rule" : null;
  const openings = map.spans.filter(span => span.kind === "text" &&
    !["page_header", "page_footer"].includes(span.blockType ?? "") && !span.parentRef?.startsWith("#/tables/"))
    .flatMap(span => {
      const raw = map.text.slice(span.start, span.end);
      const explicit = heading.exec(raw.trimStart());
      const marker = /^(\d+[a-z]?)\.$/iu.exec(span.marker?.trim() ?? "");
      const bare = /^(\d+[a-z]?)\.\s+/iu.exec(raw.trimStart());
      const number = explicit?.[2] ?? marker?.[1] ?? bare?.[1];
      const same = segments.find(s => s.span.start === span.start && ["section", "article", "rule"].includes(s.type ?? ""));
      const kind = explicit?.[1].toLowerCase() ?? convention ?? same?.type;
      if (!number || !kind || !["section", "article", "rule"].includes(kind)) return [];
      return [{ start: span.start + raw.search(/\S/u), end: span.end, number: number.toLowerCase(),
        kind: kind as "section" | "article" | "rule" }];
    }).sort((a, b) => a.start - b.start);
  for (const opening of openings) {
    const next = openings.find(o => o.start > opening.start && o.kind === opening.kind && o.number !== opening.number);
    const structuralEnd = segments.filter(s => s.span.start > opening.start &&
      ["chapter", "part", "schedule", "annex"].includes(s.type ?? "")).sort((a, b) => a.span.start - b.span.start)[0]?.span.start;
    const end = trimEnd(opening.start, Math.min(next?.start ?? map.text.length, structuralEnd ?? map.text.length));
    let container = segments.find(s => s.span.start === opening.start && s.type === opening.kind);
    if (!container) {
      container = { id: `source-container:${opening.kind}:${opening.start}`, kind: "container", type: opening.kind,
        category: null, parent: null, children: [], span: { start: opening.start, end }, code: null, title: null,
        sourceSpans: sourceLocations(map, { start: opening.start, end }) };
      segments.push(container);
      warnings.push(`container_recovered_from_source:${container.id}`);
    }
    container.identity = { kind: opening.kind, number: opening.number, subpoints: [] };
    container.span = { start: opening.start, end };
    container.sourceSpans = sourceLocations(map, container.span);
    // A complete source directory provides the container boundary independently of chunk edges.
    if (next || structuralEnd) { container.startsBeforeChunk = false; container.continuesAfterChunk = false; }
    if (/^\d+[a-z]?\.\s*\(\s*\d+[a-z]?\s*\)/iu.test(text(container)) ||
      /^\(\s*\d+[a-z]?\s*\)/iu.test(text(container))) {
      const child = segments.find(s => s.id !== container!.id && s.span.start === opening.start &&
        ["subsection", "paragraph"].includes(s.type ?? ""));
      if (!child) segments.push({ ...container, id: `source-subsection:${opening.start}`, kind: "unit",
        type: "subsection", identity: undefined, parent: container.id, children: [] });
    }
  }
  // A repeated section opening is not a subsection: e.g. "2. In this Act" must not become 2(2).
  const redirects = new Map<string, string>();
  for (const child of segments) {
    const container = segments.find(s => s.id !== child.id && s.identity && s.span.start === child.span.start);
    if (container && ["section", "article", "rule"].includes(child.type ?? "")) {
      redirects.set(child.id, container.id); continue;
    }
    if (container && ["subsection", "paragraph"].includes(child.type ?? "") &&
      /^\d+[a-z]?\.\s+(?!\()/iu.test(text(child))) redirects.set(child.id, container.id);
  }
  segments = segments.filter(s => !redirects.has(s.id)).map(s => ({ ...s,
    parent: s.parent ? redirects.get(s.parent) ?? s.parent : null }));
  const containers = segments.filter(segment => ["section", "article", "rule", "chapter", "part", "schedule", "annex"].includes(segment.type ?? ""))
    .sort((a, b) => a.span.start - b.span.start);
  const key = (segment: CandidateSegment) => {
    const explicit = heading.exec(text(segment));
    const number = explicit?.[2] ?? /^(\d+[a-z]?)\./iu.exec(text(segment))?.[1];
    const label = segment.code ?? segment.title;
    return segment.identity ? `${segment.identity.kind} ${segment.identity.number}` :
      number ? `${segment.type} ${number.toLowerCase()}` : label ? hintKey(map.text.slice(label.start, label.end)) : "";
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
  // Reattach source-numbered units within their actual section. A display title is never numbering.
  for (const container of containers.filter(s => s.identity)) {
    const children = segments.filter(s => s.id !== container.id && s.span.start >= container.span.start &&
      s.span.end <= container.span.end && !["section", "article", "rule", "chapter", "part", "schedule", "annex", "table", "table_row"].includes(s.type ?? ""))
      .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
    const numeric = children.filter(s => /^\s*(?:\d+[a-z]?\.\s*)?\(\s*\d+[a-z]?\s*\)/iu.test(text(s)) &&
      ["subsection", "paragraph"].includes(s.type ?? ""));
    for (const child of numeric) {
      child.parent = container.id;
      const next = numeric.find(s => s.span.start > child.span.start);
      child.span = { start: child.span.start, end: trimEnd(child.span.start, next?.span.start ?? container.span.end) };
      child.sourceSpans = sourceLocations(map, child.span);
    }
    for (const child of children.filter(s => !numeric.includes(s))) {
      const parent = segments.find(s => s.id === child.parent);
      if (parent && (parent.span.start < container.span.start || parent.span.start >= container.span.end) &&
        !["chapter", "part", "title"].includes(parent.type ?? "")) child.parent = container.id;
      if (parent && parent.id !== container.id && parent.span.start < child.span.start &&
        parent.span.start >= container.span.start && parent.span.start < container.span.end) {
        // Keep a source-ordered parent even when its extracted span needs extension.
        const nextSibling = children.filter(s => s.parent === parent.parent && s.id !== parent.id && s.span.start > parent.span.start)
          .sort((a, b) => a.span.start - b.span.start)[0];
        if (child.span.end <= (nextSibling?.span.start ?? container.span.end)) {
          parent.span = { start: parent.span.start, end: Math.max(parent.span.end, child.span.end) };
          parent.sourceSpans = sourceLocations(map, parent.span); continue;
        }
      }
      const subsection = numeric.filter(s => s.span.start <= child.span.start && s.span.end >= child.span.end)
        .sort((a, b) => b.span.start - a.span.start)[0];
      if (/^\s*\(\s*[a-zivxlcdm]+\s*\)/iu.test(text(child)) ||
        ["definition", "illustration"].includes(child.type ?? "")) child.parent = subsection?.id ?? container.id;
    }
  }
  // Unify overlapping fragments at the same numbered source opening. Different starts
  // remain distinct even if the model supplied the same label.
  const markerOf = (s: CandidateSegment) => /^(?:\d+[a-z]?\.\s*)?\(\s*(\d+[a-z]?|[a-z]|[ivxlcdm]+)\s*\)/iu.exec(text(s))?.[1]?.toLowerCase();
  const groups = new Map<string, CandidateSegment[]>();
  for (const s of segments.filter(s => !s.identity && markerOf(s))) {
    const k = `${s.span.start}:${markerOf(s)}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  for (const group of groups.values()) if (group.length > 1) {
    group.sort((a, b) => Number(b.type === "definition") - Number(a.type === "definition") || b.span.end - a.span.end);
    for (const alias of group.slice(1)) redirects.set(alias.id, group[0]!.id);
  }
  const canonical = (id: string): string => {
    const seen = new Set<string>();
    while (redirects.has(id) && !seen.has(id)) { seen.add(id); id = redirects.get(id)!; }
    return id;
  };
  segments = segments.filter(s => !redirects.has(s.id)).map(s => ({ ...s,
    parent: s.parent && canonical(s.parent) !== s.id ? canonical(s.parent) : null }));
  // Recover list nesting from explicit marker sequences within a bounded provision.
  // Preserve case: (B) nested under (ii) is not the sibling (b).
  for (const container of segments.filter(s => s.identity)) {
    const units = segments.filter(s => s.id !== container.id && s.span.start >= container.span.start &&
      s.span.end <= container.span.end && !s.identity).sort((a, b) => a.span.start - b.span.start);
    let numeric: CandidateSegment | undefined, letter: CandidateSegment | undefined, roman: CandidateSegment | undefined;
    for (let index = 0; index < units.length; index++) {
      const unit = units[index]!;
      const marker = /^(?:\d+[a-z]?\.\s*)?\(\s*([A-Za-z0-9]+)\s*\)/u.exec(text(unit))?.[1];
      if (!marker || unit.type === "illustration" || unit.type === "definition") continue;
      if (/^\d+[a-z]?$/iu.test(marker)) { numeric = unit; letter = undefined; roman = undefined; continue; }
      const nextMarker = units.slice(index + 1).map(s => /^\(\s*([A-Za-z0-9]+)\s*\)/u.exec(text(s))?.[1]).find(Boolean);
      const isRoman = /^[ivxlcdm]+$/u.test(marker) && (marker.length > 1 || marker === "i" && nextMarker === "ii" || !!roman && marker !== "c" && marker !== "d");
      if (isRoman && letter) { unit.parent = letter.id; roman = unit; }
      else if (/^[A-Z]$/u.test(marker) && roman) unit.parent = roman.id;
      else if (/^[a-z]$/u.test(marker) && !isRoman) {
        unit.parent = numeric?.id ?? container.id; letter = unit; roman = undefined;
      }
    }
    // Extend source-backed list parents to their actual children, within the section.
    for (let pass = 0; pass < 3; pass++) for (const unit of units) {
      const end = Math.max(unit.span.end, ...units.filter(s => s.parent === unit.id).map(s => s.span.end));
      if (end <= container.span.end && end > unit.span.end) {
        unit.span = { start: unit.span.start, end }; unit.sourceSpans = sourceLocations(map, unit.span);
      }
    }
  }
  // A heading fragment plus overlapping/adjacent unnumbered body is one illustration.
  const illustrations = segments.filter(s => s.type === "illustration" && !/^\s*\(/u.test(text(s)))
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  for (const left of illustrations) for (const right of illustrations) {
    if (left === right || redirects.has(left.id) || redirects.has(right.id) || left.parent !== right.parent || right.span.start < left.span.start) continue;
    if (right.span.start > left.span.end && map.text.slice(left.span.end, right.span.start).trim()) continue;
    left.span = { start: left.span.start, end: Math.max(left.span.end, right.span.end) };
    left.sourceSpans = sourceLocations(map, left.span); redirects.set(right.id, left.id);
  }
  segments = segments.filter(s => !redirects.has(s.id)).map(s => ({ ...s,
    parent: s.parent && canonical(s.parent) !== s.id ? canonical(s.parent) : null }));
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
  for (const parent of containers.filter(p => ["section", "article", "rule"].includes(p.type ?? ""))) {
    const childEnd = Math.max(parent.span.end, ...segments.filter(child => child.parent === parent.id)
      .map(child => child.span.end));
    const next = containers.find(other => other.id !== parent.id && other.span.start > parent.span.start &&
      (other.type === parent.type || ["chapter", "part", "schedule", "annex"].includes(other.type ?? "")));
    if (childEnd > parent.span.end && (!next || childEnd <= next.span.start)) {
      parent.span = { start: parent.span.start, end: childEnd };
      parent.sourceSpans = sourceLocations(map, parent.span);
      warnings.push(`container_extended_to_child_boundary:${parent.id}`);
    }
  }
  for (const segment of segments) segment.children = segments.filter(child => child.parent === segment.id).map(child => child.id);
  return { ...input, segments, warnings, references: input.references.map(r => ({ ...r,
    targetSegmentIds: [...new Set(r.targetSegmentIds.map(canonical))] })) };
}
