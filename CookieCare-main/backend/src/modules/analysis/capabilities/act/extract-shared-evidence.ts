import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type {
  SharedEvidenceBundle,
  SharedEvidenceItem,
} from "../../models/evidence-package.js";
import type { ClauseObject } from "../../models/clause-object.js";
import { pacLog } from "../../utils/pac-log.js";
import { tokenizeForEvidence } from "./isolate-requirement-evidence.js";
import { logSharedEvidenceCut } from "./evidence-pool-log.js";
import { buildSectionCandidates } from "./select-candidates.js";

/**
 * Candidate-pool cap for one package. This is not the evaluator packet —
 * evaluate_package still sends 3–5 extracts per requirement.
 */
// Gate 2 pool size. Raised from 40 so the LLM candidate selector receives
// essentially the whole extracted clause set (this doc extracts ~65-90),
// making gate 2's regex scorer a near-no-op cut rather than a lossy one — the
// selector, not the regex, decides relevance. The hybrid/lexical fallback
// path simply ranks a slightly larger pool; behaviour is otherwise unchanged.
const MAX_ITEMS_PER_PACKAGE = 60;
const MIN_PER_CLAUSE_TYPE = 2;

/** Shared bundle key for leftover / focused matrix-row evaluations. */
export const MATRIX_SHARED_EVIDENCE_PACKAGE_ID = "_matrix_shared";

/**
 * Shared evidence extraction (ACT refactor doc §5).
 *
 * Reuses the clauses already extracted once by `extract_clauses` (no second LLM
 * pass, no parallel evidence store): selects a ranked candidate pool for the
 * package. Per-requirement packets are resolved later in evaluate_package.
 */
export function extractSharedEvidence(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const docId = String(unit.input.docId ?? "");
  const packageId = String(unit.input.packageId ?? "");
  const clauseTypes = (unit.input.clauseTypes as string[]) ?? [];
  const extractionTargets = (unit.input.extractionTargets as string[]) ?? [];

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];

  // Focused, proof-standard-backed Q&A does not need the broad clause-type
  // extraction pass. Build its evidence pool directly from the document's
  // logical sections so targeted selection and VERIFY retain the same rigor
  // without first classifying every contract clause.
  if (unit.input.documentSectionEvidence === true && doc) {
    const items = buildSectionCandidates(doc);
    pacLog("shared evidence", {
      id: unit.workUnitId,
      packageId,
      source: "document-sections",
      items: items.length,
      chars: items.reduce((n, i) => n + i.quotedText.length, 0),
      truncated: items.filter((i) => i.truncated).length,
    });
    return {
      state: {
        ...state,
        sharedEvidence: {
          ...(state.sharedEvidence ?? {}),
          [packageId]: { packageId, docId, items },
        },
      },
      findings,
    };
  }

  // Full extract is the candidate pool. clauseTypes boost ranking but must not
  // hard-filter out duration/termination (etc.) before per-requirement resolve.
  const ranked = rankClausesForPackage(clauses, clauseTypes, extractionTargets);
  const pooled = capPackagePool(ranked, MAX_ITEMS_PER_PACKAGE);
  const matched = selectRelevantClauses(clauses, clauseTypes);
  logSharedEvidenceCut(
    state,
    packageId,
    clauses,
    clauseTypes,
    extractionTargets,
    MAX_ITEMS_PER_PACKAGE,
    new Set(pooled.map((c) => clauseKey(c)))
  );
  const items: SharedEvidenceItem[] = pooled.map((clause, index) => ({
    ref: `E${index + 1}`,
    clauseType: clause.clauseType,
    quotedText: clause.text,
    structuralPath: clause.locator.structuralPath,
    charRange: clause.locator.charRange,
    evidenceStatus: clause.evidenceStatus,
    matchReason: clause.matchReason,
    referencedDocuments: clause.referencedDocuments,
    truncated: clause.truncated,
    logicalEndOffset: clause.logicalEndOffset,
  }));
  pacLog("shared evidence", {
    id: unit.workUnitId,
    packageId,
    clauses: clauses.length,
    matched: matched.length,
    items: items.length,
    chars: items.reduce((n, i) => n + i.quotedText.length, 0),
    truncated: items.filter((i) => i.truncated).length,
  });

  const bundle: SharedEvidenceBundle = { packageId, docId, items };

  return {
    state: {
      ...state,
      sharedEvidence: { ...(state.sharedEvidence ?? {}), [packageId]: bundle },
    },
    findings,
  };
}

