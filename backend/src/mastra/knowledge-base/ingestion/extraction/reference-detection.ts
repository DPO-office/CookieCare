import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import { isRangePurelyNonSubstantive } from "./layout-zones.js";
import { sourceLocations, type SourceLocation } from "./structure-provider.js";

export interface DetectedReference {
  id: string;
  start: number;
  end: number;
  exactMention: string;
  kind: "rule" | "section" | "article" | "schedule" | "relative" | "external" | "chapter" | "part" | "title" | "division" | "annex";
  targetHint: string;
  externalInstrumentHint: string | null;
  sourceSpans: SourceLocation[];
  resolutionStatus: "unresolved";
}
export interface ReferenceDetection {
  schemaVersion: 1;
  sourceVersionId: string;
  textHash: string;
  detectorVersion: "2";
  references: DetectedReference[];
  warnings: string[];
}

const ORDINAL = "(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)";
const PATTERNS: Array<{ kind: DetectedReference["kind"]; expression: RegExp }> = [
  { kind: "chapter", expression: /\bchapters?\s+([IVXLCDM]+|\d+[a-z]?)(?:\s*(?:,|and|or)\s*(?:chapters?\s+)?([IVXLCDM]+|\d+[a-z]?))*/giu },
  { kind: "part", expression: /\bparts?\s+([IVXLCDM]+|\d+[a-z]?)(?:\s*(?:,|and|or)\s*(?:parts?\s+)?([IVXLCDM]+|\d+[a-z]?))*/giu },
  { kind: "title", expression: /\btitles?\s+([IVXLCDM]+|\d+[a-z]?)(?:\s*(?:,|and|or)\s*(?:titles?\s+)?([IVXLCDM]+|\d+[a-z]?))*/giu },
  { kind: "section", expression: /\b(?:clauses?|points?)\s+\(\s*[a-z0-9]+\s*\)\s+of\s+sub-?section\s+\(\s*\d+(?:\.\d+)*[a-z]?\s*\)\s+of\s+section\s+\d+(?:\.\d+)*[a-z]?/giu },
  { kind: "section", expression: /\bsections?\s+\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*(?:\s*(?:,|and|or)\s*\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*)+/giu },
  { kind: "article", expression: /\barticles?\s+\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*(?:\s*(?:,|and|or)\s*\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*)+/giu },
  { kind: "rule", expression: /\brules?\s+\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*(?:\s*(?:,|and|or)\s*\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*)+/giu },
  { kind: "schedule", expression: new RegExp(`\\b(?:${ORDINAL}\\s+Schedule|Schedule\\s+(?:[IVX]+|\\d+)|The\\s+Schedule)\\b`, "giu") },
  { kind: "section", expression: /\b(?:sub-?sections?|clauses?|paragraphs?)\s+((?:\(\s*[a-z0-9]+\s*\)(?:\s*(?:and|,)\s*)?)+)\s+of\s+sections?\s+\d+[A-Za-z]?\b/giu },
  { kind: "rule", expression: /\brules?\s+\d+[A-Za-z]?\s*[-\u2010-\u2015]\s*\d+[A-Za-z]?/giu },
  { kind: "section", expression: /\bsections?\s+\d+[A-Za-z]?\s*[-\u2010-\u2015]\s*\d+[A-Za-z]?/giu },
  { kind: "article", expression: /\barticles?\s+\d+[A-Za-z]?\s*[-\u2010-\u2015]\s*\d+[A-Za-z]?/giu },
  { kind: "rule", expression: /\brules?\s+\d+[A-Za-z]?(?:\s*\(\s*\d+[A-Za-z]?\s*\))*/giu },
  { kind: "section", expression: /\bsections?\s+\d+(?:\.\d+)*[A-Za-z]?(?:\s*\(\s*[A-Za-z0-9]+\s*\))*/giu },
  { kind: "article", expression: /\barticles?\s+\d+(?:\.\d+)*[A-Za-z]?(?:\s*[-–—]\s*\d+(?:\.\d+)*[A-Za-z]?)?(?:\s*\(\s*[A-Za-z0-9]+\s*\))*/giu },
  { kind: "relative", expression: /\b(?:clauses?|paragraphs?|points?)\s+\(?\s*[A-Za-z0-9]+\s*\)?\s+of\s+(?:sub-?sections?|paragraphs?)\s+\(?\s*\d+[A-Za-z]?\s*\)?\b/giu },
  { kind: "relative", expression: /\b(?:paragraph|subparagraph|point|sub-section|clause)\s+\(?[A-Za-z0-9]+\)?\s+of\s+this\s+(?:article|rule|section)\b/giu },
  { kind: "relative", expression: /\b(?:sub-?sections?|paragraphs?|clauses?|points?|subparagraphs?)\s+(?:\(\s*[A-Za-z0-9]+\s*\)|\d+[A-Za-z]?)(?:\s*(?:,|and|or)\s*(?:\(\s*[A-Za-z0-9]+\s*\)|\d+[A-Za-z]?))*/giu },
  { kind: "relative", expression: /\b(?:for the purposes of|under|in)\s+this\s+(?:section|chapter|part|act|rule|schedule|article)\b/giu },
  { kind: "external", expression: /\b(?:(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,8}\s+)?(?:Act|Code|Regulation|Directive|Convention)[,\s]+\d{4}(?:\/\d+)?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,8}\s+(?:Act|Code|Regulation|Directive|Convention)(?:,?\s+\d{4})?|(?:Regulation|Directive)\s+\(EU\)\s+\d{4}\/\d+)\b/gu },
];

/** Independent of Kanon so missed model references remain visible for review. */
export function detectReferences(map: SourceMap, sourceVersionId: string): ReferenceDetection {
  const references: DetectedReference[] = [];
  const warnings: string[] = [];
  for (const { kind, expression } of PATTERNS) {
    expression.lastIndex = 0;
    for (const match of map.text.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      if (isRangePurelyNonSubstantive(map, start, end)) continue;
      if (kind === "relative" && !/\bof\b/iu.test(match[0]) &&
        /^\s+of\s+(?:(?:this|the)\s+)?(?:section|article|rule)\b/iu.test(map.text.slice(end, end + 48))) {
        continue; // The longer absolute citation is handled by its own detector.
      }
      const sourceSpans = sourceLocations(map, { start, end });
      if (!sourceSpans.length || sourceSpans.some(span => span.physicalPage === null)) {
        warnings.push(`Reference has uncertain PDF location: ${match[0]} at ${start}`);
      }
      const exactMention = map.text.slice(start, end);
      references.push({ id: hashRevision({ sourceVersionId, textHash: map.textHash, start, end, kind }),
        start, end, exactMention, kind, targetHint: exactMention,
        externalInstrumentHint: kind === "external" ? exactMention : null,
        sourceSpans, resolutionStatus: "unresolved" });
    }
  }
  const completeReferences = references.filter(reference => !references.some(other =>
    other !== reference && other.kind === reference.kind && other.start <= reference.start &&
    other.end >= reference.end && other.end - other.start > reference.end - reference.start));
  completeReferences.sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash,
    detectorVersion: "2", references: completeReferences, warnings };
}
