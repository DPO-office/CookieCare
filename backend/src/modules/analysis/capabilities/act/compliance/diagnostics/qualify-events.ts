export interface OutcomeEvent {
  event: string;
  checkId?: string;
  outcomeId?: string;
  kind?: string;
  status?: string;
  checkIds?: string[];
  expectedCheckIds?: string[];
  actualCheckIds?: string[];
  [key: string]: unknown;
}
/** Qualification observes results; it never repairs or creates business outcomes. */
export function qualifyOutcomeEvents(events: OutcomeEvent[]) {
  const start = events.reduce((last,event,index)=>event.event==="compliance.checks.expected" ? index : last,-1);
  events = start < 0 ? [] : events.slice(start);
  const expected = [...events].reverse().find(e => e.event === "compliance.checks.expected")?.checkIds ?? [];
  const rendered = events.filter(e => e.event === "compliance.outcome.rendered");
  const ids = rendered.map(e => e.checkId ?? "");
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const unexpected = [...new Set(ids.filter(id => !expected.includes(id)))];
  const missing = expected.filter(id => !ids.includes(id));
  const rows = expected.map(checkId => {
    const entries = rendered.filter(e => e.checkId === checkId), row = entries[0];
    const errors: string[] = [];
    if (entries.length !== 1)
      errors.push("expected_one_visible_outcome");
    if (!row?.outcomeId || !["assessment", "incomplete"].includes(String(row?.kind)))
      errors.push("invalid_terminal_outcome");
    if (row?.kind === "incomplete" && row.status !== "verification_incomplete")
      errors.push("failure_disguised_as_legal_conclusion");
    if (row?.kind === "assessment" && !row.lockedAssessmentId)
      errors.push("assessment_without_lock");
    return { checkId, status: String(row?.status ?? "missing"), kind: row?.kind, errors };
  });
  const reconciliation = [...events].reverse().find(e => e.event === "compliance.outcome.reconciliation");
  const reconciled = JSON.stringify([...(reconciliation?.expectedCheckIds ?? [])].sort()) === JSON.stringify([...expected].sort())
    && JSON.stringify([...(reconciliation?.actualCheckIds ?? [])].sort()) === JSON.stringify([...ids].sort());
  return { rows, missing, duplicates, unexpected, pass: expected.length > 0 && reconciled && !missing.length && !duplicates.length && !unexpected.length && rows.every(r => !r.errors.length) };
}
