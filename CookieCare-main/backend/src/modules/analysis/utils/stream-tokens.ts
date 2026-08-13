import type { AnalysisState } from "../models/analysis-state.js";
import type { Finding } from "../models/finding.js";

export function emitAnalysisToken(state: AnalysisState, delta: string): void {
  if (!delta) return;
  state.onToken?.(delta);
}

export function formatFindingMarkdown(finding: Finding): string {
  const severity = finding.severity ? ` (${finding.severity})` : "";
  const quote = finding.evidence?.[0]?.quotedText
    ? `\n  - Evidence: "${finding.evidence[0].quotedText.slice(0, 200)}"`
    : "";
  return `- **[${finding.status}] ${finding.category}**${severity}: ${finding.claim}${quote}`;
}

const SKIP_STREAM_KINDS = new Set(["summary_point"]);

export function emitNewFindings(
  state: AnalysisState,
  previous: Finding[],
  next: Finding[]
): void {
  const priorIds = new Set(previous.map((f) => f.findingId));
  const fresh = next.filter(
    (f) => !priorIds.has(f.findingId) && !SKIP_STREAM_KINDS.has(f.kind)
  );
  if (!fresh.length) return;
  emitAnalysisToken(
    state,
    fresh.map((f) => formatFindingMarkdown(f)).join("\n") + "\n\n"
  );
}
