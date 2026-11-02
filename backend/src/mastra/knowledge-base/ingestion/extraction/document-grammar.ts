import { isSubstantiveZone, normalizeSpanBox } from "./layout-zones.js";
import type { SourceMap, SourceSpan } from "./source-map.js";
import type { CandidateSegment } from "./structure-provider.js";

export type ContainerKind = "title" | "part" | "chapter" | "division";

export interface ContainerOutlineNode {
  kind: ContainerKind;
  rank: number;
  number: string;
  codeRange: { start: number; end: number };
  titleRange: { start: number; end: number } | null;
  headerEnd: number;
  span: { start: number; end: number };
  parentIndex: number | null;
}

export type SubProvisionMarkerClass =
  | "num_paren"
  | "bare_num"
  | "lower_alpha"
  | "upper_alpha"
  | "lower_roman"
  | "upper_roman";

export interface DocumentGrammarProfile {
  primaryUnitKind: "section" | "article" | "rule" | null;
  supportsDecimalNumbers: boolean;
  hierarchyOrder: SubProvisionMarkerClass[];
  levelTypes: Record<SubProvisionMarkerClass, "subsection" | "paragraph" | "point" | "subparagraph">;
}

const CONTAINER_RANK: Record<ContainerKind, number> = {
  title: 1,
  part: 2,
  chapter: 3,
  division: 4,
};

