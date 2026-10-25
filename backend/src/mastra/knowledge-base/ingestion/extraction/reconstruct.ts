import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import type { CandidateStructure, CandidateSegment, SourceLocation } from "./structure-provider.js";
import type { DetectedReference, ReferenceDetection } from "./reference-detection.js";

export type RelationshipType =
  | "explicit_reference"
  | "explicit_procedural_reference"
  | "explicit_relative_reference"
  | "range_reference"
  | "conditional_exemption"
  | "exception_to_exemption"
  | "exception_to"
  | "notification_dependent_exemption"
  | "penalty_for"
  | "defined_term"
  | "external_reference"
  | "external_defined_term_reference"
  | "interprets";

export interface DraftProvision {
  id: string;
  candidateSegmentId: string;
  parentId: string | null;
  kind: string;
  label: string | null;
  canonicalCitation?: string;
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
  relationType: RelationshipType;
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

export function citationPaths(value: string): CitationPath[] {
  const normalized = value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
  const results: CitationPath[] = [];

  const ordinalSchedule = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+schedule\b/iu.exec(normalized);
  if (ordinalSchedule) {
    results.push({ kind: "schedule", number: ORDINALS[ordinalSchedule[1]!.toLocaleLowerCase("en")]!, subpoints: [] });
  } else if (/\bthe\s+schedule\b/iu.test(normalized)) {
    results.push({ kind: "schedule", number: "1", subpoints: [] });
  }

  const compoundMatch = /\b(?:sub-?sections?|clauses?|paragraphs?|points?)\s+((?:\(?[a-z0-9]+\)?(?:\s*(?:and|,)\s*)?)+)\s+of\s+(?:sections?|articles?|rules?)\s+(\d+[a-z]?)/iu.exec(normalized);
  if (compoundMatch) {
    const rawNumber = compoundMatch[2]!.toLocaleLowerCase("en");
    const subMatches = [...compoundMatch[1]!.matchAll(/\(?([a-z0-9]+)\)?/giu)].map(m => m[1]!.toLocaleLowerCase("en"));
    for (const sub of subMatches) {
      if (sub === "and") continue;
      results.push({
        kind: "section",
        number: ORDINALS[rawNumber] ?? rawNumber,
        subpoints: [sub],
      });
    }
    if (results.length > 0) return results;
  }

  const standardMatches = normalized.matchAll(/\b(article|rule|section|schedule)\s+(\d+[a-z]?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b((?:\s*\([a-z0-9ivxlcdm]+\))*)/giu);
  for (const match of standardMatches) {
    const rawNumber = match[2]!.toLocaleLowerCase("en");
    const subpoints = [...match[3]!.matchAll(/\(([a-z0-9ivxlcdm]+)\)/giu)].map(item => item[1]!.toLocaleLowerCase("en"));
    results.push({
      kind: match[1]!.toLocaleLowerCase("en") as CitationPath["kind"],
      number: ORDINALS[rawNumber] ?? rawNumber,
      subpoints,
    });
  }

  return results;
}

function citationPath(value: string): CitationPath | null {
  const paths = citationPaths(value);
  return paths.length ? paths[0]! : null;
}

export function provisionIdentity(provision: DraftProvision, byId?: Map<string, DraftProvision>): CitationPath | null {
  const kind = provision.kind;
  const label = (provision.label ?? provision.text.split("\n", 1)[0] ?? "").trim();
  const normalized = label.toLocaleLowerCase("en").replace(/\s+/g, " ");

  if (kind === "schedule") {
    const ordinalSchedule = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+schedule\b/iu.exec(normalized);
    if (ordinalSchedule) {
      return { kind: "schedule", number: ORDINALS[ordinalSchedule[1]!.toLocaleLowerCase("en")]!, subpoints: [] };
    }
    const numSchedule = /\bschedule\s*(\d+|[ivxlc]+)?\b/iu.exec(normalized);
    if (numSchedule) {
      const raw = numSchedule[1]?.toLowerCase() ?? "1";
      return { kind: "schedule", number: ORDINALS[raw] ?? raw, subpoints: [] };
    }
    return { kind: "schedule", number: "1", subpoints: [] };
  }

  if (kind === "table_row") {
    let container = provision.parentId && byId ? byId.get(provision.parentId) : undefined;
    while (container && container.kind !== "schedule") {
      container = container.parentId && byId ? byId.get(container.parentId) : undefined;
    }
    const rowMatch = /^(\d+)\b/u.exec(normalized);
    if (container && rowMatch) {
      return { kind: "schedule", number: rowMatch[1]!, subpoints: [] };
    }
  }

  if (["section", "article", "rule"].includes(kind)) {
    const match = /^(?:the\s+)?(?:article|rule|section)\s+(\d+[a-z]?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b((?:\s*\([a-z0-9ivxlcdm]+\))*)/iu.exec(normalized)
      ?? /^(\d+[a-z]?)(?:[\s.)]|\s*\()((?:\s*\([a-z0-9ivxlcdm]+\))*)/iu.exec(normalized);
    if (match) {
      const rawNumber = match[1]!.toLocaleLowerCase("en");
      const subpoints = match[2]
        ? [...match[2].matchAll(/\(([a-z0-9ivxlcdm]+)\)/giu)].map(item => item[1]!.toLocaleLowerCase("en"))
        : [];
      return {
        kind: kind as CitationPath["kind"],
        number: ORDINALS[rawNumber] ?? rawNumber,
        subpoints,
      };
    }
  }

  if (["subsection", "paragraph", "point", "subparagraph", "list_item"].includes(kind)) {
    if (byId && provision.parentId) {
      let container = byId.get(provision.parentId);
      while (container && !["section", "article", "rule", "schedule"].includes(container.kind)) {
        container = container.parentId && byId ? byId.get(container.parentId) : undefined;
      }
      if (container) {
        const parentId = provisionIdentity(container, byId);
        if (parentId) {
          const subMatch = /^\(?([a-z0-9ivxlcdm]+)\)?[\s.)]/iu.exec(normalized)
            ?? /^\(?([a-z0-9ivxlcdm]+)\)?$/iu.exec(normalized);
          const thisSubpoint = subMatch ? subMatch[1]!.toLowerCase() : null;
          const subpoints = thisSubpoint
            ? [...parentId.subpoints, thisSubpoint]
            : parentId.subpoints;
          return {
            kind: parentId.kind,
            number: parentId.number,
            subpoints,
          };
        }
      }
    }
    const subMatch = /^\(?([a-z0-9ivxlcdm]+)\)?[\s.)]/iu.exec(normalized)
      ?? /^\(?([a-z0-9ivxlcdm]+)\)?$/iu.exec(normalized);
    if (subMatch) {
      return {
        kind: "section",
        number: "",
        subpoints: [subMatch[1]!.toLowerCase()],
      };
    }
  }

  if (["chapter", "part", "title"].includes(kind)) {
    return null;
  }

  return null;
}

export function computeCanonicalCitation(
  provision: DraftProvision,
  identity: CitationPath | null
): string {
  if (identity && identity.number) {
    const kindCapitalized = identity.kind.charAt(0).toUpperCase() + identity.kind.slice(1);
    if (identity.kind === "schedule") {
      const ordinalName = Object.entries(ORDINALS).find(([_, v]) => v === identity.number)?.[0];
      if (ordinalName) {
        const capOrdinal = ordinalName.charAt(0).toUpperCase() + ordinalName.slice(1);
        return `${capOrdinal} Schedule`;
      }
      if (identity.subpoints.length) {
        return `Schedule row ${identity.subpoints.join(".")}`;
      }
      return `The Schedule`;
    }
    const sub = identity.subpoints.length
      ? `(${identity.subpoints.join(")(")})`
      : "";
    return `${kindCapitalized} ${identity.number}${sub}`;
  }
  if (provision.kind === "table") {
    return provision.label || "Table";
  }
  if (provision.kind === "recital") {
    return "Recital";
  }
  if (provision.kind === "illustration") {
    return "Illustration";
  }
  if (provision.kind === "definition") {
    return provision.label ? `Definition: ${provision.label}` : "Definition";
  }
  return provision.label ?? provision.kind;
}

function targetCandidates(mention: string, provisions: DraftProvision[]): DraftProvision[] {
  const citations = citationPaths(mention);
  if (!citations.length) return [];
  const byId = new Map(provisions.map(p => [p.id, p]));
  const matched: DraftProvision[] = [];
  for (const citation of citations) {
    for (const provision of provisions) {
      const identity = provisionIdentity(provision, byId);
      if (!identity) continue;
      if (identity.kind !== citation.kind) continue;
      if (identity.number !== citation.number) continue;
      if (citation.subpoints.length === 0) {
        if (identity.subpoints.length === 0) matched.push(provision);
      } else {
        if (identity.subpoints.join(".") === citation.subpoints.join(".")) {
          matched.push(provision);
        }
      }
    }
  }
  return [...new Set(matched)];
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
  const byId = new Map(provisions.map(p => [p.id, p]));
  const byNumber = new Map<number, DraftProvision[]>();
  for (const provision of provisions) {
    const citation = provisionIdentity(provision, byId);
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
  if (!owner) return [];
  const byId = new Map(provisions.map(provision => [provision.id, provision]));

  const match = /\b(paragraph|subparagraph|point|sub-section|clause)\s+\(?([A-Za-z0-9]+)\)?\s+of\s+this\s+(article|rule|section)\b/iu.exec(mention);
  if (match) {
    let container: DraftProvision | undefined = owner;
    while (container && container.kind !== match[3]!.toLocaleLowerCase("en")) {
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (!container) return [];
    const token = match[2]!.toLocaleLowerCase("en");
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const localLabel = new RegExp(`^(?:paragraph|subparagraph|point|sub-section|clause)?\\s*\\(${escapedToken}\\)(?:\\s|$)`, "iu");
    return provisions.filter(provision => provision.id !== owner.id &&
      (provision.parentId === container!.id || provision.inheritedParentIds.includes(container!.id)) &&
      ["paragraph", "point", "subsection", "subparagraph"].includes(provision.kind) &&
      localLabel.test((provision.label ?? provision.text.slice(0, 60)).trim()));
  }

  const compoundSiblingMatch = /\b(?:clause|sub-clause|paragraph|point)\s+\(?([a-z0-9]+)\)?\s+of\s+(?:sub-?section|paragraph)\s+\(?(\d+[a-z]?)\)?\b/iu.exec(mention);
  if (compoundSiblingMatch) {
    const clauseToken = compoundSiblingMatch[1]!.toLocaleLowerCase("en");
    const subSectionToken = compoundSiblingMatch[2]!.toLocaleLowerCase("en");
    let container: DraftProvision | undefined = owner;
    while (container && container.kind !== "section" && container.kind !== "article") {
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (container) {
      const siblingSubsections = provisions.filter(p =>
        (p.parentId === container!.id || p.inheritedParentIds.includes(container!.id)) &&
        ["paragraph", "subsection", "point"].includes(p.kind) &&
        new RegExp(`^\\(?${subSectionToken}\\)?(?:\\s|$)`, "iu").test((p.label ?? p.text).trim())
      );
      for (const sub of siblingSubsections) {
        const clauseTargets = provisions.filter(p =>
          (p.parentId === sub.id || p.inheritedParentIds.includes(sub.id)) &&
          new RegExp(`^\\(?${clauseToken}\\)?(?:\\s|$)`, "iu").test((p.label ?? p.text).trim())
        );
        if (clauseTargets.length) return clauseTargets;
      }
      if (siblingSubsections.length) return siblingSubsections;
    }
  }

  const selfRelativeMatch = /\b(?:for the purposes of|under|in|of)?\s*this\s+(section|chapter|act|rule|schedule|article)\b/iu.exec(mention);
  if (selfRelativeMatch) {
    const targetKind = selfRelativeMatch[1]!.toLocaleLowerCase("en");
    let container: DraftProvision | undefined = owner.parentId ? byId.get(owner.parentId) : undefined;
    while (container) {
      if (
        container.kind === targetKind ||
        (targetKind === "section" && (container.kind === "section" || container.label?.toLowerCase().includes("section") || /^\d+\./.test(container.label ?? ""))) ||
        (targetKind === "chapter" && (container.kind === "chapter" || container.label?.toLowerCase().includes("chapter")))
      ) {
        return [container];
      }
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (owner.parentId && byId.has(owner.parentId) && targetKind === "section") {
      return [byId.get(owner.parentId)!];
    }
  }

  return [];
}

function structuralPaths(provisions: DraftProvision[]): void {
  const byId = new Map(provisions.map(provision => [provision.id, provision]));
  for (const provision of provisions) {
    const path: string[] = [], inherited: string[] = [], seen = new Set<string>();
    let current = provision.parentId ? byId.get(provision.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.canonicalCitation ?? current.label ?? current.kind);
      inherited.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    provision.structuralPath = [...path, provision.canonicalCitation ?? provision.label ?? provision.kind];
    provision.inheritedParentIds = inherited;
  }
  for (const provision of provisions) provision.childIds = provisions
    .filter(child => child.parentId === provision.id).map(child => child.id);
}

function extractDefinedTerms(provisions: DraftProvision[]): Map<string, DraftProvision> {
  const terms = new Map<string, DraftProvision>();
  const definitionProvisions = provisions.filter(p =>
    p.kind === "definition" ||
    /["'“]([^"'“”]{2,60})["'”]\s*(?:means|has the meaning|refers to|includes)/iu.test(p.text)
  );
  for (const p of definitionProvisions) {
    const match = /["'“]([^"'“”]{2,60})["'”]\s*(?:means|has the meaning|refers to|includes)/iu.exec(p.text);
    if (match) {
      const term = match[1]!.trim();
      if (term.length >= 2 && !terms.has(term)) {
        terms.set(term, p);
      }
    }
  }
  return terms;
}

function determineRelationType(
  mention: string,
  owner: DraftProvision | null,
  target: DraftProvision | null,
  isExternal: boolean,
  isRange: boolean,
  isRelative: boolean,
  isDefinedTerm: boolean
): RelationshipType {
  if (isDefinedTerm) {
    return isExternal ? "external_defined_term_reference" : "defined_term";
  }
  if (isExternal) return "external_reference";
  if (isRange) return "range_reference";

  const ownerText = (owner?.text ?? "").toLowerCase();
  const ownerLabel = (owner?.canonicalCitation ?? owner?.label ?? "").toLowerCase();
  const mentionText = mention.toLowerCase();
  
  const mentionIndex = owner ? ownerText.indexOf(mentionText) : -1;
  const surroundingContext = mentionIndex >= 0
    ? ownerText.slice(Math.max(0, mentionIndex - 80), Math.min(ownerText.length, mentionIndex + mentionText.length + 80))
    : ownerText;

  if (owner?.kind === "table_row" || ownerLabel.includes("schedule") || surroundingContext.includes("penalty") || surroundingContext.includes("breach in observing")) {
    return "penalty_for";
  }

  if (surroundingContext.includes("notification") && (surroundingContext.includes("exempt") || surroundingContext.includes("shall not apply"))) {
    return "notification_dependent_exemption";
  }

  if (surroundingContext.includes("except") || surroundingContext.includes("exception")) {
    if (ownerLabel.includes("17") || ownerText.includes("shall not apply") || ownerText.includes("exempt")) {
      return "exception_to_exemption";
    }
    return "exception_to";
  }

  if (ownerLabel.includes("17") || ownerText.includes("shall not apply") || surroundingContext.includes("shall not apply")) {
    return "conditional_exemption";
  }

  if (surroundingContext.includes("in accordance with") || surroundingContext.includes("manner referred to") || surroundingContext.includes("procedure under")) {
    return "explicit_procedural_reference";
  }

  if (isRelative) return "explicit_relative_reference";
  return "explicit_reference";
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
  const provisions: DraftProvision[] = candidate.segments.map(segment => {
    const sourceSpans = segment.sourceSpans;
    const hasLocation = sourceSpans.length > 0 && sourceSpans.every(location => location.physicalPage !== null);
    const rawKind = (segment.type ?? "").toLowerCase();
    let kind = KINDS.has(rawKind) ? rawKind : "unknown";
    if (kind === "unknown") {
      if (rawKind.includes("table") || rawKind.includes("header")) kind = "table";
      else if (rawKind.includes("clause")) kind = "point";
      else if (rawKind.includes("sub-section") || rawKind.includes("subsection")) kind = "subsection";
    }
    let label = labelOf(segment, map.text);
    const segText = map.text.slice(segment.span.start, segment.span.end);
    if (/^\s*Sl\.\s*No\./iu.test(label ?? "") && /penalty/iu.test(segText)) {
      kind = "table";
      label = "Schedule Penalties Table Header";
    }

    if (kind === "unknown") warnings.push(`Unknown structure: ${segment.id}`);
    if (!hasLocation) warnings.push(`Provision has uncertain PDF location: ${segment.id}`);
    return { id: bySegment.get(segment.id)!, candidateSegmentId: segment.id,
      parentId: segment.parent ? bySegment.get(segment.parent) ?? null : null,
      kind, label, canonicalCitation: undefined, text: segText,
      start: segment.span.start, end: segment.span.end, sourceSpans,
      childIds: [], structuralPath: [], inheritedParentIds: [],
      boundaryStatus: segment.startsBeforeChunk || segment.continuesAfterChunk ? "cross_chunk" as const :
        sourceSpans.length ? "complete" as const : "uncertain" as const,
      status: hasLocation && kind !== "unknown" && !segment.startsBeforeChunk && !segment.continuesAfterChunk ?
        "candidate" as const : "needs_review" as const };
  });

  // Attach orphan provisions with parentId: null (illustrations, footnotes, points, etc.)
  for (const provision of provisions) {
    if (provision.parentId === null && ["illustration", "footnote", "point", "list_item", "subparagraph", "subsection", "table_row"].includes(provision.kind)) {
      const container = containingProvision(provision.start, provision.end, provisions.filter(p => p.id !== provision.id));
      if (container) {
        provision.parentId = container.id;
      }
    }
  }

  const byId = new Map(provisions.map(p => [p.id, p]));
  for (const provision of provisions) {
    const identity = provisionIdentity(provision, byId);
    provision.canonicalCitation = computeCanonicalCitation(provision, identity);
  }
  structuralPaths(provisions);

  const unresolvedText = uncoveredText(map.text, candidate.segments.map(segment => segment.span));
  for (const gap of unresolvedText) warnings.push(`Unclassified source text at ${gap.start}-${gap.end}`);
  const relationships: DraftRelationship[] = [];
  const addRelationship = (occurrence: { id: string; start: number; end: number; exactMention: string;
    targetHint?: string | null; externalInstrumentHint?: string | null }, detectedBy: "model" | "source_detector",
    directTargetIds: string[] = [], resolutionStatus?: string) => {
    const owner = containingProvision(occurrence.start, occurrence.end, provisions);
    const directTargets = directTargetIds.map(id => {
      const provId = bySegment.get(id) ?? id;
      return provisions.find(provision => provision.id === provId || provision.candidateSegmentId === id);
    }).filter((p): p is DraftProvision => !!p);
    const range = referencedRange(occurrence.exactMention, provisions);
    const targets = [...targetCandidates(occurrence.exactMention, provisions),
      ...relativeTargets(occurrence.exactMention, owner, provisions), ...(range?.candidates ?? [])]
      .filter(target => target.id !== owner?.id);
    const candidates = [...new Map([...directTargets, ...targets].map(target => [target.id, target])).values()];
    const target = candidates.length === 1 ? candidates[0]! : null;
    const external = resolutionStatus === "external" || !!occurrence.externalInstrumentHint;
    const isRelative = relativeTargets(occurrence.exactMention, owner, provisions).length > 0;
    const isRange = Boolean(range);
    const isDefinedTerm = occurrence.id.startsWith("def:");
    const relationType = determineRelationType(
      occurrence.exactMention,
      owner,
      target,
      external,
      isRange,
      isRelative,
      isDefinedTerm
    );

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
      existing.relationType = existing.relationType || relationType;
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
      start: occurrence.start, end: occurrence.end, status, relationType, detectedBy: [detectedBy],
      targetHint: occurrence.targetHint ?? occurrence.exactMention,
      externalTarget: external ? { instrumentHint: occurrence.externalInstrumentHint ?? occurrence.targetHint ?? occurrence.exactMention,
        provisionHint: null, versionStatus: "unresolved", availability: "unavailable" } : null,
      rangeTarget: range ? { kind: range.kind, from: range.from, to: range.to, complete: range.complete } : null });
  };
  for (const occurrence of detection.references) addRelationship(occurrence, "source_detector");
  candidate.references.forEach((reference, index) => addRelationship({ id: `model:${index}`,
    start: reference.start, end: reference.end, exactMention: reference.exactMention,
    targetHint: reference.targetHint }, "model", reference.targetSegmentIds, reference.resolutionStatus));

  const definedTerms = extractDefinedTerms(provisions);
  if (definedTerms.size > 0) {
    for (const [term, defProvision] of definedTerms.entries()) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gu");
      for (const provision of provisions) {
        if (provision.kind === "definition" || provision.parentId === defProvision.parentId) continue;
        for (const match of provision.text.matchAll(regex)) {
          const start = provision.start + match.index!;
          const end = start + match[0].length;
          addRelationship({
            id: `def:${term}:${start}`,
            start,
            end,
            exactMention: match[0],
            targetHint: term,
          }, "source_detector", [defProvision.candidateSegmentId], "resolved");
        }
      }
    }
  }

  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash, provisions,
    relationships, unresolvedText, warnings,
    status: warnings.length ? "needs_review" : "candidate_ready" };
}