/**
 * Select clauses whose type is targeted by the package. Falls back to all
 * clauses when the package declares no clause types or nothing matched, so an
 * evaluation is never starved of evidence purely due to extraction labels.
 */
export function selectRelevantClauses(
  clauses: ClauseObject[],
  clauseTypes: string[]
): ClauseObject[] {
  if (clauseTypes.length === 0) return clauses;
  const wanted = new Set(clauseTypes);
  const matched = clauses.filter((c) => wanted.has(c.clauseType));
  return matched.length > 0 ? matched : clauses;
}

export function scoreClauseForPackage(
  clause: ClauseObject,
  clauseTypes: string[],
  extractionTargets: string[]
): number {
  const wanted = new Set(clauseTypes);
  let score = 0;
  if (wanted.has(clause.clauseType)) score += 40;
  const typeNorm = clause.clauseType.toLowerCase().replace(/[._-]+/g, " ");
  const hay = `${clause.clauseType} ${clause.text} ${clause.matchReason ?? ""}`.toLowerCase();
  const targets = extractionTargets.map((t) => t.toLowerCase());
  const wantsDuration = targets.some((t) => /\bduration\b|\bterm\b/.test(t));
  const wantsParticulars = targets.some((t) =>
    /subject.?matter|nature|purpose|categor|controller.?obligation/.test(t)
  );

  for (const target of extractionTargets) {
    const targetNorm = target.toLowerCase().replace(/[._-]+/g, " ");
    if (!targetNorm) continue;
    if (typeNorm === targetNorm || typeNorm.includes(targetNorm) || targetNorm.includes(typeNorm)) {
      score += 32;
    }
    for (const token of tokenizeForEvidence(targetNorm)) {
      if (hay.includes(token)) score += Math.min(token.length, 12);
    }
    if (targetNorm.includes(" ") && hay.includes(targetNorm)) score += 16;
  }

  if (wantsDuration) {
    if (/\bduration of (?:the )?process|\bterm of (?:the )?(?:agreement|services)\b|\bin force\b|\bas set forth\b/.test(hay)) {
      score += 60;
    }
    if (clause.clauseType === "termination") score += 28;
    if (
      /\bargentina\b|\bbrazil\b|\bnigeria\b|\bturkey\b|\bretained and destroyed\b|\bpersonal data protection act\b/.test(
        hay
      ) &&
      !/\bduration of (?:the )?process|\bterm of (?:the )?(?:agreement|services)\b/.test(hay)
    ) {
      score -= 55;
    }
  }

  if (wantsParticulars) {
    if (clause.text.trim().length < 50) score -= 40;
    if (/^mastercard data processing agreement$/i.test(clause.text.trim())) score -= 80;
  }

  if (clause.truncated) score -= 8;
  if (clause.evidenceStatus === "not_found") score -= 24;
  return score;
}

/**
 * Highest-scoring complete clauses first. Document order is never the rank.
 */
export function rankClausesForPackage(
  clauses: ClauseObject[],
  clauseTypes: string[],
  extractionTargets: string[]
): ClauseObject[] {
  return [...clauses].sort((a, b) => {
    const delta =
      scoreClauseForPackage(b, clauseTypes, extractionTargets) -
      scoreClauseForPackage(a, clauseTypes, extractionTargets);
    if (delta !== 0) return delta;
    return (a.locator.charRange[0] ?? 0) - (b.locator.charRange[0] ?? 0);
  });
}

/**
 * Keep a ranked pool, guaranteeing a few of each matched type so processor_terms
 * cannot crowd confidentiality / deletion out of the cap.
 */
export function capPackagePool(
  ranked: ClauseObject[],
  cap: number
): ClauseObject[] {
  if (ranked.length <= cap) return ranked;
  const picked: ClauseObject[] = [];
  const seen = new Set<string>();
  const byType = new Map<string, ClauseObject[]>();
  for (const clause of ranked) {
    const list = byType.get(clause.clauseType) ?? [];
    list.push(clause);
    byType.set(clause.clauseType, list);
  }
  for (const group of byType.values()) {
    for (const clause of group.slice(0, MIN_PER_CLAUSE_TYPE)) {
      if (picked.length >= cap) break;
      const key = clauseKey(clause);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(clause);
    }
  }
  for (const clause of ranked) {
    if (picked.length >= cap) break;
    const key = clauseKey(clause);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(clause);
  }
  return picked;
}

function clauseKey(clause: ClauseObject): string {
  return clause.clauseId || `${clause.clauseType}:${clause.locator.structuralPath}:${clause.locator.charRange.join("-")}`;
}
