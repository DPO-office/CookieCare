import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";

export async function renderOutput(
  state: AnalysisState,
  findings: Finding[],
  unit: AnalysisWorkUnit
): Promise<AnalysisState> {
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const primarySkill = skillIds[0] ? getSkillById(skillIds[0]) : undefined;
  const structured = buildStructuredReport(state, findings, schemaId, primarySkill?.label, primarySkill?.version);

  let rendered = structured;
  if (schemaId === "memo" || schemaId === "qa_thread") {
    rendered = await streamNarrativeReport(state, structured, schemaId);
  } else {
    emitAnalysisToken(state, `${structured}\n`);
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
    renderedOutput: rendered,
    findings: [...findings, renderFinding],
  };
}

function buildStructuredReport(
  state: AnalysisState,
  findings: Finding[],
  schemaId: string,
  skillLabel?: string,
  skillVersion?: string
): string {
  const lines: string[] = [];
  const skillHeader = skillLabel
    ? `# ${skillLabel}${skillVersion ? ` (v${skillVersion})` : ""}`
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
    lines.push(`Question: ${state.request.instruction}`, "");
    lines.push("## Answer", "");
    for (const f of findings.filter((x) => x.kind === "risk" || x.kind === "compliance" || x.kind === "extraction")) {
      lines.push(`- ${f.claim}`);
    }
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

  return lines.join("\n");
}

async function streamNarrativeReport(
  state: AnalysisState,
  structured: string,
  schemaId: string
): Promise<string> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const form = schemaId === "qa_thread" ? "Q&A answer" : "legal analysis memo";

  try {
    const outcome = await executeBoundedCompletion(
      [
        `Write a professional ${form} from the verified findings below.`,
        "Use only these findings. Do not invent clauses, parties, or risks that are not listed.",
        "Cite quoted evidence where provided. Use markdown headings and bullets.",
        "",
        structured,
      ].join("\n"),
      "You are a document-analysis writer. Stay faithful to the supplied findings. Never give legal advice on whether to sign or litigate.",
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI,
      {
        onDelta: state.onToken,
        tracker,
      }
    );
    if (state.agent && tracker) {
      state.agent.tokensUsed = tracker.tokensUsed;
    }
    return outcome.text.trim() || structured;
  } catch (err) {
    console.warn("[renderOutput] narrative stream failed; using structured report:", err);
    emitAnalysisToken(state, structured);
    return structured;
  }
}
