import type { ComplianceReportRow, ComplianceReportSnapshot } from "../../../../models/compliance-report.js";
/** Historical conclusions are preserved; unknown coverage is never inferred as complete. */
export function adaptPersistedSnapshot(snapshot: ComplianceReportSnapshot): ComplianceReportSnapshot {
  if (snapshot.version === 2)
    return snapshot;
  return { ...snapshot, version: 2, rows: snapshot.rows.map(row => ({ ...row, outcomeId: row.outcomeId ?? row.lockedAssessmentId ?? row.rowId, outcomeKind: row.outcomeKind ?? "assessment" })) };
}
export function reportOutcomeId(row: ComplianceReportRow): string {
  return row.outcomeId ?? row.lockedAssessmentId ?? row.rowId;
}
