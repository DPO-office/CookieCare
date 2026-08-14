import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding, MatrixAddressing } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION, isGdprRiskCategory } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";

const ADDRESSING_LABEL: Record<MatrixAddressing, string> = {
  named: "Named",
  generic: "Generic",
  absent: "Absent",
};

export async function renderOutput(
  state: AnalysisState,
  findings: Finding[],
  unit: AnalysisWorkUnit
): Promise<AnalysisState> {
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const primarySkill = skillIds[0] ? getSkillById(skillIds[0]) : undefined;
  const visible = findings.filter((f) => f.visibility !== "internal");

  let rendered: string;
  if (schemaId === "rights_matrix_memo") {
    rendered = await renderRightsMatrixMemo(state, visible, primarySkill?.label, primarySkill?.version);
  } else {
    const structured = buildStructuredReport(
      state,
      visible,
      schemaId,
      primarySkill?.label,
      primarySkill?.version
    );
    if (schemaId === "memo" || schemaId === "qa_thread") {
      rendered = await streamNarrativeReport(state, structured, schemaId);
    } else {
      emitAnalysisToken(state, `${structured}\n`);
      rendered = structured;
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
    visibility: "internal",
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
    for (const f of findings.filter(
      (x) =>
        (x.kind === "risk" || x.kind === "compliance") &&
        !x.unverified &&
        !x.orgPlaybook &&
        !x.relatedNotRequested
    )) {
      lines.push(
        `- **[${xStatus(f)}] ${f.category}** (${f.severity ?? "n/a"}): ${f.claim}`
      );
      if (f.ruleId) lines.push(`  - Rule: ${f.ruleId}`);
      if (f.evidence[0]) {
        lines.push(`  - Evidence: "${f.evidence[0].quotedText.slice(0, 200)}"`);
      }
    }
    appendAttributionSections(lines, state, findings);
  } else if (schemaId === "qa_thread") {
    lines.push(skillHeader, "");
    lines.push(`Question: ${state.request.instruction}`, "");
    lines.push("## Answer", "");
    for (const f of findings.filter(
      (x) =>
        (x.kind === "risk" || x.kind === "compliance") &&
        !x.unverified &&
        !x.orgPlaybook &&
        !x.relatedNotRequested
    )) {
      lines.push(`- ${f.claim}`);
    }
    appendAttributionSections(lines, state, findings);
  } else {
    lines.push(skillHeader, "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    lines.push("| Status | Kind | Category | Severity | Claim |");
    lines.push("|---|---|---|---|---|");
    for (const f of findings.filter(
      (x) =>
        (x.kind === "risk" || x.kind === "compliance") &&
        !x.unverified &&
        !x.orgPlaybook &&
        !x.relatedNotRequested
    )) {
      lines.push(
        `| ${xStatus(f)} | ${f.kind} | ${f.category} | ${f.severity ?? "—"} | ${f.claim.replace(/\|/g, "/")} |`
      );
    }
    appendAttributionSections(lines, state, findings);
  }

  return lines.join("\n");
}

function xStatus(f: Finding): string {
  if (f.matrixAddressing) return ADDRESSING_LABEL[f.matrixAddressing];
  return f.status;
}

async function renderRightsMatrixMemo(
  state: AnalysisState,
  findings: Finding[],
  skillLabel?: string,
  skillVersion?: string
): Promise<string> {
  const sections = buildRightsMatrixSections(state, findings, skillLabel, skillVersion);
  emitAnalysisToken(state, `${sections}\n\n`);
  const bottom = await streamBottomLine(state, sections);
  const full = `${sections}\n\n## Bottom line\n\n${bottom}`.trim();
  if (!bottom) emitAnalysisToken(state, "");
  return full;
}

function buildRightsMatrixSections(
  state: AnalysisState,
  findings: Finding[],
  skillLabel?: string,
  skillVersion?: string
): string {
  const lines: string[] = [];
  const title = skillLabel
    ? `# ${skillLabel}${skillVersion ? ` (v${skillVersion})` : ""} — data-subject rights`
    : "# Data-subject rights review";
  lines.push(title, "");
  lines.push(`Instruction: ${state.request.instruction}`, "");
  for (const note of state.memoryAttributions ?? []) {
    lines.push(`_${note}_`, "");
  }
  for (const warn of state.partialCoverageWarning ?? []) {
    lines.push(`> **Coverage warning:** ${warn}`, "");
  }

  lines.push("## Architecture", "");
  lines.push(architectureSentence(findings), "");

  const matrix = findings.filter((f) => f.matrixRowId && !f.unverified && !f.orgPlaybook);
  const rows = state.activeSkills?.flatMap((s) => s.rightsMatrixRows ?? []) ?? [];
  lines.push("## Rights matrix", "");
  if (matrix.length === 0) {
    lines.push("_No matrix-row findings were emitted._", "");
  } else {
    lines.push("| Right | Article | Addressed? | Gap |");
    lines.push("|---|---|---|---|");
    for (const f of matrix) {
      const meta = rows.find((r) => r.rowId === f.matrixRowId);
      const right = meta?.label ?? f.matrixRowId ?? "—";
      const article = meta?.article ?? "—";
      const addressed = f.matrixAddressing
        ? ADDRESSING_LABEL[f.matrixAddressing]
        : f.status === "absent_expected"
          ? "Absent"
          : f.status === "insufficient_evidence"
            ? "Insufficient evidence"
            : "Named";
      const gap = (f.gap ?? (f.status === "present" ? "—" : f.claim)).replace(/\|/g, "/");
      lines.push(`| ${right} | ${article} | ${addressed} | ${gap} |`);
    }
    lines.push("");
  }

  lines.push("## Timeframe (Art 12(3))", "");
  const t12 = findings.find((f) => f.ruleId === "gdpr.art12.3");
  if (t12) {
    lines.push(t12.claim);
    if (t12.gap) lines.push(`Gap: ${t12.gap}`);
    if (t12.evidence[0]) {
      lines.push(`Evidence: "${t12.evidence[0].quotedText.slice(0, 280)}"`);
    }
  } else {
    lines.push("No Art 12(3) finding was emitted.");
  }
  const slaContrast = numericSlaContrast(state, t12);
  if (slaContrast) {
    lines.push("");
    lines.push("Other numeric SLAs already extracted (contrast only, not a new claim):");
    lines.push(slaContrast);
  }
  lines.push("");

  lines.push("## Legal hook", "");
  const hookRule =
    state.mergedRegimeRules?.find((r) => r.ruleId === "gdpr.art28.3.e" && r.legalHook) ??
    state.mergedRegimeRules?.find((r) => r.ruleId === "gdpr.art12.3" && r.legalHook);
  const eHook = state.mergedRegimeRules?.find((r) => r.ruleId === "gdpr.art28.3.e")?.legalHook;
  const tHook = state.mergedRegimeRules?.find((r) => r.ruleId === "gdpr.art12.3")?.legalHook;
  if (eHook) lines.push(`- ${eHook}`);
  if (tHook) lines.push(`- ${tHook}`);
  if (!eHook && !tHook && hookRule?.legalHook) lines.push(`- ${hookRule.legalHook}`);
  if (!eHook && !tHook) lines.push("- (No authored legal hook on the matched regime rules.)");
  lines.push("");

  lines.push("## Further gaps", "");
  const gaps = findings.filter(
    (f) =>
      f.kind === "risk" &&
      f.visibility !== "internal" &&
      !f.relatedNotRequested &&
      !f.unverified &&
      !f.orgPlaybook &&
      (isGdprRiskCategory(f.category) || f.category.startsWith("dsr_"))
  );
  if (gaps.length === 0) {
    lines.push("No additional GDPR-scoped risk findings.");
  } else {
    for (const g of gaps) {
      lines.push(`- **${g.category}** (${g.severity ?? "n/a"}): ${g.claim}`);
    }
  }
  lines.push("");

  const related = findings.filter(
    (f) => f.relatedNotRequested && f.visibility !== "internal"
  );
  if (related.length > 0) {
    const notes = (unitRelatedNotes(state) ?? []).filter(Boolean);
    lines.push("## Related, not requested", "");
    if (notes.length) {
      lines.push(notes.join(" "), "");
    }
    for (const g of related) {
      lines.push(`- **${g.category}** (${g.severity ?? "n/a"}): ${g.claim}`);
    }
    lines.push("");
  }

  const orgPlaybook = findings.filter((f) => f.orgPlaybook && f.visibility !== "internal");
  if (orgPlaybook.length > 0) {
    lines.push("## Org playbook (attributed)", "");
    for (const g of orgPlaybook) {
      lines.push(`- ${g.claim}`);
    }
    lines.push("");
  }

  const unverified = findings.filter((f) => f.unverified && f.visibility !== "internal");
  if (unverified.length > 0) {
    lines.push("## Unverified reference (not authored CookieCare rules)", "");
    lines.push(
      "The following notes come from a live lookup of a standard that is not in the skill registry. They are not mixed into the compliance table above."
    );
    lines.push("");
    for (const g of unverified) {
      lines.push(`- ${g.claim}${g.sourceUrl ? ` (${g.sourceUrl})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Remedial points", "");
  const tasks = state.draftTasks ?? [];
  if (tasks.length === 0) {
    lines.push("No remedial draft tasks were created.");
  } else {
    for (const t of tasks) {
      lines.push(`- ${t.instruction}${t.reason ? ` (${t.reason})` : ""}`);
    }
  }

  return lines.join("\n");
}

function unitRelatedNotes(state: AnalysisState): string[] {
  const fromSkills = (state.activeSkills ?? []).flatMap((s) =>
    (s.relatedChecks ?? []).map((r) => r.note).filter((n): n is string => Boolean(n))
  );
  return [...new Set(fromSkills)];
}

function appendAttributionSections(
  lines: string[],
  state: AnalysisState,
  findings: Finding[]
): void {
  for (const warn of state.partialCoverageWarning ?? []) {
    lines.push("", `> **Coverage warning:** ${warn}`);
  }
  for (const note of state.memoryAttributions ?? []) {
    lines.push("", `_${note}_`);
  }
  const related = findings.filter(
    (f) => f.relatedNotRequested && f.visibility !== "internal" && !f.unverified
  );
  if (related.length) {
    lines.push("", "## Related, not requested", "");
    for (const g of related) {
      lines.push(`- **${g.category}**: ${g.claim}`);
    }
  }
  const orgPlaybook = findings.filter((f) => f.orgPlaybook);
  if (orgPlaybook.length) {
    lines.push("", "## Org playbook (attributed)", "");
    for (const g of orgPlaybook) lines.push(`- ${g.claim}`);
  }
  const unverified = findings.filter((f) => f.unverified);
  if (unverified.length) {
    lines.push("", "## Unverified reference (not authored CookieCare rules)", "");
    for (const g of unverified) lines.push(`- ${g.claim}`);
  }
}

function architectureSentence(findings: Finding[]): string {
  const summary = findings.find((f) => f.kind === "summary_point" && f.visibility !== "internal");
  if (summary) return summary.claim;
  const e = findings.find((f) => f.ruleId === "gdpr.art28.3.e");
  if (e) return e.claim;
  const named = findings.filter((f) => f.matrixAddressing === "named").length;
  const generic = findings.filter((f) => f.matrixAddressing === "generic").length;
  const absent = findings.filter((f) => f.matrixAddressing === "absent").length;
  if (named + generic + absent === 0) {
    return "No data-subject-rights findings were available to describe the assistance architecture.";
  }
  return `Of the evaluated Chapter III rights, ${named} are named, ${generic} are covered only generically, and ${absent} are absent.`;
}

function numericSlaContrast(state: AnalysisState, art12?: Finding): string | null {
  const docs = state.workspace.documents;
  const seen = new Set<string>();
  const bullets: string[] = [];
  const re =
    /\b(\d+)\s*(hour|hours|day|days|week|weeks|month|months|business days?)\b/gi;
  for (const doc of docs) {
    for (const c of doc.clauses ?? []) {
      if (c.clauseType === "data_subject_request_handling") continue;
      const m = c.text.match(re);
      if (!m) continue;
      const key = `${c.clauseType}:${m[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (art12?.evidence[0]?.quotedText && m[0] === art12.evidence[0].quotedText) continue;
      bullets.push(`- ${c.clauseType}: "${m[0]}"`);
    }
  }
  return bullets.length ? bullets.join("\n") : null;
}

async function streamBottomLine(state: AnalysisState, sections: string): Promise<string> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  try {
    const outcome = await executeBoundedCompletion(
      [
        "Write one short bottom-line paragraph for a controller-side lawyer.",
        "Use ONLY the structured sections below. Do not invent rights, timeframes, or citations.",
        "Do not advise whether to sign or litigate.",
        "",
        sections,
      ].join("\n"),
      "You polish a closing paragraph from verified findings. No new claims.",
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
    return outcome.text.trim();
  } catch (err) {
    console.warn("[renderOutput] bottom-line stream failed:", err);
    return "See the rights matrix and gaps above; no additional narrative was generated.";
  }
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
