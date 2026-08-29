import crypto from "crypto";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { Finding } from "../../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";

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

/**
 * Stamp `finding.requirementId` on findings produced by a requirement-aware
 * work unit. This is the ONLY authoritative link between PLAN requirements
 * and ACT findings — aggregation must not have to guess.
 *
 * - Findings already carrying `requirementId` are left untouched (package
 *   handlers set it inline).
 * - When the unit binds to a single requirement, the id is copied over.
 * - When the unit binds to multiple requirements (rare — one rule serving
 *   several requirements), the finding is duplicated once per requirement
 *   with a stable, unique `findingId` suffix.
 *
 * Only findings that are NEW in `after` (compared to `before`) are stamped;
 * carry-over findings from prior handlers are never mutated.
 */
export function stampRequirementIdsOnNewFindings(
  unit: AnalysisWorkUnit,
  before: Finding[],
  after: Finding[]
): Finding[] {
  const reqIds = unit.requirementIds ?? [];
  if (reqIds.length === 0) return after;
  const beforeIds = new Set(before.map((f) => f.findingId));
  const out: Finding[] = [];
  for (const f of after) {
    if (beforeIds.has(f.findingId) || f.requirementId) {
      out.push(f);
      continue;
    }
    if (reqIds.length === 1) {
      out.push({ ...f, requirementId: reqIds[0] });
      continue;
    }
    for (const reqId of reqIds) {
      const safe = reqId.replace(/[^a-zA-Z0-9._-]/g, "-");
      out.push({
        ...f,
        findingId: `${f.findingId}__req_${safe}`,
        requirementId: reqId,
      });
    }
  }
  return out;
}

/**
 * Per-finding requirement lookup for handlers that emit findings across
 * multiple categories/clauseTypes in a single unit (flag_risk,
 * check_expected_clauses). Handlers pass the capability id they matched
 * on (typically `Finding.category` or the expected `clauseType`) and get
 * back the mapped requirement id, or undefined when no mapping exists.
 *
 * When multiple requirements map to the same capability, the caller should
 * emit one stamped finding per requirement — this helper only returns the
 * full list for the caller to decide.
 */
export function requirementIdsForCapability(
  capabilityId: string,
  mappings: Array<{ capabilityId: string; requirementId: string }> | undefined
): string[] {
  if (!mappings || mappings.length === 0) return [];
  const out: string[] = [];
  for (const m of mappings) {
    if (m.capabilityId === capabilityId && !out.includes(m.requirementId)) {
      out.push(m.requirementId);
    }
  }
  return out;
}

/**
 * Per-finding requirement stamping for handlers that emit multiple findings
 * per unit, each tied to a specific capability id. The caller passes a
 * `keysFor(finding)` function returning the capability keys to try in order
 * (e.g. `[finding.category]` for flag_risk, `[finding.category, clauseType]`
 * for check_expected_clauses).
 *
 * Only new findings (not in `before`) with no pre-existing `requirementId`
 * are considered. Multi-requirement matches fan out; no-match findings stay
 * orphaned (correct: no user requirement asked about them).
 */
export function stampFindingsByCapability(
  unit: AnalysisWorkUnit,
  before: Finding[],
  after: Finding[],
  keysFor: (finding: Finding) => Array<string | undefined>
): Finding[] {
  const mappings =
    (unit.input.requirementMappings as
      | Array<{ capabilityId: string; requirementId: string }>
      | undefined) ?? [];
  if (mappings.length === 0) return after;
  const beforeIds = new Set(before.map((f) => f.findingId));
  const out: Finding[] = [];
  for (const f of after) {
    if (beforeIds.has(f.findingId) || f.requirementId) {
      out.push(f);
      continue;
    }
    const reqIds: string[] = [];
    for (const key of keysFor(f)) {
      if (!key) continue;
      for (const rid of requirementIdsForCapability(key, mappings)) {
        if (!reqIds.includes(rid)) reqIds.push(rid);
      }
      if (reqIds.length > 0) break;
    }
    if (reqIds.length === 0) {
      out.push(f);
      continue;
    }
    if (reqIds.length === 1) {
      out.push({ ...f, requirementId: reqIds[0] });
      continue;
    }
    for (const reqId of reqIds) {
      const safe = reqId.replace(/[^a-zA-Z0-9._-]/g, "-");
      out.push({
        ...f,
        findingId: `${f.findingId}__req_${safe}`,
        requirementId: reqId,
      });
    }
  }
  return out;
}

/** Compile an authored regex source. Invalid patterns are ignored. */
export function compileAuthoredRegex(source: string | undefined): RegExp | null {
  const trimmed = source?.trim();
  if (!trimmed) return null;
  try {
    return new RegExp(trimmed, "i");
  } catch {
    return null;
  }
}

export function interpolateMatch(template: string, match?: string): string {
  return template.replace(/\{match\}/g, match ?? "");
}

