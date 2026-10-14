import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import { sourceLocations, type SourceLocation } from "./structure-provider.js";

export interface DetectedReference {
  id: string;
  start: number;
  end: number;
  exactMention: string;
  kind: "rule" | "section" | "article" | "schedule";
  sourceSpans: SourceLocation[];
  resolutionStatus: "unresolved";
}
export interface ReferenceDetection {
  schemaVersion: 1;
  sourceVersionId: string;
  textHash: string;
  detectorVersion: "1";
  references: DetectedReference[];
  warnings: string[];
}

const ORDINAL = "(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)";
const PATTERNS: Array<{ kind: DetectedReference["kind"]; expression: RegExp }> = [
  { kind: "schedule", expression: new RegExp(`\\b(?:${ORDINAL}\\s+Schedule|Schedule\\s+(?:[IVX]+|\\d+))\\b`, "giu") },
  { kind: "rule", expression: /\brules?\s+\d+[A-Za-z]?(?:\s*\(\s*\d+[A-Za-z]?\s*\))*/giu },
  { kind: "section", expression: /\bsections?\s+\d+[A-Za-z]?(?:\s*\(\s*\d+[A-Za-z]?\s*\))*/giu },
  { kind: "article", expression: /\barticles?\s+\d+[A-Za-z]?(?:\s*\(\s*\d+[A-Za-z]?\s*\))*/giu },
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
      const sourceSpans = sourceLocations(map, { start, end });
      if (!sourceSpans.length || sourceSpans.some(span => span.physicalPage === null)) {
        warnings.push(`Reference has uncertain PDF location: ${match[0]} at ${start}`);
      }
      references.push({ id: hashRevision({ sourceVersionId, textHash: map.textHash, start, end, kind }),
        start, end, exactMention: map.text.slice(start, end), kind,
        sourceSpans, resolutionStatus: "unresolved" });
    }
  }
  references.sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash,
    detectorVersion: "1", references, warnings };
}
