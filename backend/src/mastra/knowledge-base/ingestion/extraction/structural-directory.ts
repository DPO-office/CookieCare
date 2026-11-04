import { sourceLocations, type CandidateStructure, type CandidateSegment } from "./structure-provider.js";
import type { SourceMap } from "./source-map.js";
import { isSubstantiveZone, trimRangeToSubstantiveSpans } from "./layout-zones.js";
import { classifySubMarker, discoverContainerSkeleton, inferDocumentGrammar, SECTION_NUMBER_TOKEN_SOURCE, type SubProvisionMarkerClass } from "./document-grammar.js";

export function normalizeStructureType(type: string | null): string | null {
  if (!type) return type;
  const normalized = type.toLowerCase().trim().replace(/[ -]+/gu, "_");
  if (/^(?:statute_)?citation(?:_fragment)?$/u.test(normalized) || normalized === "reference") return null;
  if (/^(?:chapter|part|title|division|schedule|annex)_?heading$/u.test(normalized)) return normalized.replace(/_?heading$/u, "");
  if (/^(?:penalty_)?table_?row(?:_|$)/u.test(normalized)) return "table_row";
  if (/^(?:penalty_)?table(?:_|$)/u.test(normalized)) return "table";
  if (/^(?:legal_provision_)?(?:list_)?(?:point|item)$/u.test(normalized)) return "point";
  if (/^sub(?:_|\s*)?section(?:[_\s(].*)?$/iu.test(normalized) || /^subdivision(?:[_\s(].*)?$/iu.test(normalized)) return "subsection";
  if (/^sub(?:_|\s*)?paragraph(?:[_\s(].*)?$/iu.test(normalized)) return "point";
  if (/^paragraph(?:[_\s(].*)?$/iu.test(normalized)) return "paragraph";
  if (/^clause(?:[_\s(].*)?$/iu.test(normalized)) return "point";
  if (/^sub(?:_|\s*)?clause(?:[_\s(].*)?$/iu.test(normalized)) return "point";
  if (/^illustration(?:s)?(?:[_\s(].*)?$/iu.test(normalized)) return "illustration";
  if (/^explanation(?:s)?(?:[_\s(].*)?$/iu.test(normalized)) return "explanation";
  if (/^proviso(?:s)?(?:[_\s(].*)?$/iu.test(normalized)) return "proviso";
  if (/^definition(?:s)?(?:[_\s(].*)?$/iu.test(normalized)) return "definition";
  return ({ tablerow: "table_row", sub_section: "subsection", list_point: "point",
    definitions: "definition", preamble: "recital", long_title: "recital", enacting_formula: "recital",
    explanations: "explanation", provisos: "proviso", illustrations: "illustration" } as Record<string, string>)[normalized] ?? normalized;
}

const heading = new RegExp(`^(section|article|rule)\\s+(${SECTION_NUMBER_TOKEN_SOURCE})\\b`, "iu");
const bareSectionRe = new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.(?:\\s+|$)`, "iu");
const hintKey = (hint: string) => hint.toLowerCase().trim()
  .replace(/^(sec|art)\b/u, token => token === "sec" ? "section" : "article")
  .replace(/^(sec|art)_/u, token => token === "sec_" ? "section " : "article ")
  .replace(/[_\s]+/gu, " ").replace(/[.:]$/u, "");

/** Source-ordered directory. A model-local ID is only a hint, never an identity. */
export function repairStructuralDirectory(map: SourceMap, input: CandidateStructure): CandidateStructure {
  // Never turn a quarantined/empty extraction into a successful-looking structure.
  if (!input.segments.length) return input;
  const warnings = [...(input.warnings ?? [])];
  let segments: CandidateSegment[] = input.segments.map(segment => {
    const orig = segment.originalType ?? segment.type;
    let norm = normalizeStructureType(segment.type);
    const segRaw = map.text.slice(segment.span.start, segment.span.end).trimStart();
    if (orig === "explanation" || /^explanation/iu.test(segRaw)) norm = "explanation";
    else if (orig === "proviso" || /^provideds+(?:furthers+|alsos+)?that/iu.test(segRaw)) norm = "proviso";
    return { ...segment, originalType: orig, type: norm, children: [...segment.children] };
  });
  const droppedNonSubstantive = new Map<string, string | null>();
  for (const segment of segments) {
    const trimmed = trimRangeToSubstantiveSpans(map, segment.span);
    if (!trimmed) {
      droppedNonSubstantive.set(segment.id, segment.parent);
      warnings.push(`non_substantive_layout_segment_dropped:${segment.id}`);
      continue;
    }
    if (trimmed.start !== segment.span.start || trimmed.end !== segment.span.end) {
      segment.span = trimmed;
      segment.sourceSpans = sourceLocations(map, trimmed);
      if (segment.code && (segment.code.start < trimmed.start || segment.code.end > trimmed.end)) segment.code = null;
      if (segment.title && (segment.title.start < trimmed.start || segment.title.end > trimmed.end)) segment.title = null;
    }
  }
  if (droppedNonSubstantive.size > 0) {
    const resolveDropped = (id: string | null): string | null => {
      let cur = id;
      const seen = new Set<string>();
      while (cur && droppedNonSubstantive.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = droppedNonSubstantive.get(cur) ?? null;
      }
      return cur && !droppedNonSubstantive.has(cur) ? cur : null;
    };
    segments = segments.filter(s => !droppedNonSubstantive.has(s.id)).map(s => {
      const nextParent = resolveDropped(s.parent);
      return { ...s, parent: nextParent !== s.id ? nextParent : null };
    });
  }
  const text = (segment: CandidateSegment) => map.text.slice(segment.span.start, segment.span.end).trimStart();
  const trimEnd = (start: number, end: number) => {
    const rawEnd = start + map.text.slice(start, end).trimEnd().length;
    return trimRangeToSubstantiveSpans(map, { start, end: rawEnd })?.end ?? rawEnd;
  };
  // Pass 0: Reconcile global Title / Part / Chapter / Division container skeleton and merge split title-only blocks.
  const containerOutline = discoverContainerSkeleton(map);
  const outlineSegments: CandidateSegment[] = [];
  const earlyRedirects = new Map<string, string>();
  for (const node of containerOutline) {
    let canonicalSeg = segments.find(s =>
      s.span.start === node.codeRange.start &&
      (s.type === node.kind || s.type === "unknown" || s.type === null ||
       ["chapter", "part", "title", "division"].includes(s.type)));
    if (!canonicalSeg) {
      canonicalSeg = {
        id: `source-container:${node.kind}:${node.codeRange.start}`,
        kind: "container",
        type: node.kind,
        category: null,
        parent: null,
        children: [],
        span: node.span,
        code: node.codeRange,
        title: node.titleRange,
        sourceSpans: sourceLocations(map, node.span),
      };
      segments.push(canonicalSeg);
      warnings.push(`container_recovered_from_source:${canonicalSeg.id}`);
    } else {
      const prevSpan = canonicalSeg.span;
      const prevWasSameKind = canonicalSeg.type === node.kind;
      canonicalSeg.kind = "container";
      canonicalSeg.type = node.kind;
      canonicalSeg.code = node.codeRange;
      const existingTitleValid = canonicalSeg.title &&
        canonicalSeg.title.start >= node.codeRange.start &&
        canonicalSeg.title.end <= node.headerEnd;
      canonicalSeg.title = node.titleRange ?? (existingTitleValid ? canonicalSeg.title : null);
      const hasLaterPrimaryUnit = map.spans.some(s =>
        s.kind === "text" && isSubstantiveZone(s.layoutZone) &&
        s.start >= prevSpan.end && s.end <= node.span.end &&
        (heading.test(map.text.slice(s.start, s.end).trimStart()) ||
         bareSectionRe.test(map.text.slice(s.start, s.end).trimStart()) ||
         Boolean(s.marker?.trim())));
      const resolvedEnd = prevWasSameKind && prevSpan.end > node.headerEnd && prevSpan.end <= node.span.end && !hasLaterPrimaryUnit
        ? prevSpan.end
        : node.span.end;
      canonicalSeg.span = { start: node.span.start, end: resolvedEnd };
      canonicalSeg.sourceSpans = sourceLocations(map, canonicalSeg.span);
      canonicalSeg.startsBeforeChunk = false;
      canonicalSeg.continuesAfterChunk = false;
    }
    outlineSegments.push(canonicalSeg);
    // Redirect split title-only or duplicate header-only segments inside [codeRange.start, headerEnd]
    for (const other of segments) {
      if (other.id === canonicalSeg.id) continue;
      if (other.span.start >= node.codeRange.start && other.span.end <= node.headerEnd) {
        earlyRedirects.set(other.id, canonicalSeg.id);
      }
    }
  }
  for (let idx = 0; idx < containerOutline.length; idx++) {
    const parentIdx = containerOutline[idx]!.parentIndex;
    if (parentIdx !== null && outlineSegments[parentIdx]) {
      outlineSegments[idx]!.parent = outlineSegments[parentIdx]!.id;
    }
  }
  if (earlyRedirects.size > 0) {
    const resolveEarly = (id: string): string => {
      const seen = new Set<string>();
      let cur = id;
      while (earlyRedirects.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = earlyRedirects.get(cur)!;
      }
      return cur;
    };
    segments = segments.filter(s => !earlyRedirects.has(s.id)).map(s => ({
      ...s,
      parent: s.parent && resolveEarly(s.parent) !== s.id ? resolveEarly(s.parent) : null,
    }));
  }

  const numbered = segments.filter(segment => ["section", "article", "rule"].includes(segment.type ?? "") &&
    bareSectionRe.test(text(segment)));
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
  const grammar = inferDocumentGrammar(map, segments);
  const convention = dominant && dominant[1] >= 3 && dominant[1] / numbered.length >= 0.8
    ? dominant[0] as "section" | "article" | "rule" : null;
  const combinedOpeningRe = new RegExp(`^${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*\\(\\s*[A-Za-z0-9]+\\s*\\)`, "iu");
  const openings = map.spans.filter(span => span.kind === "text" && isSubstantiveZone(span.layoutZone) &&
    !["page_header", "page_footer"].includes(span.blockType ?? "") && !span.parentRef?.startsWith("#/tables/"))
    .flatMap(span => {
      const raw = map.text.slice(span.start, span.end);
      const explicit = heading.exec(raw.trimStart());
      const marker = new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.$`, "iu").exec(span.marker?.trim() ?? "");
      const bare = new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.\\s+`, "iu").exec(raw.trimStart());
      const number = explicit?.[2] ?? (marker && bare ? `${marker[1]}.${bare[1]}` : (marker?.[1] ?? bare?.[1]));
      const same = segments.find(s => s.span.start === span.start && ["section", "article", "rule"].includes(s.type ?? ""));
      const kind = explicit?.[1].toLowerCase()
        ?? convention
        ?? same?.type
        ?? (combinedOpeningRe.test(raw.trimStart()) ? grammar.primaryUnitKind : null);
      if (!number || !kind || !["section", "article", "rule"].includes(kind)) return [];
      // In Article-based documents (e.g. GDPR), bare "1. " inside an Article is a paragraph, not a top-level Section
      if (!explicit && !marker && kind === "article" && !same) return [];
      return [{ start: span.start + raw.search(/\S/u), end: span.end, number: number.toLowerCase(),
        kind: kind as "section" | "article" | "rule" }];
    }).sort((a, b) => a.start - b.start);
  const firstSubClass = grammar.hierarchyOrder[0] ?? "num_paren";
  const firstSubType = grammar.levelTypes[firstSubClass] ?? "subsection";
  const combinedFirstSubRe = firstSubClass === "lower_alpha"
    ? new RegExp(`^(?:(?:section|article|rule)\\s+)?${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*\\(\\s*[a-z]\\s*\\)`, "iu")
    : new RegExp(`^(?:(?:section|article|rule)\\s+)?${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*\\(\\s*\\d+[a-z]?\\s*\\)`, "iu");
  const directFirstSubRe = firstSubClass === "lower_alpha"
    ? /^\(\s*[a-z]\s*\)/u
    : /^\(\s*\d+[a-z]?\s*\)/iu;
  for (const opening of openings) {
    const next = openings.find(o => o.start > opening.start && o.kind === opening.kind && o.number !== opening.number);
    const structuralEnd = segments.filter(s => s.span.start > opening.start &&
      ["chapter", "part", "title", "division", "schedule", "annex"].includes(s.type ?? "")).sort((a, b) => a.span.start - b.span.start)[0]?.span.start;
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
    // Parent top-level unit into its enclosing Chapter / Part / Title / Division outline container
    if (!container.parent || !segments.some(s => s.id === container!.parent && s.span.start <= container!.span.start && s.span.end >= container!.span.end)) {
      const enclosingOutline = outlineSegments
        .filter(o => o.span.start <= container!.span.start && o.span.end >= container!.span.end)
        .sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
      if (enclosingOutline) container.parent = enclosingOutline.id;
    }
    // A complete source directory provides the container boundary independently of chunk edges.
    if (next || structuralEnd) { container.startsBeforeChunk = false; container.continuesAfterChunk = false; }
    if (combinedFirstSubRe.test(text(container)) || directFirstSubRe.test(text(container))) {
      let child = segments.find(s => s.id !== container!.id && s.span.start === opening.start &&
        ["subsection", "paragraph", "point"].includes(s.type ?? ""));
      if (!child) {
        const nearby = segments.find(s => s.id !== container!.id &&
          s.span.start > opening.start && s.span.start <= opening.start + 60 &&
          ["subsection", "paragraph", "point"].includes(s.type ?? "") &&
          new RegExp(`^(?:${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*)?(?:\\(\\s*(?:\\d+[a-z]?|[a-z])\\s*\\)\\s*)?$`, "iu")
            .test(map.text.slice(opening.start, s.span.start).trim()));
        if (nearby) {
          nearby.span = { start: opening.start, end: nearby.span.end };
          nearby.sourceSpans = sourceLocations(map, nearby.span);
          child = nearby;
        }
      }
      if (!child) segments.push({ ...container, id: `source-subsection:${opening.start}`, kind: "unit",
        type: firstSubType, identity: undefined, parent: container.id, children: [] });
    }
  }
  // A repeated section opening is not a subsection: e.g. "2. In this Act" must not become 2(2).
  const redirects = new Map<string, string>();
  for (const child of segments) {
    const container = segments.find(s => s.id !== child.id && s.identity && s.span.start === child.span.start);
    if (container && ["section", "article", "rule"].includes(child.type ?? "")) {
      redirects.set(child.id, container.id); continue;
    }
    if (container && (!child.type || child.type === "unknown") &&
        new RegExp(`^${SECTION_NUMBER_TOKEN_SOURCE}\\.(?:\\s+(?!\\()|$)`, "iu").test(text(child))) {
      redirects.set(child.id, container.id); continue;
    }
    if (container && ["subsection", "paragraph"].includes(child.type ?? "") &&
      /^\d+[a-z]?\.(?:\s+(?!\()|$)/iu.test(text(child))) redirects.set(child.id, container.id);
  }
  segments = segments.filter(s => !redirects.has(s.id)).map(s => ({ ...s,
    parent: s.parent ? redirects.get(s.parent) ?? s.parent : null }));
  const containers = segments.filter(segment => ["section", "article", "rule", "chapter", "part", "title", "division", "schedule", "annex"].includes(segment.type ?? ""))
    .sort((a, b) => a.span.start - b.span.start);
  const key = (segment: CandidateSegment) => {
    const explicit = heading.exec(text(segment));
    const number = explicit?.[2] ?? new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.`, "iu").exec(text(segment))?.[1];
    const label = segment.code ?? segment.title;
    return segment.identity ? `${segment.identity.kind} ${segment.identity.number}` :
      number ? `${segment.type} ${number.toLowerCase()}` : label ? hintKey(map.text.slice(label.start, label.end)) : "";
  };
  // Ensure even explicit-only sections without source openings are parented into enclosing outline containers
  for (const sec of containers.filter(p => ["section", "article", "rule"].includes(p.type ?? ""))) {
    if (!sec.parent || !segments.some(s => s.id === sec.parent && s.span.start <= sec.span.start && s.span.end >= sec.span.end)) {
      const enclosingOutline = outlineSegments
        .filter(o => o.span.start <= sec.span.start && o.span.end >= sec.span.end)
        .sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
      if (enclosingOutline) sec.parent = enclosingOutline.id;
    }
  }
  // A recovered subsequent heading also bounds an earlier over-broad section,
  // or extends an under-broad section that has child clauses before the next section/chapter.
  for (const parent of containers.filter(p => ["section", "article", "rule"].includes(p.type ?? ""))) {
    if (!key(parent)) continue;
    const next = containers.find(other => other.span.start > parent.span.start &&
      (other.type === parent.type || ["chapter", "part", "schedule", "annex", "title"].includes(other.type ?? "")) &&
      key(other) && key(other) !== key(parent) && !other.startsBeforeChunk);
    if (next) {
      if (parent.span.end > next.span.start) {
        parent.span = { start: parent.span.start, end: next.span.start };
        parent.sourceSpans = sourceLocations(map, parent.span);
        warnings.push(`container_boundary_repaired:${parent.id}:before:${next.id}`);
      } else if (parent.span.end < next.span.start) {
        const trailingChildren = segments.filter(s => s.span.start >= parent.span.end && s.span.end <= next.span.start &&
          !["section", "article", "rule", "chapter", "part", "schedule", "annex", "title"].includes(s.type ?? ""));
        if (trailingChildren.length > 0) {
          parent.span = { start: parent.span.start, end: next.span.start };
          parent.sourceSpans = sourceLocations(map, parent.span);
          warnings.push(`container_boundary_extended:${parent.id}:to:${next.id}`);
        }
      }
    }
  }
  // Reattach source-numbered units within their actual section using the document's inferred hierarchy order.
  for (const container of containers.filter(s => s.identity)) {
    const children = segments.filter(s => s.id !== container.id && s.span.start >= container.span.start &&
      s.span.end <= container.span.end && !["section", "article", "rule", "chapter", "part", "title", "division", "schedule", "annex", "table", "table_row"].includes(s.type ?? ""))
      .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
    const firstLevel = children.filter(s => {
      if (!["subsection", "paragraph", "point"].includes(s.type ?? "")) return false;
      const sub = classifySubMarker(text(s));
      return sub?.markerClass === firstSubClass && (sub.markerClass !== "bare_num" || container.type === "article");
    });
    for (const child of firstLevel) {
      child.parent = container.id;
      const next = firstLevel.find(s => s.span.start > child.span.start);
      child.span = { start: child.span.start, end: trimEnd(child.span.start, next?.span.start ?? container.span.end) };
      child.sourceSpans = sourceLocations(map, child.span);
    }
    for (const child of children.filter(s => !firstLevel.includes(s))) {
      const parent = segments.find(s => s.id === child.parent);
      if (parent && (parent.span.start < container.span.start || parent.span.start >= container.span.end) &&
        !["chapter", "part", "title", "division"].includes(parent.type ?? "")) child.parent = container.id;
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
      const enclosingFirstLevel = firstLevel.filter(s => s.span.start <= child.span.start && s.span.end >= child.span.end)
        .sort((a, b) => b.span.start - a.span.start)[0];
      if (/^\s*\(\s*[A-Za-z0-9]+\s*\)/u.test(text(child)) ||
        ["definition", "illustration"].includes(child.type ?? "")) child.parent = enclosingFirstLevel?.id ?? container.id;
    }
  }
  // Unify overlapping fragments at the same numbered source opening. Different starts
  // remain distinct even if the model supplied the same label.
  const markerOf = (s: CandidateSegment) => new RegExp(`^(?:${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*)?\\(\\s*(\\d+[a-z]?|[a-z]|[ivxlcdm]+)\\s*\\)`, "iu").exec(text(s))?.[1]?.toLowerCase();
  const groups = new Map<string, CandidateSegment[]>();
  for (const s of segments.filter(s => !s.identity && markerOf(s))) {
    const k = `${s.span.start}:${markerOf(s)}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  // Sibling deduplication: if two candidate units in the same section overlap significantly, merge into the wider unit
  for (const container of containers) {
    const kids = segments.filter(s => s.parent === container.id &&
      ["subsection", "paragraph", "point", "illustration", "explanation", "proviso", "shared_text"].includes(s.type ?? ""))
      .sort((a, b) => a.span.start - b.span.start);
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]!, b = kids[j]!;
        if (b.span.start < a.span.end) {
          const overlap = Math.min(a.span.end, b.span.end) - Math.max(a.span.start, b.span.start);
          const smaller = Math.min(a.span.end - a.span.start, b.span.end - b.span.start);
          if (smaller > 0 && overlap / smaller >= 0.75) {
            const keep = a.span.end - a.span.start >= b.span.end - b.span.start ? a : b;
            const drop = keep === a ? b : a;
            keep.span = { start: Math.min(a.span.start, b.span.start), end: Math.max(a.span.end, b.span.end) };
            keep.sourceSpans = sourceLocations(map, keep.span);
            redirects.set(drop.id, keep.id);
          }
        }
      }
    }
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
  // Recover list nesting from explicit marker sequences within a bounded provision using adaptive document grammar.
  for (const container of segments.filter(s => s.identity)) {
    const units = segments.filter(s => s.id !== container.id && s.span.start >= container.span.start &&
      s.span.end <= container.span.end && !s.identity).sort((a, b) => a.span.start - b.span.start);
    const activeByDepth: Array<CandidateSegment | undefined> = [];
    const activeClassStack: SubProvisionMarkerClass[] = [];
    let prevRawMarker: string | null = null;

    for (let index = 0; index < units.length; index++) {
      const unit = units[index]!;
      if (unit.type === "illustration" || unit.type === "definition") continue;
      const nextPeek = units.slice(index + 1)
        .map(s => /^\(\s*([A-Za-z0-9]+)\s*\)/u.exec(text(s))?.[1])
        .find(Boolean) ?? null;
      const classified = classifySubMarker(text(unit), {
        prevMarker: prevRawMarker,
        nextMarker: nextPeek,
        activeClasses: activeClassStack,
      });
      if (!classified) continue;
      if (classified.markerClass === "bare_num" && container.type !== "article") continue;

      let depth = grammar.hierarchyOrder.indexOf(classified.markerClass);
      if (depth < 0) depth = grammar.hierarchyOrder.length;

      let parentSeg: CandidateSegment = container;
      for (let d = depth - 1; d >= 0; d--) {
        if (activeByDepth[d]) {
          parentSeg = activeByDepth[d]!;
          break;
        }
      }
      const genericSubTypes = new Set([
        "", "unknown", "item", "text", "provision", "observed",
        "clause", "sub_clause", "subclause", "amendment_item", "amendmentitem",
      ]);
      const rawNormType = (unit.type ?? "").toLowerCase();
      if (genericSubTypes.has(rawNormType)) {
        const unitSlice = text(unit);
        const isDefClause = /^\(\s*[a-z0-9]{1,3}\s*\)\s*["'“‘]/iu.test(unitSlice) &&
          /\b(?:means|includes|has the meaning|refers to)\b/iu.test(unitSlice.slice(0, 200));
        unit.type = isDefClause ? "definition" : (grammar.levelTypes[classified.markerClass] ?? "point");
        unit.kind = "unit";
      }
      unit.parent = parentSeg.id;
      activeByDepth[depth] = unit;
      activeByDepth.length = depth + 1;
      activeClassStack[depth] = classified.markerClass;
      activeClassStack.length = depth + 1;
      prevRawMarker = classified.marker;
    }
    // Extend source-backed list parents to their actual children, within the section.
    for (let pass = 0; pass < 3; pass++) for (const unit of units) {
      const end = Math.max(unit.span.end, ...units.filter(s => s.parent === unit.id).map(s => s.span.end));
      if (end <= container.span.end && end > unit.span.end) {
        unit.span = { start: unit.span.start, end }; unit.sourceSpans = sourceLocations(map, unit.span);
      }
    }
  }
  // Merge standalone "Illustrations." heading with the immediately following illustration
  const standaloneHeadings = segments.filter(s => s.type === "illustration" && /^\s*illustrations?\.?\s*$/iu.test(text(s)));
  for (const headingSeg of standaloneHeadings) {
    const nextIll = segments.find(s => s.id !== headingSeg.id && s.type === "illustration" &&
      s.span.start >= headingSeg.span.end && s.span.start <= headingSeg.span.end + 15);
    if (nextIll) {
      nextIll.span = { start: headingSeg.span.start, end: nextIll.span.end };
      nextIll.sourceSpans = sourceLocations(map, nextIll.span);
      redirects.set(headingSeg.id, nextIll.id);
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
  // Recover sandwich clauses (post-list wrap-up text such as shared conditions or consequences)
  const listContainers = segments.filter(s => ["section", "article", "rule", "subsection", "paragraph"].includes(s.type ?? ""));
  for (const container of listContainers) {
    const directChildren = segments.filter(s => s.parent === container.id)
      .sort((a, b) => a.span.start - b.span.start);
    const points = directChildren.filter(s => ["point", "clause", "subparagraph", "list_item"].includes(s.type ?? ""));
    if (points.length >= 2) {
      const lastPoint = points[points.length - 1]!;
      const ptText = text(lastPoint);
      const splitMatch = /^(\s*\(\s*[a-z0-9]+\s*\)[^,;]+[,;])\s+((?:for such time|shall be deemed|shall ensure|subject to)\b.*)$/isu.exec(ptText);
      if (splitMatch) {
        const splitOffset = lastPoint.span.start + ptText.indexOf(splitMatch[2]!);
        const wrapSpan = { start: splitOffset, end: lastPoint.span.end };
        lastPoint.span = { start: lastPoint.span.start, end: splitOffset };
        lastPoint.sourceSpans = sourceLocations(map, lastPoint.span);
        segments.push({
          id: `source-shared:${container.id}:${splitOffset}`,
          kind: "unit",
          type: "shared_text",
          category: null,
          parent: container.id,
          children: [],
          span: wrapSpan,
          code: null,
          title: null,
          sourceSpans: sourceLocations(map, wrapSpan),
        });
      } else if (lastPoint.span.end < container.span.end) {
        const trailing = map.text.slice(lastPoint.span.end, container.span.end);
        const substantiveStart = lastPoint.span.end + trailing.search(/\S/u);
        const trailingTrim = trailing.trim();
        if (trailingTrim &&
            !/^\s*(?:\(\s*[A-Za-z0-9]+\s*\)|\d+(?:\.\d+)*[a-z]?\.\s|Illustrations?\.?|Explanation\.?|Provided\b)/iu.test(trailingTrim) &&
            !segments.some(s => s.parent === container.id && s.span.start >= lastPoint.span.end)) {
          const wrapSpan = { start: substantiveStart, end: container.span.end };
          segments.push({
            id: `source-shared:${container.id}:${substantiveStart}`,
            kind: "unit",
            type: "shared_text",
            category: null,
            parent: container.id,
            children: [],
            span: wrapSpan,
            code: null,
            title: null,
            sourceSpans: sourceLocations(map, wrapSpan),
          });
        }
      }
    }
  }
  // Scoped explanation, proviso, and clause-illustration parenting
  for (const segment of segments) {
    if (segment.type === "explanation" || /^\s*explanation\b/iu.test(text(segment))) {
      const segSlice = text(segment);
      if (/\bfor the purposes? of this (?:clause|point|sub-?clause)\b/iu.test(segSlice)) {
        const sibling = segments
          .filter(s => s.id !== segment.id && s.span.start < segment.span.start && ["point", "clause", "subparagraph", "list_item"].includes(s.type ?? ""))
          .sort((a, b) => b.span.start - a.span.start)[0];
        if (sibling) {
          segment.parent = sibling.id;
          const nextIll = segments.find(s => s.id !== segment.id && s.type === "illustration" &&
            s.span.start >= segment.span.end && s.span.start <= segment.span.end + 400 &&
            !/^\s*(?:illustrations?\.?\s*)?\(\s*[ivxlcdm\d]+\s*\)/iu.test(text(s)));
          if (nextIll) nextIll.parent = sibling.id;
        }
      } else if (/\bfor the purpose[s]? of this sub-?section\b/iu.test(segSlice)) {
        const sub = segments
          .filter(c => c.id !== segment.id && c.span.start <= segment.span.start && c.span.end >= segment.span.end && ["subsection", "paragraph"].includes(c.type ?? ""))
          .sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
        if (sub) segment.parent = sub.id;
      }
    }
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
  const liveSegmentIds = new Set(segments.map(segment => segment.id));
  for (const segment of segments) segment.children = segments.filter(child => child.parent === segment.id).map(child => child.id);
  return { ...input, segments, warnings, references: (input.references ?? []).map(r => ({ ...r,
    targetSegmentIds: [...new Set(r.targetSegmentIds.map(canonical).filter(id => liveSegmentIds.has(id)))] })) };
}
