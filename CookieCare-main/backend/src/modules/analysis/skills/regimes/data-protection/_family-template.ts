import type { RightsMatrixRow } from "../../types.js";

/**
 * Family template for data-protection regimes — next privacy-law skill should
 * call this instead of hand-rolling matrix row shape.
 */
export function buildDataProtectionRightsMatrix(
  regimeId: string,
  rightsMap: { rowId: string; localArticleOrSection: string; label: string }[]
): RightsMatrixRow[] {
  return rightsMap.map((r) => ({
    rowId: r.rowId,
    article: r.localArticleOrSection,
    label: r.label,
    family: "data-protection",
    regimeId,
  }));
}
