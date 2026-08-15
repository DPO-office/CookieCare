import crypto from "crypto";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";

export function insufficient(unit: AnalysisWorkUnit, claim: string): Finding {
  return {
    findingId: `f_insuff_${unit.workUnitId}_${crypto.randomUUID().slice(0, 8)}`,
    kind: "risk",
    category: "other_known_risk",
    status: "insufficient_evidence",
    claim,
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    visibility: "internal",
  };
}

export function locateText(
  fullText: string,
  excerpt: string,
  docId: string,
  structuralPath: string | undefined,
  index: number
): { locator: { docId: string; structuralPath: string; charRange: [number, number] }; text: string } {
  const needle = excerpt.trim();
  const idx = fullText.indexOf(needle.slice(0, Math.min(80, needle.length)));
  if (idx >= 0) {
    const end = Math.min(fullText.length, idx + needle.length);
    return {
      text: fullText.slice(idx, end),
      locator: {
        docId,
        structuralPath: structuralPath || `clause-extracted-${index + 1}`,
        charRange: [idx, end],
      },
    };
  }
  return {
    text: needle,
    locator: {
      docId,
      structuralPath: structuralPath || `clause-extracted-${index + 1}`,
      charRange: [0, Math.min(fullText.length, needle.length)],
    },
  };
}

export function fullTextLikelyHasClause(
  fullText: string,
  synonyms: string[] = []
): boolean {
  const lower = fullText.toLowerCase();
  return synonyms.some((s) => lower.includes(s.toLowerCase()));
}
