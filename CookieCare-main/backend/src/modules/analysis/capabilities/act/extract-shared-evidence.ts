import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type {
  SharedEvidenceBundle,
  SharedEvidenceItem,
} from "../../models/evidence-package.js";
import type { ClauseObject } from "../../models/clause-object.js";
import { pacLog } from "../../utils/pac-log.js";

/**
 * Prefer fewer complete evidence units over many clipped stubs.
 * Do not raise this above the historical 40-item package cap.
 */
const MAX_ITEMS_PER_PACKAGE = 12;

/** Shared bundle key for leftover / focused matrix-row evaluations. */
export const MATRIX_SHARED_EVIDENCE_PACKAGE_ID = "_matrix_shared";

/**
 * Shared evidence extraction (ACT refactor doc §5).
 *
 * Reuses the clauses already extracted once by `extract_clauses` (no second LLM
 * pass, no parallel evidence store): selects the subset relevant to the
 * package's clause types and stores it as a reusable bundle keyed by packageId.
 * All requirement evaluations in the package then reason over this one bundle.
 */
export function extractSharedEvidence(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const docId = String(unit.input.docId ?? "");
  const packageId = String(unit.input.packageId ?? "");
  const clauseTypes = (unit.input.clauseTypes as string[]) ?? [];

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];

  const relevant = selectRelevantClauses(clauses, clauseTypes);
  const items: SharedEvidenceItem[] = relevant
    .slice(0, MAX_ITEMS_PER_PACKAGE)
    .map((clause, index) => ({
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
function selectRelevantClauses(
  clauses: ClauseObject[],
  clauseTypes: string[]
): ClauseObject[] {
  if (clauseTypes.length === 0) return clauses;
  const wanted = new Set(clauseTypes);
  const matched = clauses.filter((c) => wanted.has(c.clauseType));
  return matched.length > 0 ? matched : clauses;
}
