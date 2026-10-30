import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import { sourceLocations, type CandidateStructure, type CandidateSegment, type SourceLocation } from "./structure-provider.js";
import type { DetectedReference, ReferenceDetection } from "./reference-detection.js";
import { repairStructuralDirectory } from "./structural-directory.js";
import { collectDefinitions, definitionApplies } from "./definitions.js";
import { parseCitationExpression, citationKey, externalInstrumentForMention } from "./citation-expression.js";

export type RelationshipType =
  | "refers_to"
  | "defines"
  | "explicit_reference"
  | "explicit_procedural_reference"
  | "explicit_relative_reference"
  | "range_reference"
  | "exception_to_exemption"
  | "exception_to"
  | "penalty_for"
  | "depends_on"
  | "exempts_from"
  | "alternative_to"
  | "defined_term"
  | "external_reference"
  | "interprets";

export interface DraftProvision {
  id: string;
  candidateSegmentId: string;
  parentId: string | null;
  kind: string;
  label: string | null;
  canonicalCitation?: string;
  identity?: CitationPath;
  originalType?: string | null;
  text: string;
  start: number;
  end: number;
  sourceSpans: SourceLocation[];
  childIds: string[];
  structuralPath: string[];
  inheritedParentIds: string[];
  tableItemRef?: string;
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
  referenceType?: RelationshipType;
  detectedBy: Array<"model" | "source_detector">;
  targetHint: string | null;
  externalTarget: { instrumentHint: string; provisionHint: string | null;
    versionStatus: "unresolved"; availability: "unavailable" } | null;
  rangeTarget: { kind: "article" | "rule" | "section"; from: number; to: number;
    complete: boolean } | null;
  semanticRole?: string;
  semanticCondition?: string | null;
  semanticIssues?: string[];
  semanticStatus?: "proposed" | "needs_review" | "not_analyzed";
  semanticEvidence?: { start: number; end: number; exactQuote: string };
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

export interface CitationPath {
  kind: "article" | "rule" | "section" | "schedule";
  number: string;
  subpoints: string[];
}

const ORDINALS: Record<string, string> = {
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6",
  seventh: "7", eighth: "8", ninth: "9", tenth: "10",
};

export function citationPaths(value: string): CitationPath[] {
  return parseCitationExpression(value);
}

function citationPath(value: string): CitationPath | null {
  const paths = citationPaths(value);
  return paths.length ? paths[0]! : null;
}

export function provisionIdentity(provision: DraftProvision, byId?: Map<string, DraftProvision>): CitationPath | null {
  if (provision.identity) return provision.identity;
  const kind = provision.kind;
  const label = (provision.label ?? provision.text.split("\n", 1)[0] ?? "").trim();
  const normalized = label.toLocaleLowerCase("en").replace(/\s+/g, " ")
    .replace(/\(\s+/gu, "(").replace(/\s+\)/gu, ")");
  const leadingText = provision.text.slice(0, 200).toLocaleLowerCase("en").replace(/\s+/g, " ")
    .replace(/\(\s+/gu, "(").replace(/\s+\)/gu, ")");

  if (kind === "schedule" || kind === "annex" && /\b(?:the|\d+|first|second|third)\s+schedule\b/u.test(normalized)) {
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
    while (container && container.kind !== "schedule" &&
      !(container.kind === "annex" && /\bschedule\b/iu.test(container.label ?? ""))) {
      container = container.parentId && byId ? byId.get(container.parentId) : undefined;
    }
    const rowMatch = /^(\d+)\b/u.exec(normalized);
    if (container && rowMatch) {
      const parentIdentity = provisionIdentity(container, byId);
      if (parentIdentity) return { ...parentIdentity, subpoints: [...parentIdentity.subpoints, rowMatch[1]!] };
    }
  }

  if (kind === "definition" && byId && provision.parentId) {
    const container = byId.get(provision.parentId);
    const parentIdentity = container ? provisionIdentity(container, byId) : null;
    const item = /^\s*\(\s*([a-z0-9]+)\s*\)/iu.exec(provision.text);
    if (parentIdentity && item && ["section", "article", "rule"].includes(parentIdentity.kind)) {
      return { ...parentIdentity, subpoints: [...parentIdentity.subpoints, item[1]!.toLowerCase()] };
    }
  }

  if (["section", "article", "rule"].includes(kind)) {
    const named = /^(?:the\s+)?(?:article|rule|section)\s+(\d+[a-z]?|[ivxlcdm]+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b((?:\s*\([a-z0-9ivxlcdm]+\))*)/iu.exec(leadingText);
    const numbered = /^(\d+[a-z]?)[\s.)]/iu.exec(leadingText);
    const match = named ?? numbered;
    if (match) {
      const rawNumber = match[1]!.toLocaleLowerCase("en");
      const subpoints = named?.[2]
        ? [...named[2].matchAll(/\(([a-z0-9ivxlcdm]+)\)/giu)].map(item => item[1]!.toLocaleLowerCase("en"))
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
      const container = byId.get(provision.parentId);
      if (container) {
        const parentId = provisionIdentity(container, byId);
        if (parentId) {
          const combined = /^(\d+[a-z]?)\.\s*\(([a-z0-9ivxlcdm]+)\)/iu.exec(normalized)
            ?? /^(\d+[a-z]?)\.\s*\(([a-z0-9ivxlcdm]+)\)/iu.exec(leadingText);
          const subMatch = /^\(\s*(\d+[a-z]?|[a-z]|[ivxlcdm]+)\s*\)(?:\s|$)/iu.exec(leadingText)
            ?? /^(\d+[a-z]?|[a-z]|[ivxlcdm]+)[)](?:\s|$)/iu.exec(leadingText);
          const thisSubpoint = combined && combined[1] === parentId.number
            ? combined[2]!.toLowerCase() : subMatch ? subMatch[1]!.toLowerCase() : null;
          if (!thisSubpoint) return null;
          const subpoints = provision.start === container.start && parentId.subpoints.at(-1) === thisSubpoint
            ? parentId.subpoints : [...parentId.subpoints, thisSubpoint];
          return {
            kind: parentId.kind,
            number: parentId.number,
            subpoints,
          };
        }
      }
    }
    const subMatch = /^\(\s*([a-z0-9]+)\s*\)(?:\s|$)/iu.exec(leadingText);
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
      if (identity.subpoints.length) return `Schedule row ${identity.subpoints.join(".")}`;
      if (/^\s*(?:the\s+)?schedule\b/iu.test(provision.label ?? provision.text) &&
        !/^\s*(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+schedule\b/iu.test(provision.label ?? provision.text)) {
        return "The Schedule";
      }
      const ordinalName = Object.entries(ORDINALS).find(([_, v]) => v === identity.number)?.[0];
      if (ordinalName) {
        const capOrdinal = ordinalName.charAt(0).toUpperCase() + ordinalName.slice(1);
        return `${capOrdinal} Schedule`;
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
  // Break any parent cycles (e.g. from LLM hallucinations where provisions mutually parent each other)
  for (const provision of provisions) {
    let curr = provision.parentId;
    const seen = new Set<string>([provision.id]);
    while (curr) {
      if (seen.has(curr)) {
        provision.parentId = null;
        break;
      }
      seen.add(curr);
      const parent = provisions.find(p => p.id === curr);
      curr = parent?.parentId ?? null;
    }
  }

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

export function containingProvision(start: number, end: number, provisions: DraftProvision[]): DraftProvision | null {
  return provisions.filter(provision => provision.start <= start && provision.end >= end)
    .sort((a, b) => Number(Boolean(b.tableItemRef && b.kind === "table_row")) - Number(Boolean(a.tableItemRef && a.kind === "table_row")) ||
      (a.end - a.start) - (b.end - b.start) ||
      (a.parentId === b.id ? -1 : b.parentId === a.id ? 1 : 0))[0] ?? null;
}

function referencedRange(mention: string, provisions: DraftProvision[]) {
  mention = mention.replace(/[\u2010-\u2015]/gu, "-");
  const match = /\b(articles?|rules?|sections?)\s+(\d+)\s*[-–—]\s*(\d+)/iu.exec(mention);
  if (!match) return null;
  const kind = match[1]!.toLocaleLowerCase("en").replace(/s$/, "") as "article" | "rule" | "section";
  const from = Number(match[2]), to = Number(match[3]);
  if (to < from || to - from > 500) return null;
  // Break any parent cycles (e.g. from LLM hallucinations where provisions mutually parent each other)
  for (const provision of provisions) {
    let curr = provision.parentId;
    const seen = new Set<string>([provision.id]);
    while (curr) {
      if (seen.has(curr)) {
        provision.parentId = null;
        break;
      }
      seen.add(curr);
      const parent = provisions.find(p => p.id === curr);
      curr = parent?.parentId ?? null;
    }
  }

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
    const seen = new Set<string>();
    let container: DraftProvision | undefined = owner;
    while (container && container.kind !== match[3]!.toLocaleLowerCase("en") && !seen.has(container.id)) {
      seen.add(container.id);
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (!container || seen.has(container.id)) return [];
    const token = match[2]!.toLocaleLowerCase("en");
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const localLabel = new RegExp(`^(?:paragraph|subparagraph|point|sub-section|clause)?\\s*\\(${escapedToken}\\)(?:\\s|$)`, "iu");
    return provisions.filter(provision => provision.id !== owner.id &&
      (provision.parentId === container!.id || provision.inheritedParentIds.includes(container!.id)) &&
      ["paragraph", "point", "subsection", "subparagraph"].includes(provision.kind) &&
      localLabel.test((provision.label ?? provision.text.slice(0, 60)).trim()));
  }

  const compoundSiblingMatch = /\b(?:clause|sub-clause|paragraph|point)\s*\(?\s*([a-z0-9]+)\s*\)?\s*of\s*(?:sub-?section|paragraph)\s*\(?\s*(\d+[a-z]?)\s*\)?\b/iu.exec(mention);
  if (compoundSiblingMatch) {
    const clauseToken = compoundSiblingMatch[1]!.toLocaleLowerCase("en");
    const subSectionToken = compoundSiblingMatch[2]!.toLocaleLowerCase("en");
    const seen = new Set<string>();
    let container: DraftProvision | undefined = owner;
    while (container && container.kind !== "section" && container.kind !== "article" && !seen.has(container.id)) {
      seen.add(container.id);
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (container && !seen.has(container.id)) {
      const siblingSubsections = provisions.filter(p =>
        (p.parentId === container!.id || p.inheritedParentIds.includes(container!.id)) &&
        ["paragraph", "subsection", "point"].includes(p.kind) &&
        new RegExp(`^\\(?\\s*${subSectionToken}\\s*\\)?(?:\\s|$)`, "iu").test((p.label ?? p.text).trim())
      );
      for (const sub of siblingSubsections) {
        const clauseTargets = provisions.filter(p =>
          (p.parentId === sub.id || p.inheritedParentIds.includes(sub.id)) &&
          ["paragraph", "subsection", "point"].includes(p.kind) &&
          new RegExp(`^\\(?\\s*${clauseToken}\\s*\\)?(?:\\s|$)`, "iu").test((p.label ?? p.text).trim())
        );
        if (clauseTargets.length) return clauseTargets;
      }
      // An absent clause is unresolved; its containing subsection is not the same target.
    }
  }

  const selfRelativeMatch = /^\s*(?:for the purposes of|under|in|of)?\s*this\s+(section|chapter|act|rule|schedule|article)\b/iu.exec(mention);
  if (selfRelativeMatch) {
    const targetKind = selfRelativeMatch[1]!.toLocaleLowerCase("en");
    const seen = new Set<string>();
    let container: DraftProvision | undefined = owner;
    while (container && container.kind !== targetKind && !seen.has(container.id)) {
      seen.add(container.id);
      container = container.parentId ? byId.get(container.parentId) : undefined;
    }
    if (container && container.id !== owner.id) {
      return [container];
    }
  }

  return [];
}

/** Resolve an unqualified numbered list against the closest structural container. */
function bareRelativeTargets(mention: string, owner: DraftProvision | null,
  provisions: DraftProvision[]): DraftProvision[] | null {
  if (!owner) return null;
  const match = /^\s*(sub-?sections?|paragraphs?|clauses?|points?|subparagraphs?)\s+((?:\(\s*[a-z0-9]+\s*\)|\d+[a-z]?)(?:\s*(?:,|and|or)\s*(?:\(\s*[a-z0-9]+\s*\)|\d+[a-z]?))*)\s*$/iu.exec(mention);
  if (!match) return null;
  const tokens = [...match[2]!.matchAll(/\(\s*([a-z0-9]+)\s*\)|\b(\d+[a-z]?)\b/giu)]
    .map(item => (item[1] ?? item[2]!).toLowerCase());
  if (!tokens.length || tokens.length > 20 || new Set(tokens).size !== tokens.length) return null;
  const unit = match[1]!.toLowerCase();
  const allowed = /^sub-?section/u.test(unit) ? ["subsection", "paragraph"] :
    unit.startsWith("paragraph") ? ["paragraph", "subsection"] :
      ["point", "list_item", "subparagraph"];
  const byId = new Map(provisions.map(provision => [provision.id, provision]));
  const seen = new Set<string>();
  let container: DraftProvision | undefined = owner;
  while (container && !seen.has(container.id)) {
    seen.add(container.id);
    const children = provisions.filter(provision => provision.parentId === container!.id &&
      allowed.includes(provision.kind));
    if (children.length) {
      const targets = tokens.map(token => children.filter(child =>
        provisionIdentity(child, byId)?.subpoints.at(-1) === token));
      // A partial or duplicate match is unresolved; never turn a list into one guessed edge.
      return targets.every(items => items.length === 1) ? targets.map(items => items[0]!) : null;
    }
    container = container.parentId ? byId.get(container.parentId) : undefined;
  }
  return null;
}

/** Shared by deterministic reconstruction and model discovery. */
export function resolveReferenceTargets(mention: string, owner: DraftProvision | null,
  provisions: DraftProvision[]): DraftProvision[] {
  const addresses = citationPaths(mention);
  if (addresses.length) return targetCandidates(mention, provisions);
  const relative = bareRelativeTargets(mention, owner, provisions) ?? relativeTargets(mention, owner, provisions);
  if (relative.length) return relative;
  const key = citationKey(mention);
  return provisions.filter(p => citationKey(p.canonicalCitation ?? "") === key);
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
  const definitionProvisions = provisions.filter(p => p.kind === "definition");
  for (const p of definitionProvisions) {
    const match = /["'“]([^"'“”]{2,60})["'”]\s*(?:means|has the meaning|refers to|includes)/iu.exec(p.text);
    if (match) {
      const term = match[1]!.replace(/\s+/g, " ").trim();
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
  if (isExternal) return "external_reference";
  if (isRange) return "range_reference";
  if (isDefinedTerm) return "defined_term";

  const ownerText = (owner?.text ?? "").toLowerCase();
  const ownerLabel = (owner?.canonicalCitation ?? owner?.label ?? "").toLowerCase();
  const mentionText = mention.toLowerCase();
  
  const mentionIndex = owner ? ownerText.indexOf(mentionText) : -1;
  const surroundingContext = mentionIndex >= 0
    ? ownerText.slice(Math.max(0, mentionIndex - 80), Math.min(ownerText.length, mentionIndex + mentionText.length + 80))
    : ownerText;

  if (surroundingContext.includes("in accordance with") || surroundingContext.includes("manner referred to")) {
    return "explicit_procedural_reference";
  }

  if (surroundingContext.includes("except") || surroundingContext.includes("exception")) {
    if (ownerLabel.includes("17") || ownerText.includes("shall not apply") || ownerText.includes("exempt")) {
      return "exception_to_exemption";
    }
    return "exception_to";
  }

  if (isRelative) return "explicit_relative_reference";
  return "explicit_reference";
}

function cleanGazetteNoise(text: string): string {
  return text
    .replace(/(?:General obligations\s+of Data Fiduciary\.|Processing\s+of personal\s+data of\s+children\.|Additional obligations\s+of Significant Data Fiduciary\.)/giu, "")
    .replace(/THE GAZETTE OF INDIA EXTRAORDINARY/giu, "")
    .replace(/\[PART II-[^\n]*\n?/giu, "")
    .replace(/(?:^|\n)\s*\d+\s*(?:\n|$)/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, " ")
    .trim();
}

/** Drafts only. A legal reviewer must accept coverage and relationships before publication. */
export function reconstructSource(map: SourceMap, candidate: CandidateStructure,
  detection: ReferenceDetection): ReconstructionDraft {
  if (candidate.textHash !== map.textHash || detection.textHash !== map.textHash ||
      detection.sourceVersionId.length === 0) throw new Error("Reconstruction inputs refer to different text");
  const sourceVersionId = detection.sourceVersionId;
  candidate = repairStructuralDirectory(map, candidate);
  const warnings = [...map.warnings, ...candidate.warnings, ...candidate.unresolvedItems, ...detection.warnings];
  const tableRanges = [...new Set(map.spans.filter(span => span.kind === "table_cell")
    .map(span => span.itemRef))].map(itemRef => {
    const spans = map.spans.filter(span => span.itemRef === itemRef && span.kind === "table_cell");
    return { itemRef, start: Math.min(...spans.map(span => span.start)),
      end: Math.max(...spans.map(span => span.end)) };
  });
  const scheduleCaptions = map.spans.filter(span => span.parentRef &&
    tableRanges.some(table => table.itemRef === span.parentRef) &&
    /\bschedule\b/iu.test(map.text.slice(span.start, span.end)));
  const structuralSegments = candidate.segments.filter(segment => !tableRanges.some(table =>
    segment.span.start >= table.start && segment.span.end <= table.end &&
    /^(?:table|table[-_]?row|table[-_]?header[-_]?row|penalty[-_]?table[-_]?row|list_point|point|unknown)$/iu.test(segment.type ?? "")) &&
    !scheduleCaptions.some(caption => /^(?:schedule|annex|schedule[-_]?heading)$/iu.test(segment.type ?? "") &&
      segment.span.start <= caption.start && segment.span.end >= caption.end));
  const bySegment = new Map(structuralSegments.map(segment => [segment.id,
    hashRevision({ sourceVersionId, textHash: map.textHash, kind: segment.kind,
      type: segment.type, category: segment.category, start: segment.span.start, end: segment.span.end })]));
  const provisions: DraftProvision[] = structuralSegments.map(segment => {
    const sourceSpans = segment.sourceSpans;
    const hasLocation = sourceSpans.length > 0 && sourceSpans.every(location => location.physicalPage !== null);
    const rawKind = (segment.type ?? "").toLowerCase();
    let kind = KINDS.has(rawKind) ? rawKind : "unknown";
    if (kind === "unknown") {
      if (rawKind === "tablerow") kind = "table_row";
      else if (rawKind.includes("table") || rawKind.includes("header")) kind = "table";
      else if (rawKind.includes("clause") || rawKind.includes("point") || rawKind.includes("list")) kind = "point";
      else if (rawKind.includes("sub-section") || rawKind.includes("subsection")) kind = "subsection";
      else if (rawKind.includes("explanation") || rawKind.includes("para")) kind = "paragraph";
      else if (rawKind.includes("sec")) kind = "section";
      else if (rawKind.includes("illus")) kind = "illustration";
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
      kind, label, identity: segment.identity, originalType: segment.originalType,
      canonicalCitation: undefined, text: segText,
      start: segment.span.start, end: segment.span.end, sourceSpans,
      childIds: [], structuralPath: [], inheritedParentIds: [],
      boundaryStatus: segment.startsBeforeChunk || segment.continuesAfterChunk ? "cross_chunk" as const :
        sourceSpans.length ? "complete" as const : "uncertain" as const,
      status: hasLocation && kind !== "unknown" && !segment.startsBeforeChunk && !segment.continuesAfterChunk ?
        "candidate" as const : "needs_review" as const };
  });

  for (const caption of scheduleCaptions) {
    if (provisions.some(provision => ["schedule", "annex"].includes(provision.kind) &&
      provision.start === caption.start && provision.end === caption.end)) continue;
    const sourceSpans = sourceLocations(map, caption);
    provisions.push({ id: hashRevision({ sourceVersionId, textHash: map.textHash,
        captionItemRef: caption.itemRef, start: caption.start, end: caption.end }),
      candidateSegmentId: `source-caption:${caption.itemRef}`, parentId: null,
      kind: "schedule", label: map.text.slice(caption.start, caption.end).trim(),
      text: map.text.slice(caption.start, caption.end), start: caption.start, end: caption.end,
      sourceSpans, childIds: [], structuralPath: [], inheritedParentIds: [],
      boundaryStatus: "complete", status: sourceSpans.every(span => span.physicalPage !== null)
        ? "candidate" : "needs_review" });
  }

  // Docling coordinates establish table rows independently of model boundaries.
  for (const table of tableRanges) {
    const cells = map.spans.filter(span => span.kind === "table_cell" && span.itemRef === table.itemRef);
    const captionRefs = new Set(map.spans.filter(span => span.parentRef === table.itemRef)
      .map(span => span.itemRef));
    const schedule = provisions.find(provision => ["schedule", "annex"].includes(provision.kind) &&
      provision.sourceSpans.some(span => captionRefs.has(span.itemRef)));
    const rowNumbers = [...new Set(cells.map(span => span.row).filter((row): row is number =>
      typeof row === "number" && Number.isInteger(row) && row >= 0))].sort((a, b) => a - b);
    for (const row of rowNumbers) {
      const spans = cells.filter(span => span.row === row).sort((a, b) => a.column! - b.column!);
      const isHeader = spans.every(span => span.isHeader);
      const start = Math.min(...spans.map(span => span.start));
      const end = Math.max(...spans.map(span => span.end));
      const first = map.text.slice(spans[0]!.start, spans[0]!.end).trim();
      const serial = /^\d+[.)]?$/u.test(first) ? first.replace(/[.)]$/u, "") : null;
      const sourceSpans = sourceLocations(map, { start, end });
      provisions.push({ id: hashRevision({ sourceVersionId, textHash: map.textHash,
          tableItemRef: table.itemRef, row }), candidateSegmentId: `source-table:${table.itemRef}:${row}`,
        parentId: schedule?.id ?? null, kind: isHeader ? "table" : "table_row",
        label: serial ?? `Row ${row + 1}`, text: map.text.slice(start, end), start, end,
        sourceSpans, childIds: [], structuralPath: [], inheritedParentIds: [],
        tableItemRef: table.itemRef, boundaryStatus: "complete",
        status: schedule && (serial || isHeader) && sourceSpans.every(span => span.physicalPage !== null)
          ? "candidate" : "needs_review" });
    }
  }

  // Redirect model-only row identities to the canonical source row, including
  // targets and children that were attached to the discarded spelling alias.
  for (const segment of candidate.segments.filter(segment => !bySegment.has(segment.id))) {
    const rows = provisions.filter(p => p.tableItemRef && p.start <= segment.span.start && p.end >= segment.span.end);
    if (rows.length === 1) bySegment.set(segment.id, rows[0]!.id);
  }
  for (const provision of provisions) {
    if (provision.parentId) continue;
    const original = candidate.segments.find(segment => segment.id === provision.candidateSegmentId);
    if (original?.parent && bySegment.has(original.parent) && bySegment.get(original.parent) !== provision.id) {
      provision.parentId = bySegment.get(original.parent)!;
    }
  }

  // Attach orphan provisions with parentId: null (illustrations, footnotes, points, etc.)
  for (const provision of provisions) {
    if (provision.parentId === null && ["illustration", "footnote", "point", "list_item", "subparagraph", "subsection", "table_row"].includes(provision.kind)) {
      const container = containingProvision(provision.start, provision.end, provisions.filter(p => p.id !== provision.id));
      if (container) {
        provision.parentId = container.id;
      }
    }
  }

  // Marginal headings and page boundaries can split a numbered definitions section.
  // Its effective range ends at the next structural section, even if its model span
  // stops earlier. Only reparent top-level, source-anchored definition clauses.
  const sectionDirectory = provisions.filter(item => ["section", "article", "rule"].includes(item.kind))
    .sort((a, b) => a.start - b.start);
  for (const provision of provisions.filter(item => item.kind === "definition")) {
    const parent = provisions.find(item => item.id === provision.parentId);
    if (!/^\s*\(\s*[a-z0-9]{1,3}\s*\)\s*["'“‘]/iu.test(provision.text) ||
      !/\b(?:means|includes|has the meaning|refers to)\b/iu.test(provision.text.slice(0, 180))) continue;
    const preceding = sectionDirectory.filter(item => item.start < provision.start).at(-1);
    if (!preceding ||
      !/^(?:\d+[a-z]?\s*[.)]|(?:section|article|rule)\s+\d+[a-z]?\b)/iu.test(preceding.text.trimStart())) continue;
    if (parent?.id === preceding.id ||
      parent && ["subsection", "paragraph", "definition"].includes(parent.kind) &&
      parent.start <= provision.start && parent.end >= provision.end) continue;
    provision.parentId = preceding.id;
    warnings.push(`Definition parent repaired from source directory: ${provision.id}`);
  }

  // Break any parent cycles (e.g. from LLM hallucinations where provisions mutually parent each other)
  for (const provision of provisions) {
    let curr = provision.parentId;
    const seen = new Set<string>([provision.id]);
    while (curr) {
      if (seen.has(curr)) {
        provision.parentId = null;
        break;
      }
      seen.add(curr);
      const parent = provisions.find(p => p.id === curr);
      curr = parent?.parentId ?? null;
    }
  }

  const byId = new Map(provisions.map(p => [p.id, p]));
  for (const provision of provisions) {
    const identity = provisionIdentity(provision, byId);
    provision.canonicalCitation = computeCanonicalCitation(provision, identity);
  }
  for (const provision of provisions) {
    const parent = provision.parentId ? byId.get(provision.parentId) : null;
    if (parent && !provisionIdentity(provision, byId)) {
      if (/^\s*explanation\b/iu.test(provision.text)) provision.canonicalCitation = `${parent.canonicalCitation} explanation`;
      if (provision.kind === "illustration") {
        const marker = /^\s*\(\s*([IVXLCDM]+)\s*\)/u.exec(provision.text)?.[1];
        provision.canonicalCitation = `${parent.canonicalCitation} illustration${marker ? ` ${marker}` : ""}`;
      }
    }
  }
  structuralPaths(provisions);

  const unresolvedText = uncoveredText(map.text, provisions.map(provision => ({ start: provision.start, end: provision.end })));
  for (const gap of unresolvedText) warnings.push(`Unclassified source text at ${gap.start}-${gap.end}`);
  const relationships: DraftRelationship[] = [];
  const addRelationship = (occurrence: { id: string; start: number; end: number; exactMention: string;
    targetHint?: string | null; externalInstrumentHint?: string | null }, detectedBy: "model" | "source_detector",
    directTargetIds: string[] = [], resolutionStatus?: string, address?: CitationPath) => {
    const owner = containingProvision(occurrence.start, occurrence.end, provisions);
    if (owner && occurrence.start === owner.start && /^(?:section|article|rule)\s+\w+$/iu.test(occurrence.exactMention.trim()) &&
      citationKey(occurrence.exactMention) === citationKey(owner.canonicalCitation ?? "")) return;
    const instrument = occurrence.externalInstrumentHint ?? externalInstrumentForMention(map.text, occurrence.start, occurrence.end);
    const external = resolutionStatus === "external" || !!instrument;
    const addresses = citationPaths(occurrence.exactMention);
    if (!external && !address && addresses.length > 1) {
      for (const targetAddress of addresses) addRelationship(occurrence, detectedBy, [], resolutionStatus, targetAddress);
      return;
    }
    const localTargets = external || address ? null : bareRelativeTargets(occurrence.exactMention, owner, provisions);
    if (owner && localTargets) {
      for (const localTarget of localTargets) {
        const id = hashRevision({ sourceVersionId, start: occurrence.start, end: occurrence.end,
          sourceProvisionId: owner.id, targetProvisionId: localTarget.id });
        const existing = relationships.find(relation => relation.id === id);
        if (existing) {
          if (!existing.detectedBy.includes(detectedBy)) existing.detectedBy.push(detectedBy);
          continue;
        }
        relationships.push({ id, occurrenceId: occurrence.id, sourceProvisionId: owner.id,
          targetProvisionId: localTarget.id, targetProvisionIds: [localTarget.id],
          exactMention: occurrence.exactMention, start: occurrence.start, end: occurrence.end,
          status: "proposed", relationType: "explicit_relative_reference", detectedBy: [detectedBy],
          targetHint: occurrence.targetHint ?? occurrence.exactMention, externalTarget: null, rangeTarget: null });
      }
      return;
    }
    const directTargets = directTargetIds.map(id => bySegment.get(id)).filter((id): id is string => !!id)
      .map(id => provisions.find(provision => provision.id === id)!).filter(Boolean);
    const range = referencedRange(occurrence.exactMention, provisions);
    const targetText = address ? `${address.kind} ${address.number}${address.subpoints.map(p => `(${p})`).join("")}` : occurrence.exactMention;
    const targets = [...targetCandidates(targetText, provisions),
      ...(!address ? relativeTargets(occurrence.exactMention, owner, provisions) : []), ...(range?.candidates ?? [])]
      .filter(target => target.id !== owner?.id);
    // Parsed source citations take precedence over unconstrained model-local target hints.
    const candidates = external ? [] : [...new Map([...((addresses.length || targets.length) ? [] : directTargets), ...targets]
      .map(target => [target.id, target])).values()];
    const target = candidates.length === 1 ? candidates[0]! : null;
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
      sourceProvisionId: owner?.id ?? null, ...(address ? { address } : {}) });
    const existing = relationships.find(relation => relation.id === identity);
    if (existing) {
      if (!existing.detectedBy.includes(detectedBy)) existing.detectedBy.push(detectedBy);
      existing.targetProvisionIds = [...new Set([...existing.targetProvisionIds, ...candidates.map(item => item.id)])];
      existing.relationType = existing.relationType || relationType;
      if (external && !existing.externalTarget) {
        existing.externalTarget = { instrumentHint: instrument ??
          occurrence.targetHint ?? occurrence.exactMention, provisionHint: occurrence.exactMention,
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
      externalTarget: external ? { instrumentHint: instrument ?? occurrence.targetHint ?? occurrence.exactMention,
        provisionHint: occurrence.exactMention, versionStatus: "unresolved", availability: "unavailable" } : null,
      rangeTarget: range ? { kind: range.kind, from: range.from, to: range.to, complete: range.complete } : null });
  };
  for (const occurrence of detection.references) addRelationship(occurrence, "source_detector");
  candidate.references.forEach((reference, index) => addRelationship({ id: `model:${index}`,
    start: reference.start, end: reference.end, exactMention: reference.exactMention,
    targetHint: reference.targetHint }, "model", reference.targetSegmentIds, reference.resolutionStatus));

  const definitions = collectDefinitions(provisions);
  for (const definition of definitions) if (definition.scopeStatus !== "document") {
    warnings.push(`Definition scope requires review: ${definition.term} (${definition.scopeStatus})`);
  }
  if (definitions.length > 0) {
    const linkedTerms = new Set<string>();
    const occupiedByOwner = new Map<string, Array<{ start: number; end: number }>>();
    const terms = [...new Set(definitions.map(definition => definition.term))]
      .sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const escaped = term.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
      const regex = new RegExp(`\\b${escaped}\\b`, "giu");
      for (const provision of provisions) {
        for (const match of provision.text.matchAll(regex)) {
          const start = provision.start + match.index!;
          const end = start + match[0].length;
          const owner = containingProvision(start, end, provisions);
          if (!owner || owner.id !== provision.id || definitions.some(d => start >= d.start && start < d.end)) continue;
          const occupied = occupiedByOwner.get(owner.id) ?? [];
          if (occupied.some(span => span.start < end && start < span.end)) continue;
          let matches = definitions.filter(d => d.provisionId !== owner.id && d.term.toLowerCase() === term.toLowerCase() && definitionApplies(d, owner, byId));
          // Prefer the narrowest applicable scope, retaining ties as ambiguity.
          const scopeSize = (d: typeof definitions[number]) => d.scopeProvisionId ?
            (byId.get(d.scopeProvisionId)!.end - byId.get(d.scopeProvisionId)!.start) : Infinity;
          const minimum = Math.min(...matches.map(scopeSize));
          matches = matches.filter(d => scopeSize(d) === minimum);
          if (!matches.length) continue;
          occupied.push({ start, end });
          occupiedByOwner.set(owner.id, occupied);
          const edgeKey = JSON.stringify([owner.id, term.toLowerCase(),
            matches.map(d => d.provisionId).sort()]);
          if (linkedTerms.has(edgeKey)) continue;
          linkedTerms.add(edgeKey);
          addRelationship({
            id: `def:${term}:${start}`,
            start,
            end,
            exactMention: match[0],
            targetHint: term,
          }, "source_detector", matches.map(d => byId.get(d.provisionId)!.candidateSegmentId),
          matches.length === 1 ? "resolved" : "ambiguous");
        }
      }
    }
  }

  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash, provisions,
    relationships, unresolvedText, warnings,
    status: warnings.length ? "needs_review" : "candidate_ready" };
}
