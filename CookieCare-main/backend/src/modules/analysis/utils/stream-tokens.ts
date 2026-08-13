import type { AnalysisState } from "../models/analysis-state.js";
import type { Finding } from "../models/finding.js";

export function emitAnalysisToken(state: AnalysisState, delta: string): void {
  if (!delta) return;
  state.onToken?.(delta);
}

export function isUserFacingFinding(finding: Finding): boolean {
  return finding.visibility !== "internal";
}

export function formatFindingMarkdown(finding: Finding): string {
  const severity = finding.severity ? ` (${finding.severity})` : "";
  const quote = finding.evidence?.[0]?.quotedText
    ? `\n  - Evidence: "${finding.evidence[0].quotedText.slice(0, 200)}"`
    : "";
  return `- **[${finding.status}] ${finding.category}**${severity}: ${finding.claim}${quote}`;
}

export function emitNewFindings(
  state: AnalysisState,
  previous: Finding[],
  next: Finding[]
): void {
  const priorIds = new Set(previous.map((f) => f.findingId));
  const fresh = next.filter((f) => !priorIds.has(f.findingId) && isUserFacingFinding(f));
  if (!fresh.length) return;
  emitAnalysisToken(
    state,
    fresh.map((f) => formatFindingMarkdown(f)).join("\n") + "\n\n"
  );
}
