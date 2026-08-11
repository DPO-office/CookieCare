// ─── Compare Result — Markdown Formatter ─────────────────────────────────────
// Converts the structured CompareResult into markdown that renders cleanly
// via the existing MessageBubble → markdownToHtml pipeline.

import type { CompareResult } from "../../../randtrustAI/types";

const RISK_EMOJI: Record<string, string> = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "🟢",
};

/**
 * Formats the executive summary as the main assistant message markdown.
 * The interactive structured data (risks, differences, clauses) is rendered
 * separately via CompareResultCards — this is only the readable narrative part.
 */
export function formatExecutiveSummaryMarkdown(result: CompareResult): string {
  const { executiveSummary: s, originalFileName, revisedFileName } = result;
  const riskEmoji = RISK_EMOJI[s.overallRisk] ?? "🟡";

  const lines: string[] = [];

  // Header
  lines.push(`## Agreement Comparison`);
  lines.push(`**${originalFileName}** vs **${revisedFileName}**`);
  lines.push("");

  // Overall risk badge
  lines.push(`**Overall Risk:** ${riskEmoji} ${s.overallRisk}`);
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
  const riskCount = result.risks.length;
  const diffCount = result.differences.filter(
    (d) => d.classification !== "UNCHANGED"
  ).length;

  if (riskCount > 0 || diffCount > 0) {
    lines.push(
      `---`,
      `*Found **${riskCount} risk finding${riskCount !== 1 ? "s" : ""}** and ` +
        `**${diffCount} clause change${diffCount !== 1 ? "s" : ""}**. ` +
        `Explore the detailed breakdown below.*`
    );
  }

  return lines.join("\n");
}
