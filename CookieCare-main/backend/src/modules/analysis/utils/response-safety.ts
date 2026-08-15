const INTERNAL_STATUS_TOKEN = /\[(present|absent_expected|insufficient_evidence)\]/gi;
const RAW_FINDING_LINE =
  /^\s*-\s+(?:\*\*)?\[(?:present|absent_expected|insufficient_evidence)\][^\n]*$/gim;
const TOOL_STAGE_LINE =
  /^\s*#{1,6}\s+(?:Checking compliance rules|Flagging risks|Evaluating data-subject rights|Extracting playbook positions|Unverified reference lookup|Writing report)\s*$/gim;

/**
 * Last-line defense for API responses. Raw ACT Finding dumps and tool headings
 * are internal telemetry and must never appear in user-visible output.
 */
export function sanitizeRenderedAnalysisOutput(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value
    .replace(RAW_FINDING_LINE, "")
    .replace(TOOL_STAGE_LINE, "")
    .replace(/Checking compliance rules/gi, "Compliance review")
    .replace(INTERNAL_STATUS_TOKEN, (_match, status: string) =>
      status.replace(/_/g, " ")
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsInternalAnalysisLeak(value: string | undefined): boolean {
  if (!value) return false;
  return (
    /Checking compliance rules/i.test(value) ||
    /\[(present|absent_expected|insufficient_evidence)\]/i.test(value)
  );
}
