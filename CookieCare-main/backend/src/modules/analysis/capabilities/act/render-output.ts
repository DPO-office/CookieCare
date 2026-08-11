import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";

export function renderOutput(
  state: AnalysisState,
  findings: Finding[],
  unit: AnalysisWorkUnit
): AnalysisState {
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const primarySkill = skillIds[0] ? getSkillById(skillIds[0]) : undefined;
  const lines: string[] = [];

  const skillHeader = primarySkill
    ? `# ${primarySkill.label} (v${primarySkill.version})`
    : "# Analysis Report";

  if (schemaId === "memo") {
    lines.push(skillHeader, "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    if (state.skillSelectionPath) {
      lines.push(`Selection: ${state.skillSelectionPath}`, "");
    }
    lines.push("## Findings", "");
    for (const f of findings.filter((x) => x.kind === "risk" || x.kind === "compliance")) {
      lines.push(
        `- **[${f.status}] ${f.category}** (${f.severity ?? "n/a"}): ${f.claim}`
      );
      if (f.ruleId) lines.push(`  - Rule: ${f.ruleId}`);
      if (f.evidence[0]) {
        lines.push(`  - Evidence: "${f.evidence[0].quotedText.slice(0, 200)}"`);
      }
    }
  } else if (schemaId === "qa_thread") {
    lines.push(skillHeader, "");
    lines.push("_Q&A thread renderer (Phase 2)_", "");
    lines.push(state.request.instruction);
  } else {
    lines.push(skillHeader, "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    lines.push("| Status | Kind | Category | Severity | Claim |");
    lines.push("|---|---|---|---|---|");
    for (const f of findings.filter(
      (x) =>
        x.kind === "risk" ||
        x.kind === "compliance" ||
        x.kind === "extraction" ||
        x.kind === "summary_point"
    )) {
      lines.push(
        `| ${f.status} | ${f.kind} | ${f.category} | ${f.severity ?? "—"} | ${f.claim.replace(/\|/g, "/")} |`
      );
    }
  }

  const renderFinding: Finding = {
    findingId: `f_render_${unit.workUnitId}`,
    kind: "summary_point",
    category: "other_known_risk",
    status: "present",
    claim: `Rendered ${schemaId} for skill(s) ${skillIds.join(", ")} with ${findings.length} prior findings.`,
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId: skillIds[0],
  };

  return {
    ...state,
    renderedOutput: lines.join("\n"),
    findings: [...findings, renderFinding],
  };
}
