// ─── Compare Result — Markdown Formatter ─────────────────────────────────────
// Converts the structured CompareResult into markdown that renders cleanly
// via the existing MessageBubble → markdownToHtml pipeline.

import type { CompareResult } from "../../../randtrustAI/types";

/**
 * Formats the executive summary as the main assistant message markdown.
 * The interactive structured data (differences, clauses) is rendered
 * separately via CompareResultCards — this is only the readable narrative part.
 */
export function formatExecutiveSummaryMarkdown(result: CompareResult): string {
  const { executiveSummary: s, originalFileName, revisedFileName } = result;

  const lines: string[] = [];

  // Header
  lines.push(`## Agreement Comparison`);
  lines.push(`**${originalFileName}** vs **${revisedFileName}**`);
  lines.push("");

  // Assessment
  lines.push(`### Assessment`);
  lines.push(s.overallAssessment);
  lines.push("");

  // Key findings
  if (s.keyFindings.length > 0) {
    lines.push(`### Key Findings`);
    for (const f of s.keyFindings) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  // Critical redlines
  if (s.criticalRedlines.length > 0) {
    lines.push(`### Critical Redlines`);
    for (const r of s.criticalRedlines) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  // Missing protections
  if (s.missingProtections.length > 0) {
    lines.push(`### Missing Protections`);
    for (const p of s.missingProtections) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  // Negotiation priorities
  if (s.negotiationPriorities.length > 0) {
    lines.push(`### Negotiation Priorities`);
    s.negotiationPriorities.forEach((p, i) => {
      lines.push(`${i + 1}. ${p}`);
    });
    lines.push("");
  }

  // Recommendation
  lines.push(`### Recommendation`);
  lines.push(`> ${s.recommendation}`);
  lines.push("");

  // Teaser for structured tabs
  const diffCount = result.differences.filter(
    (d) => d.classification !== "UNCHANGED"
  ).length;

  if (diffCount > 0) {
    lines.push(
      `---`,
      `*Found **${diffCount} clause change${diffCount !== 1 ? "s" : ""}**. ` +
        `Explore the detailed breakdown below.*`
    );
  }

  return lines.join("\n");
}
