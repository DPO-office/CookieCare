const INTERNAL_STATUS_TOKEN = /\[(present|absent_expected|insufficient_evidence)\]/gi;
const RAW_FINDING_LINE =
  /^\s*-\s+(?:\*\*)?\[(?:present|absent_expected|insufficient_evidence)\][^\n]*$/gim;
const TOOL_STAGE_LINE =
  /^\s*#{1,6}\s+(?:Checking compliance rules|Flagging risks|Evaluating data-subject rights|Extracting playbook positions|Unverified reference lookup|Writing report)\s*$/gim;
const RAW_VERIFICATION_REJECTION =
  /Could not verify that the target document satisfies rule [^:.\n]+(?:\.[^:.\n]+)*:\s*no verbatim supporting quote was returned\.?/gi;

const INTERNAL_VERIFICATION_CLAIM =
  /^Could not verify that the target document satisfies rule [^:]+:\s*no verbatim supporting quote was returned\.?$/i;

/** Rewrite pipeline verifier jargon into honest user-facing wording. */
export function userSafeFindingClaim(claim: string): string {
  if (INTERNAL_VERIFICATION_CLAIM.test(claim)) {
    return "Insufficient data — no related clauses were found.";
  }
  if (/^Could not evaluate rule .+ \(LLM unavailable\)\.?$/i.test(claim)) {
    return "This obligation could not be evaluated because analysis was temporarily unavailable.";
  }
  if (/^No clause available to evaluate rule .+\.?$/i.test(claim)) {
    return "No related clauses were found.";
  }
  if (/^Previous attempt was rejected:/i.test(claim)) {
    return "The prior assessment could not be confirmed from the document text.";
  }
  return claim;
}

export function sanitizeFindingsForApi<T extends { claim: string; gap?: string; visibility?: string }>(
  findings: T[]
): T[] {
  return findings
    .filter((finding) => finding.visibility !== "internal")
    .map((finding) => ({
      ...finding,
      claim: userSafeFindingClaim(finding.claim),
      gap:
        finding.gap && INTERNAL_VERIFICATION_CLAIM.test(finding.gap)
          ? "No related clauses were found in the reviewed text."
          : finding.gap,
    }));
}

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
    .replace(
      RAW_VERIFICATION_REJECTION,
      "Insufficient data — no related clauses were found."
    )
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
    /\[(present|absent_expected|insufficient_evidence)\]/i.test(value) ||
    /Could not verify that the target document satisfies rule/i.test(value)
  );
}