const ROMAN_RE = /^(?:m{0,3})(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/iu;

export function isValidRomanNumeral(value: string): boolean {
  return value.length > 0 && ROMAN_RE.test(value);
}

const CONTAINER_LINE_RE =
  /^(title|part|chapter|division)\s+([ivxlcdm]+|\d+(?:\.\d+)*[a-z]?)(?:(?:\s*[:.—–-]\s*|\s*\n\s*)([^\n]{2,160}))?$/iu;

const BACK_MATTER_LINE_RE =
  /^(?:(?:the|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:schedule|annex)|(?:schedule|annex)(?:\s+(?:[ivxlcdm]+|\d+[a-z]?))?)(?:\b|\s|[:.[—–-]|$)/iu;

function isGazetteIssueMasthead(kind: ContainerKind, inlineRest: string | undefined, rawLine: string): boolean {
  if (kind === "part" && inlineRest && /^(?:sec(?:tion|\.)\s*\d+|no\.\s*\d+)/iu.test(inlineRest.trim())) {
    return true;
  }
  if (/^\[?\s*part\s+[ivx0-9]+\s*[-–—]\s*sec/iu.test(rawLine.trim())) {
    return true;
  }
  return false;
}

function isLikelyStandaloneContainerHeading(
  map: SourceMap,
  span: SourceSpan,
  rawText: string,
  kind: ContainerKind,
  numToken: string,
): boolean {
  if (kind === "chapter" || kind === "title" || kind === "division" || kind === "part") {
    if (numToken.toLowerCase() !== numToken && !isValidRomanNumeral(numToken) && !/^\d/u.test(numToken)) {
      return false;
    }
    if (/^[ivxlcdm]+$/iu.test(numToken) && !isValidRomanNumeral(numToken)) return false;
  }
  if (span.blockType === "section_header" || span.headingLevel !== undefined) return true;
  const keywordToken = rawText.trim().split(/\s+/u)[0] ?? "";
  if (keywordToken === keywordToken.toUpperCase() && rawText.trim().length <= 160) return true;
  const pageInfo = span.page !== null ? map.pages.find(p => p.physicalPage === span.page) : undefined;
  const box = normalizeSpanBox(span, pageInfo);
  if (box && pageInfo?.width && pageInfo.width >= 200) {
    const center = (box.left + box.right) / 2;
    if (Math.abs(center - pageInfo.width / 2) <= pageInfo.width * 0.08 && rawText.trim().length <= 140) {
      return true;
    }
  }
  return false;
}

function isContinuationTitleSpan(map: SourceMap, headerSpan: SourceSpan, nextSpan: SourceSpan): boolean {
  if (nextSpan.kind !== "text" || !isSubstantiveZone(nextSpan.layoutZone)) return false;
  if (nextSpan.parentRef?.startsWith("#/tables/")) return false;
  if (headerSpan.page !== null && nextSpan.page !== null && headerSpan.page !== nextSpan.page) return false;
  if (nextSpan.marker?.trim()) return false;

  const raw = map.text.slice(nextSpan.start, nextSpan.end).trim();
  if (!raw || raw.length > 160 || !/\p{L}/u.test(raw)) return false;
  if (CONTAINER_LINE_RE.test(raw) || BACK_MATTER_LINE_RE.test(raw)) return false;
  if (/^(?:section|article|rule|illustration|illustrations|explanation|provided\s+that|whereas)\b/iu.test(raw)) return false;
  if (/^(?:\d+(?:\.\d+)*[a-z]?\s*[.)]|\(\s*(?:\d+[a-z]?|[a-z]|[ivxlcdm]+)\s*\))/iu.test(raw)) return false;

  if (nextSpan.blockType === "section_header" || nextSpan.headingLevel !== undefined) return true;
  // All-uppercase statutory chapter/part subtitle (e.g. "PRELIMINARY", "RIGHTS AND DUTIES OF DATA PRINCIPAL")
  const letters = [...raw].filter(ch => /\p{L}/u.test(ch));
  if (letters.length >= 3 && letters.every(ch => ch === ch.toUpperCase())) return true;

  return false;
}

function trimSubstantiveEnd(map: SourceMap, start: number, maxEnd: number): number {
  const candidates = map.spans.filter(span =>
    span.end > start && span.start < maxEnd && isSubstantiveZone(span.layoutZone));
  let end = candidates.length ? Math.min(maxEnd, candidates[candidates.length - 1]!.end) : maxEnd;
  while (end > start && /\s/u.test(map.text[end - 1]!)) end--;
  return Math.max(start, end);
}

/**
 * Pass 0: Deterministically discover the document's top-level container skeleton
 * (Title / Part / Chapter / Division), merging split [Container Number] + [Container Title]
 * heading spans into single containers and computing exact non-overlapping boundaries.
 */
export function discoverContainerSkeleton(map: SourceMap): ContainerOutlineNode[] {
  const mainTextSpans = map.spans.filter(span =>
    span.kind === "text" &&
    isSubstantiveZone(span.layoutZone) &&
    !["page_header", "page_footer"].includes(span.blockType ?? "") &&
    !span.parentRef?.startsWith("#/tables/"));

  const rawNodes: Omit<ContainerOutlineNode, "span" | "parentIndex">[] = [];
  const backMatterStarts: number[] = [];

  for (let i = 0; i < mainTextSpans.length; i++) {
    const span = mainTextSpans[i]!;
    if (span.start > 0 && map.text[span.start - 1] !== "\n") continue;
    const rawSlice = map.text.slice(span.start, span.end);
    const trimmed = rawSlice.trim();
    if (!trimmed) continue;

    const firstLine = (trimmed.split("\n", 1)[0] ?? "").trim();
    if (BACK_MATTER_LINE_RE.test(trimmed) &&
        (span.blockType === "section_header" || span.blockType === "caption" ||
         firstLine.length <= 100 &&
         /^(?:(?:the|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:schedule|annex)|(?:schedule|annex)(?:\s+(?:[ivxlcdm]+|\d+[a-z]?))?)(?:\s*\[[^\]]*\])?$/iu.test(firstLine))) {
      const leadOffset = span.start + rawSlice.search(/\S/u);
      backMatterStarts.push(leadOffset);
      continue;
    }

    const match = CONTAINER_LINE_RE.exec(trimmed);
    if (!match) continue;
    const kind = match[1]!.toLowerCase() as ContainerKind;
    const numberToken = match[2]!;
    const inlineTitle = match[3]?.trim();

    if (isGazetteIssueMasthead(kind, inlineTitle, trimmed)) continue;
    if (!isLikelyStandaloneContainerHeading(map, span, trimmed, kind, numberToken)) continue;

    const leadOffset = span.start + rawSlice.search(/\S/u);
    const prefixMatch = /^(?:title|part|chapter|division)\s+(?:[ivxlcdm]+|\d+(?:\.\d+)*[a-z]?)/iu.exec(trimmed)!;
    const codeRange = { start: leadOffset, end: leadOffset + prefixMatch[0].length };

    let titleRange: { start: number; end: number } | null = null;
    let headerEnd = span.start + rawSlice.trimEnd().length;

    if (inlineTitle) {
      const titleOffsetInTrimmed = trimmed.indexOf(inlineTitle, prefixMatch[0].length);
      if (titleOffsetInTrimmed >= 0) {
        titleRange = {
          start: leadOffset + titleOffsetInTrimmed,
          end: leadOffset + titleOffsetInTrimmed + inlineTitle.length,
        };
      }
    } else if (i + 1 < mainTextSpans.length && isContinuationTitleSpan(map, span, mainTextSpans[i + 1]!)) {
      const titleSpan = mainTextSpans[i + 1]!;
      const titleRaw = map.text.slice(titleSpan.start, titleSpan.end);
      const tStart = titleSpan.start + titleRaw.search(/\S/u);
      const tEnd = titleSpan.start + titleRaw.trimEnd().length;
      if (tEnd > tStart) {
        titleRange = { start: tStart, end: tEnd };
        headerEnd = tEnd;
        i++; // Consume the continuation title span so it can never be double-counted
      }
    }

    rawNodes.push({
      kind,
      rank: CONTAINER_RANK[kind],
      number: numberToken.toLowerCase(),
      codeRange,
      titleRange,
      headerEnd,
    });
  }

  if (!rawNodes.length) return [];

  // Deduplicate repeated running container headers of identical (kind, number) with no sections in between
  const deduped: typeof rawNodes = [];
  for (const node of rawNodes) {
    const prev = deduped.at(-1);
    if (prev && prev.kind === node.kind && prev.number === node.number) continue;
    deduped.push(node);
  }

  const nodes: ContainerOutlineNode[] = deduped.map((node, index) => {
    const nextPeerOrOuter = deduped.slice(index + 1).find(other => other.rank <= node.rank);
    const nextBackMatter = backMatterStarts.find(pos => pos > node.codeRange.start);
    const maxEnd = Math.min(
      nextPeerOrOuter?.codeRange.start ?? map.text.length,
      nextBackMatter ?? map.text.length,
    );
    const end = Math.max(node.headerEnd, trimSubstantiveEnd(map, node.codeRange.start, maxEnd));

    // Find nearest preceding enclosing outer container (strictly smaller rank whose end >= end)
    let parentIndex: number | null = null;
    for (let p = index - 1; p >= 0; p--) {
      if (deduped[p]!.rank < node.rank) {
        parentIndex = p;
        break;
      }
    }

    return {
      ...node,
      span: { start: node.codeRange.start, end },
      parentIndex,
    };
  });

  return nodes;
}

export const SECTION_NUMBER_TOKEN_SOURCE = "(?:\\d+(?:\\.\\d+)+[a-z]?|\\d+[a-z]?|[ivxlcdm]+)";

/** Classify a leading list/sub-provision marker token using neighbor context to separate (i) alpha vs roman. */
export function classifySubMarker(
  rawText: string,
  options?: {
    prevMarker?: string | null;
    nextMarker?: string | null;
    activeClasses?: SubProvisionMarkerClass[];
  },
): { marker: string; markerClass: SubProvisionMarkerClass } | null {
  const trimmed = rawText.trimStart();
  const combinedParen = new RegExp(
    `^(?:(?:section|article|rule)\\s+)?${SECTION_NUMBER_TOKEN_SOURCE}\\.\\s*\\(\\s*([A-Za-z0-9]+)\\s*\\)`,
    "iu",
  ).exec(trimmed);
  const directParen = /^\(\s*([A-Za-z0-9]+)\s*\)(?:\s|$|[—–-])/u.exec(trimmed);
  const token = combinedParen?.[1] ?? directParen?.[1];

  if (token) {
    if (/^\d+[a-z]?$/iu.test(token)) {
      return { marker: token.toLowerCase(), markerClass: "num_paren" };
    }
    const prev = options?.prevMarker ?? null;
    const next = options?.nextMarker ?? null;
    const active = options?.activeClasses ?? [];

    if (/^[a-z]+$/u.test(token)) {
      const validRoman = isValidRomanNumeral(token);
      if (validRoman) {
        const alphaSequenceNeighbor =
          (token === "i" && (prev === "h" || next === "j")) ||
          (token === "v" && (prev === "u" || next === "w")) ||
          (token === "x" && (prev === "w" || next === "y")) ||
          (token === "c" && (prev === "b" || next === "d") && next !== "ci") ||
          (token === "d" && (prev === "c" || next === "e")) ||
          (token === "l" && (prev === "k" || next === "m")) ||
          (token === "m" && (prev === "l" || next === "n"));
        const romanEvidence =
          token.length > 1 ||
          (token === "i" && (next === "ii" || active.includes("lower_alpha") && prev !== "h")) ||
          (active.includes("lower_roman") && !alphaSequenceNeighbor);
        if (romanEvidence && !alphaSequenceNeighbor) {
          return { marker: token, markerClass: "lower_roman" };
        }
      }
      if (token.length === 1) {
        return { marker: token, markerClass: "lower_alpha" };
      }
      if (validRoman) {
        return { marker: token, markerClass: "lower_roman" };
      }
      return null;
    }

    if (/^[A-Z]+$/u.test(token)) {
      const validRoman = isValidRomanNumeral(token);
      if (validRoman && (token.length > 1 || token === "I" && (next === "II" || active.includes("upper_alpha") && prev !== "H"))) {
        return { marker: token, markerClass: "upper_roman" };
      }
      if (token.length === 1) {
        return { marker: token, markerClass: "upper_alpha" };
      }
      if (validRoman) {
        return { marker: token, markerClass: "upper_roman" };
      }
    }
    return null;
  }

  // EU-style bare numbered paragraphs inside an Article (e.g. "1. Personal data shall be...")
  const bareNum = /^(\d+)\.\s+\p{Lu}/u.exec(trimmed);
  if (bareNum) {
    return { marker: bareNum[1]!, markerClass: "bare_num" };
  }

  return null;
}

const DEFAULT_HIERARCHY: SubProvisionMarkerClass[] = [
  "num_paren",
  "lower_alpha",
  "lower_roman",
  "upper_alpha",
];

function buildLevelTypes(
  order: SubProvisionMarkerClass[],
  primaryUnitKind: "section" | "article" | "rule" | null,
): Record<SubProvisionMarkerClass, "subsection" | "paragraph" | "point" | "subparagraph"> {
  const firstDepthType = primaryUnitKind === "article" ? "paragraph" : "subsection";
  const depthMap: Array<"subsection" | "paragraph" | "point" | "subparagraph"> = [
    firstDepthType,
    "point",
    "subparagraph",
    "subparagraph",
    "subparagraph",
    "subparagraph",
  ];
  const result: Record<SubProvisionMarkerClass, "subsection" | "paragraph" | "point" | "subparagraph"> = {
    num_paren: firstDepthType,
    bare_num: "paragraph",
    lower_alpha: "point",
    lower_roman: "subparagraph",
    upper_alpha: "subparagraph",
    upper_roman: "subparagraph",
  };
  order.forEach((cls, idx) => {
    result[cls] = depthMap[Math.min(idx, depthMap.length - 1)]!;
  });
  return result;
}

/**
 * Infer the document's numbering hierarchy directly from observed provision openings across the PDF
 * (e.g. Commonwealth `(1)->(a)->(i)->(A)` vs US CCPA `(a)->(1)->(A)->(i)` vs EU `Article -> 1.->(a)`).
 */
export function inferDocumentGrammar(
  map: SourceMap,
  segments?: CandidateSegment[],
): DocumentGrammarProfile {
  const mainSpans = map.spans.filter(span =>
    span.kind === "text" &&
    isSubstantiveZone(span.layoutZone) &&
    !["page_header", "page_footer"].includes(span.blockType ?? "") &&
    !span.parentRef?.startsWith("#/tables/"));

  const kindCounts = new Map<"section" | "article" | "rule", number>();
  let decimalSectionCount = 0;

  for (const seg of segments ?? []) {
    if (seg.type === "section" || seg.type === "article" || seg.type === "rule") {
      kindCounts.set(seg.type, (kindCounts.get(seg.type) ?? 0) + 1);
    }
  }

  const firstChildCounts = new Map<SubProvisionMarkerClass, number>();
  const transitionCounts = new Map<string, number>();

  for (let i = 0; i < mainSpans.length; i++) {
    const raw = map.text.slice(mainSpans[i]!.start, mainSpans[i]!.end).trimStart();
    const explicit = /^(section|article|rule)\s+(\d+(?:\.\d+)*[a-z]?|[ivxlcdm]+)\b/iu.exec(raw);
    if (explicit) {
      const k = explicit[1]!.toLowerCase() as "section" | "article" | "rule";
      kindCounts.set(k, (kindCounts.get(k) ?? 0) + 2);
      if (explicit[2]!.includes(".")) decimalSectionCount++;
    } else if (/^\d+\.\d+(?:\.\d+)*[a-z]?\.\s+/iu.test(raw)) {
      decimalSectionCount++;
      kindCounts.set("section", (kindCounts.get("section") ?? 0) + 1);
    }

    // Combined section + first subpoint e.g. "17. (1)" or "1798.100. (a)"
    const combined = /^(?:(?:section|article|rule)\s+)?(\d+(?:\.\d+)*[a-z]?)\.\s*\(\s*([A-Za-z0-9]+)\s*\)/iu.exec(raw);
    if (combined) {
      if (combined[1]!.includes(".")) decimalSectionCount++;
      const sub = classifySubMarker(`(${combined[2]!})`);
      if (sub) {
        firstChildCounts.set(sub.markerClass, (firstChildCounts.get(sub.markerClass) ?? 0) + 2);
      }
    }
  }

  if (kindCounts.size === 0) {
    const hasBareSections = mainSpans.some(s => {
      const raw = map.text.slice(s.start, s.end).trimStart();
      return /^\d+[a-z]?\.\s+/iu.test(raw) || /^\d+[a-z]?\.$/iu.test(s.marker?.trim() ?? "");
    });
    if (hasBareSections) {
      for (const m of map.text.matchAll(/\b(section|article|rule)\s+\d+/giu)) {
        const k = m[1]!.toLowerCase() as "section" | "article" | "rule";
        kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
      }
    }
  }
  const dominantKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Observe marker class transitions when marker resets to first item ("1", "a", "A", "i")
  let prevClass: SubProvisionMarkerClass | null = null;
  let prevRawToken: string | null = null;
  for (let i = 0; i < mainSpans.length; i++) {
    const raw = map.text.slice(mainSpans[i]!.start, mainSpans[i]!.end);
    const nextRaw = i + 1 < mainSpans.length ? map.text.slice(mainSpans[i + 1]!.start, mainSpans[i + 1]!.end) : "";
    const nextPeek = /^\s*\(\s*([A-Za-z0-9]+)\s*\)/u.exec(nextRaw)?.[1] ?? null;
    const sub = classifySubMarker(raw, {
      prevMarker: prevRawToken,
      nextMarker: nextPeek,
      activeClasses: prevClass ? [prevClass] : [],
    });
    if (!sub) {
      if (/^(?:section|article|rule|chapter|part|title)\b/iu.test(raw.trimStart()) ||
          /^\d+(?:\.\d+)*[a-z]?\.\s+(?!\()/iu.test(raw.trimStart())) {
        prevClass = null;
        prevRawToken = null;
      }
      continue;
    }
    if (dominantKind !== "article" && sub.markerClass === "bare_num") {
      // Outside Article-based instruments, "1. " at block start is a bare Section opening, not a sub-paragraph
      prevClass = null;
      prevRawToken = null;
      continue;
    }
    const isOpeningFirstToken =
      (sub.markerClass === "num_paren" && sub.marker === "1") ||
      (sub.markerClass === "bare_num" && sub.marker === "1") ||
      (sub.markerClass === "lower_alpha" && sub.marker === "a") ||
      (sub.markerClass === "upper_alpha" && sub.marker === "A") ||
      (sub.markerClass === "lower_roman" && sub.marker === "i") ||
      (sub.markerClass === "upper_roman" && sub.marker === "I");

    if (prevClass && prevClass !== sub.markerClass && isOpeningFirstToken) {
      const key = `${prevClass}->${sub.markerClass}`;
      transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
    } else if (!prevClass && isOpeningFirstToken) {
      firstChildCounts.set(sub.markerClass, (firstChildCounts.get(sub.markerClass) ?? 0) + 1);
    }
    prevClass = sub.markerClass;
    prevRawToken = sub.marker;
  }

  let hierarchyOrder: SubProvisionMarkerClass[] = [...DEFAULT_HIERARCHY];
  const topRoot = [...firstChildCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  if (topRoot && topRoot[1] >= 2) {
    if (topRoot[0] === "lower_alpha") {
      // US / CCPA style: (a) -> (1) -> (A) -> (i)
      const alphaToNum = transitionCounts.get("lower_alpha->num_paren") ?? 0;
      const alphaToRoman = transitionCounts.get("lower_alpha->lower_roman") ?? 0;
      hierarchyOrder = alphaToNum >= alphaToRoman && alphaToNum >= 1
        ? ["lower_alpha", "num_paren", "upper_alpha", "lower_roman"]
        : ["lower_alpha", "lower_roman", "upper_alpha", "num_paren"];
    } else if (topRoot[0] === "bare_num" && dominantKind === "article") {
      // EU GDPR / AI Act style: Article -> 1. -> (a) -> (i)
      hierarchyOrder = ["bare_num", "lower_alpha", "lower_roman", "upper_alpha"];
    } else {
      // Commonwealth / DPDPA / UK style: (1) -> (a) -> (i) -> (A)
      hierarchyOrder = ["num_paren", "lower_alpha", "lower_roman", "upper_alpha"];
    }
  } else if (dominantKind === "article" && (firstChildCounts.get("bare_num") ?? 0) >= 1) {
    hierarchyOrder = ["bare_num", "lower_alpha", "lower_roman", "upper_alpha"];
  }

  return {
    primaryUnitKind: dominantKind,
    supportsDecimalNumbers: decimalSectionCount >= 1,
    hierarchyOrder,
    levelTypes: buildLevelTypes(hierarchyOrder, dominantKind),
  };
}

function formatMarkerExample(cls: SubProvisionMarkerClass): string {
  switch (cls) {
    case "num_paren": return "(1)";
    case "bare_num": return "1.";
    case "lower_alpha": return "(a)";
    case "upper_alpha": return "(A)";
    case "lower_roman": return "(i)";
    case "upper_roman": return "(I)";
  }
}

/**
 * Build a concise "You Are Here" ancestor breadcrumb + inferred grammar hint for any chunk or
 * single-unit retry offset so isolated clauses (e.g. "(b) ...") never lose their enclosing Section/Subsection.
 */
export function computeAncestorBreadcrumbAt(
  map: SourceMap,
  offset: number,
  precomputed?: { outline?: ContainerOutlineNode[]; grammar?: DocumentGrammarProfile },
): string[] {
  if (offset <= 0) return [];
  const outline = precomputed?.outline ?? discoverContainerSkeleton(map);
  const grammar = precomputed?.grammar ?? inferDocumentGrammar(map);
  const crumbs: string[] = [];

  const enclosingContainers = outline
    .filter(node => node.codeRange.start < offset && node.span.end > offset)
    .sort((a, b) => a.rank - b.rank || a.codeRange.start - b.codeRange.start);

  for (const node of enclosingContainers) {
    const codeText = map.text.slice(node.codeRange.start, node.codeRange.end).trim();
    const titleText = node.titleRange ? map.text.slice(node.titleRange.start, node.titleRange.end).trim() : "";
    crumbs.push(titleText ? `${codeText} — ${titleText}` : codeText);
  }

  const containerStart = enclosingContainers.at(-1)?.codeRange.start ?? 0;
  const containerEnd = enclosingContainers.at(-1)?.span.end ?? map.text.length;
  const explicitUnitRe = new RegExp(`^(section|article|rule)\\s+(${SECTION_NUMBER_TOKEN_SOURCE})\\b`, "iu");
  const bareUnitRe = new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.\\s+`, "iu");
  const markerUnitRe = new RegExp(`^(${SECTION_NUMBER_TOKEN_SOURCE})\\.$`, "iu");

  let activeSection: { kind: string; number: string; start: number } | null = null;
  const mainSpans = map.spans.filter(span =>
    span.kind === "text" &&
    isSubstantiveZone(span.layoutZone) &&
    span.start >= containerStart &&
    span.start < Math.min(offset, containerEnd) &&
    !span.parentRef?.startsWith("#/tables/"));

  for (const span of mainSpans) {
    const raw = map.text.slice(span.start, span.end).trimStart();
    const explicit = explicitUnitRe.exec(raw);
    const marker = markerUnitRe.exec(span.marker?.trim() ?? "");
    const bare = grammar.primaryUnitKind !== "article" ? bareUnitRe.exec(raw) : null;
    const num = explicit?.[2] ?? marker?.[1] ?? bare?.[1];
    const kind = explicit?.[1]?.toLowerCase() ?? (num ? grammar.primaryUnitKind : null);
    if (num && kind) {
      activeSection = { kind, number: num, start: span.start };
    }
  }

  if (activeSection) {
    const capKind = activeSection.kind.charAt(0).toUpperCase() + activeSection.kind.slice(1);
    crumbs.push(`${capKind} ${activeSection.number}`);

    // Check for active first-level subsection/paragraph inside activeSection before offset
    const firstClass = grammar.hierarchyOrder[0] ?? "num_paren";
    let activeFirstSub: string | null = null;
    for (const span of mainSpans) {
      if (span.start < activeSection.start || span.start >= offset) continue;
      const raw = map.text.slice(span.start, span.end);
      const sub = classifySubMarker(raw);
      if (sub && sub.markerClass === firstClass && (sub.markerClass !== "bare_num" || activeSection.kind === "article")) {
        activeFirstSub = sub.marker;
      }
    }
    if (activeFirstSub) {
      const subType = grammar.levelTypes[firstClass] ?? "subsection";
      const capSub = subType.charAt(0).toUpperCase() + subType.slice(1);
      crumbs.push(`${capSub} (${activeFirstSub})`);
    }
  }

  if (crumbs.length > 0 && grammar.primaryUnitKind) {
    const chain = grammar.hierarchyOrder
      .slice(0, 4)
      .map(cls => `${formatMarkerExample(cls)}=${grammar.levelTypes[cls]}`)
      .join(" -> ");
    crumbs.push(`Grammar: ${grammar.primaryUnitKind} -> ${chain}`);
  }

  return crumbs;
}
