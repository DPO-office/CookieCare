import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding, MatrixAddressing } from "../../models/finding.js";
import type { RuleSourceTier } from "../../models/rule-source.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { extractArticleNumbers } from "../../skills/extract-instruction-focus.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";

const ADDRESSING_LABEL: Record<MatrixAddressing, string> = {
  named: "Named",
  generic: "Generic",
  absent: "Absent",
};

function findingTier(f: Finding): RuleSourceTier | "other" {
  if (f.ruleSourceTier) return f.ruleSourceTier;
  if (f.unverified) return "C";
  if (f.playbookPositionId) return "P";
  if (f.kind === "compliance" || f.kind === "risk") return "B";
  return "other";
}

export async function renderOutput(
  state: AnalysisState,
  findings: Finding[],
  unit: AnalysisWorkUnit
): Promise<AnalysisState> {
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const primarySkill = skillIds[0] ? getSkillById(skillIds[0]) : undefined;
  const visible = consolidateFindingsForRender(
    findings.filter((f) => f.visibility !== "internal")
  );

  let rendered: string;
  if (schemaId === "brief_summary") {
    rendered = buildBriefSummaryDocument(state, visible);
    emitAnalysisToken(state, `${rendered}\n`);
  } else if (schemaId === "rights_matrix_memo") {
    rendered = await renderRightsMatrixMemo(state, visible, primarySkill?.label, primarySkill?.version);
  } else if (schemaId === "playbook_comparison_memo") {
    rendered = await renderPlaybookComparisonMemo(
      state,
      visible,
      primarySkill?.label,
      primarySkill?.version
    );
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
  rendered = replaceRawCategoryIds(rendered, state, visible);

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

const INTERNAL_VERIFICATION_CLAIM =
  /^Could not verify that the target document satisfies rule [^:]+:\s*no verbatim supporting quote was returned\.?$/i;

function userSafeFinding(finding: Finding): Finding {
  if (!INTERNAL_VERIFICATION_CLAIM.test(finding.claim)) return finding;
  return {
    ...finding,
    claim:
      "The agreement does not provide enough verifiable language to confirm this obligation.",
    gap:
      "The available document language was not specific enough to support a confirmed assessment.",
  };
}

/**
 * A legal rule is one conclusion in user output, even when an older/per-clause
 * execution path emitted several clause-level attempts for that rule.
 */
export function consolidateFindingsForRender(findings: Finding[]): Finding[] {
  const safe = findings.map(userSafeFinding);
  const grouped = new Map<string, Finding[]>();
  const passthrough: Finding[] = [];

  for (const finding of safe) {
    if (
      finding.kind !== "compliance" ||
      !finding.ruleId ||
      finding.matrixRowId ||
      finding.orgPlaybook ||
      finding.unverified
    ) {
      passthrough.push(finding);
      continue;
    }
    const key = `${finding.skillId ?? ""}:${finding.ruleId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }

  const statusRank: Record<Finding["status"], number> = {
    absent_expected: 4,
    not_covered: 3,
    insufficient_evidence: 2,
    present: 1,
  };
  const severityRank = { high: 3, medium: 2, low: 1 } as const;

  for (const group of grouped.values()) {
    const selected = [...group].sort((a, b) => {
      const status = statusRank[b.status] - statusRank[a.status];
      if (status !== 0) return status;
      return (
        (severityRank[b.severity ?? "low"] ?? 0) -
        (severityRank[a.severity ?? "low"] ?? 0)
      );
    })[0];
    const evidence = group
      .flatMap((finding) => finding.evidence)
      .filter(
        (candidate, index, all) =>
          all.findIndex(
            (item) =>
              item.locator.docId === candidate.locator.docId &&
              item.locator.structuralPath === candidate.locator.structuralPath &&
              item.quotedText === candidate.quotedText
          ) === index
      );
    passthrough.push({ ...selected, evidence });
  }

  return passthrough;
}

const PLAIN_ARTICLE_DESCRIPTION: Record<number, string> = {
  15: "A person can ask what personal data is held about them and receive a copy.",
  16: "A person can ask for inaccurate or incomplete personal data to be corrected.",
  17: "A person can ask for personal data to be erased when the legal conditions apply.",
  18: "A person can ask for use of their personal data to be restricted in specified cases.",
  19: "Recipients may need to be told when data is corrected, erased, or restricted.",
  20: "A person can receive eligible data in a usable format and transfer it elsewhere.",
  21: "A person can object to certain processing, including direct marketing.",
  22: "A person has protections around qualifying solely automated decisions.",
};

function articleNumberForFinding(finding: Finding): number | undefined {
  const ruleMatch = finding.ruleId?.match(/^gdpr\.art(\d{1,3})(?:\.|$)/i);
  if (ruleMatch) return Number(ruleMatch[1]);
  return undefined;
}

function briefStatus(finding: Finding | undefined): string {
  if (!finding) return "Not confirmed";
  if (finding.status === "not_covered") return "Not yet supported";
  if (finding.status === "insufficient_evidence") return "Could not confirm";
  if (finding.status === "absent_expected" || finding.matrixAddressing === "absent") {
    return "Not addressed";
  }
  if (finding.matrixAddressing === "generic") return "Covered generally";
  return "Addressed";
}

export function buildBriefSummaryDocument(
  state: AnalysisState,
  findings: Finding[]
): string {
  const requested = extractArticleNumbers(state.request.instruction);
  const rows = state.activeSkills?.flatMap((skill) => skill.rightsMatrixRows ?? []) ?? [];
  const citations = createCitationRegistry(state, findings);
  const lines = ["# Brief overview", "", "## Quick reference", ""];

  lines.push("| Article | In plain English | Document position |");
  lines.push("|---|---|---|");
  for (const article of requested) {
    const row = rows.find((candidate) => Number(candidate.article.match(/\d+/)?.[0]) === article);
    const finding =
      findings.find((candidate) => candidate.matrixRowId === row?.rowId) ??
      findings.find((candidate) => articleNumberForFinding(candidate) === article);
    const description =
      PLAIN_ARTICLE_DESCRIPTION[article] ??
      `This article sets a GDPR obligation relevant to Article ${article}.`;
    lines.push(`| Article ${article} | ${description} | ${briefStatus(finding)} |`);
  }

  lines.push("", "## What this means", "");
  for (const article of requested) {
    const row = rows.find((candidate) => Number(candidate.article.match(/\d+/)?.[0]) === article);
    const finding =
      findings.find((candidate) => candidate.matrixRowId === row?.rowId) ??
      findings.find((candidate) => articleNumberForFinding(candidate) === article);
    const description =
      PLAIN_ARTICLE_DESCRIPTION[article] ??
      `Article ${article} contains a GDPR obligation relevant to this review.`;
    const detail = finding
      ? userSafeFinding(finding).claim
      : "The analysis did not find enough document language to state a firm position.";
    const marker = finding ? citations.markerForFinding(finding) : "";
    lines.push(
      `**Article ${article}.** ${description} ${ensureSentence(detail)}${marker ? ` ${marker}` : ""}`,
      ""
    );
  }

  const requestedSet = new Set(requested);
  const practical = findings
    .filter((finding) => {
      const article = articleNumberForFinding(finding);
      const row = rows.find((candidate) => candidate.rowId === finding.matrixRowId);
      const rowArticle = Number(row?.article.match(/\d+/)?.[0]);
      return (
        (article !== undefined && requestedSet.has(article)) ||
        (Number.isFinite(rowArticle) && requestedSet.has(rowArticle))
      );
    })
    .filter(
      (finding) =>
        finding.status !== "present" ||
        finding.matrixAddressing === "generic" ||
        finding.matrixAddressing === "absent"
    )
    .slice(0, 2);

  lines.push("## Practical bottom line", "");
  if (practical.length === 0) {
    lines.push(
      "The requested articles did not produce a confirmed document gap. Keep the supporting process and response evidence available for operational use."
    );
  } else {
    for (const finding of practical) {
      lines.push(`- ${ensureSentence(userSafeFinding(finding).gap ?? finding.claim)}`);
    }
  }

  const chapterArticles = requested.filter((article) => article >= 15 && article <= 22);
  if (chapterArticles.length > 0) {
    const remaining = Array.from({ length: 8 }, (_, index) => 15 + index).filter(
      (article) => !requestedSet.has(article)
    );
    if (remaining.length > 0) {
      const offer =
        remaining.length > 1 &&
        remaining.every((article, index) => article === remaining[0] + index)
          ? `Articles ${remaining[0]}–${remaining.at(-1)}`
          : `Articles ${remaining.join(", ")}`;
      lines.push("", `Let me know if you’d like me to extend this to ${offer}.`);
    }
  }

  appendReferences(lines, citations);
  return lines.join("\n").trim();
}

function buildStructuredReport(
  state: AnalysisState,
  findings: Finding[],
  schemaId: string,
  skillLabel?: string,
  skillVersion?: string
): string {
  const lines: string[] = [];
  const citations = createCitationRegistry(state, findings);
  const skillHeader = skillLabel
    ? `# ${skillLabel}${skillVersion ? ` (v${skillVersion})` : ""}`
    : "# Analysis Report";

  if (schemaId === "memo") {
    lines.push(skillHeader, "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    if (state.skillSelectionPath) {
      lines.push(`Selection: ${state.skillSelectionPath}`, "");
    }
    appendTieredFindingSections(lines, state, findings, citations);
    appendAttributionSections(lines, state, findings, citations);
  } else if (schemaId === "qa_thread") {
    lines.push(skillHeader, "");
    lines.push(`Question: ${state.request.instruction}`, "");
    lines.push("## Answer", "");
    for (const f of findings.filter(
      (x) =>
        (x.kind === "risk" || x.kind === "compliance") &&
        !x.unverified &&
        !x.orgPlaybook &&
        !x.relatedNotRequested &&
        findingTier(x) === "B"
    )) {
      const marker = citations.markerForFinding(f);
      lines.push(`- ${f.claim}${marker ? ` ${marker}` : ""}`);
    }
    appendAttributionSections(lines, state, findings, citations);
  } else {
    lines.push(skillHeader, "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    appendTieredFindingSections(lines, state, findings, citations);
    appendAttributionSections(lines, state, findings, citations);
  }
  appendReferences(lines, citations);

  return lines.join("\n");
}

function appendTieredFindingSections(
  lines: string[],
  state: AnalysisState,
  findings: Finding[],
  citations: CitationRegistry
): void {
  const tierB = findings.filter(
    (x) =>
      (x.kind === "risk" || x.kind === "compliance") &&
      findingTier(x) === "B" &&
      !x.orgPlaybook &&
      !x.relatedNotRequested
  );
  const tierP = findings.filter(
    (x) =>
      (x.kind === "risk" || x.kind === "compliance") &&
      findingTier(x) === "P" &&
      !x.relatedNotRequested
  );
  const tierC = findings.filter(
    (x) => findingTier(x) === "C" || (x.unverified && x.visibility !== "internal")
  );

  lines.push("## Compliance findings (Tier B — authored regime rules)", "");
  if (tierB.length === 0) {
    lines.push("_No authored-regime findings._", "");
  } else {
    lines.push("| Status | Kind | Category | Severity | Claim |");
    lines.push("|---|---|---|---|---|");
    for (const f of tierB) {
      const marker = citations.markerForFinding(f);
      lines.push(
        `| ${xStatus(f)} | ${f.kind} | ${displayLabelForFinding(state, f)} | ${f.severity ?? "—"} | ${`${f.claim}${marker ? ` ${marker}` : ""}`.replace(/\|/g, "/")} |`
      );
    }
    lines.push("");
  }

  if (tierP.length > 0) {
    lines.push(
      "## Playbook comparison (Tier P — org-authored, not legally reviewed)",
      ""
    );
    lines.push(
      "These findings compare the target agreement to an uploaded playbook. They are **not** statutory compliance determinations.",
      ""
    );
    for (const f of tierP) {
      const marker = citations.markerForFinding(f);
      lines.push(`- **${xStatus(f)} — ${displayLabelForFinding(state, f)}** (${f.severity ?? "n/a"}): ${f.claim}${marker ? ` ${marker}` : ""}`);
      for (const ev of f.evidence) {
        lines.push(
          `  - Evidence (${ev.sourceRole}): "${ev.quotedText.slice(0, 200)}" ${citations.markerForDoc(ev.locator.docId)}`
        );
      }
    }
    lines.push("");
  }

  if (tierC.length > 0) {
    lines.push(
      "## Reference notes (Tier C — unverified, retrieved live — verify independently)",
      ""
    );
    for (const g of tierC) {
      const when = g.retrievedAt ? ` Retrieved: ${g.retrievedAt}.` : "";
      lines.push(
        `- ${g.claim}${g.sourceUrl ? ` (${g.sourceUrl})` : ""}${when}`
      );
    }
    lines.push("");
  }
}

function xStatus(f: Finding): string {
  if (f.matrixAddressing) return ADDRESSING_LABEL[f.matrixAddressing];
  return f.status;
}

async function renderPlaybookComparisonMemo(
  state: AnalysisState,
  findings: Finding[],
  skillLabel?: string,
  skillVersion?: string
): Promise<string> {
  const lines: string[] = [];
  const citations = createCitationRegistry(state, findings);
  const title = skillLabel
    ? `# ${skillLabel}${skillVersion ? ` (v${skillVersion})` : ""} — playbook comparison`
    : "# Playbook comparison memo";
  lines.push(title, "");
  lines.push(`Instruction: ${state.request.instruction}`, "");
  appendTieredFindingSections(lines, state, findings, citations);
  appendAttributionSections(lines, state, findings, citations);
  appendReferences(lines, citations);
  const structured = lines.join("\n");
  emitAnalysisToken(state, `${structured}\n\n`);
  const bottom = await streamBottomLine(state, structured);
  const full = `${structured}\n\n## Bottom line\n\n${bottom}`.trim();
  return replaceRawCategoryIds(full, state, findings);
}

async function renderRightsMatrixMemo(
  state: AnalysisState,
  findings: Finding[],
  skillLabel?: string,
  skillVersion?: string
): Promise<string> {
  const citations = createCitationRegistry(state, findings);
  const sections = buildRightsMatrixSections(
    state,
    findings,
    citations,
    skillLabel,
    skillVersion
  );
  emitAnalysisToken(state, `${sections}\n\n`);
  const bottom = await streamBottomLine(state, sections);
  const full = buildRightsMatrixMemoDocument(
    state,
    findings,
    bottom,
    skillLabel,
    skillVersion
  );
  if (!bottom) emitAnalysisToken(state, "");
  return full;
}

export function buildRightsMatrixMemoDocument(
  state: AnalysisState,
  findings: Finding[],
  bottom: string,
  skillLabel?: string,
  skillVersion?: string
): string {
  const citations = createCitationRegistry(state, findings);
  const sections = buildRightsMatrixSections(
    state,
    findings,
    citations,
    skillLabel,
    skillVersion
  );
  const bottomCitations = citations.allMarkers();
  const citedBottom = `${bottom}${bottomCitations ? ` ${bottomCitations}` : ""}`.trim();
  const references = citations.referenceLines();
  const full = [
    sections,
    "## 7. Bottom Line",
    "",
    citedBottom,
    "",
    "## 8. References",
    "",
    references.length > 0 ? references.join("\n") : "_No source documents were cited._",
  ]
    .join("\n")
    .trim();
  return replaceRawCategoryIds(full, state, findings);
}

function buildRightsMatrixSections(
  state: AnalysisState,
  findings: Finding[],
  citations: CitationRegistry,
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

  lines.push("## 1. Architecture / Obligations Summary", "");
  lines.push(architectureParagraph(findings, citations), "");

  const matrix = findings.filter(
    (f) => f.matrixRowId && findingTier(f) === "B" && !f.unverified && !f.orgPlaybook
  );
  const rows = state.activeSkills?.flatMap((s) => s.rightsMatrixRows ?? []) ?? [];
  lines.push("## 2. Rights Matrix / Mapping", "");
  if (matrix.length === 0) {
    lines.push("_No matrix-row findings were emitted._", "");
  } else {
    lines.push("| Right | Article | Addressed? | Gap |");
    lines.push("|---|---|---|---|");
    for (const f of matrix) {
      const meta = rows.find((r) => r.rowId === f.matrixRowId);
      const right = meta?.label ?? f.matrixRowId ?? "—";
      const article = meta?.article ?? "—";
      const addressed =
        f.status === "not_covered"
          ? "Not yet supported"
          : f.status === "insufficient_evidence"
          ? "Insufficient evidence"
          : f.matrixAddressing
          ? ADDRESSING_LABEL[f.matrixAddressing]
          : f.status === "absent_expected"
            ? "Absent"
            : "Named";
      const marker = citations.markerForFinding(f);
      const gap = `${f.gap ?? (f.status === "present" ? "—" : f.claim)}${marker ? ` ${marker}` : ""}`.replace(
        /\|/g,
        "/"
      );
      lines.push(`| ${right} | ${article} | ${addressed} | ${gap} |`);
    }
    lines.push("");
  }

  const notCovered = findings.filter(
    (f) => f.status === "not_covered" && f.visibility !== "internal"
  );
  if (notCovered.length > 0) {
    lines.push("### Coverage limitations (not yet supported)", "");
    for (const f of notCovered) {
      lines.push(
        `- **${displayLabelForFinding(state, f)}:** ${ensureSentence(
          f.claim.replace(
            /not yet covered by an authored rule/i,
            "is not yet covered by an authored rule in this system"
          )
        )}`
      );
    }
    lines.push("");
  }

  const budgetExhausted = Object.values(state.workUnitOutcomes ?? {}).some(
    (o) =>
      o.terminalStatus === "retries_exhausted" &&
      o.failureReason?.kind === "tool_execution_error" &&
      o.failureReason.error === "budget_exceeded"
  );
  if (budgetExhausted) {
    lines.push(
      "> **Analysis note:** One or more evaluations could not be completed within the turn or token budget and were left inconclusive rather than omitted.",
      ""
    );
  }

  lines.push("## 3. Response Timeframes", "");
  const t12 = findings.find((f) => f.ruleId === "gdpr.art12.3");
  if (t12) {
    const marker = citations.markerForFinding(t12);
    const timeframeSentences = [
      ensureSentence(t12.claim),
      t12.gap ? ensureSentence(`The identified gap is that ${lowerFirst(t12.gap)}`) : "",
    ].filter(Boolean);
    if (t12.evidence[0]) {
      timeframeSentences.push(
        `The relevant agreement language states, “${cleanQuote(t12.evidence[0].quotedText, 280)}.”`
      );
    }
    lines.push(`${timeframeSentences.join(" ")}${marker ? ` ${marker}` : ""}`);
  } else {
    lines.push("No Art 12(3) finding was emitted.");
  }
  const slaContrast = numericSlaContrastParagraph(state, t12, citations);
  if (slaContrast) {
    lines.push("");
    lines.push(slaContrast);
  }
  lines.push("");

  lines.push("## 4. Gaps That Could Result in a Violation", "");
  const gaps = getEligibleRemedialFindings(findings);
  if (gaps.length === 0) {
    lines.push("No medium- or high-severity gaps were identified in the active response set.");
  } else {
    for (let index = 0; index < gaps.length; index++) {
      const gap = gaps[index];
      lines.push(
        `### 4.${index + 1} ${displayLabelForFinding(state, gap)}`,
        "",
        gapParagraph(state, gap, citations),
        ""
      );
    }
  }
  lines.push("");

  lines.push("## 5. Suggested Remedial Points", "");
  if (gaps.length === 0) {
    lines.push("No remedial drafting points are required from the active findings.");
  } else {
    const tasksByFinding = new Map(
      (state.draftTasks ?? []).map((task) => [task.sourceFindingId, task])
    );
    for (let index = 0; index < gaps.length; index++) {
      const gap = gaps[index];
      const task = tasksByFinding.get(gap.findingId);
      const instruction =
        task?.instruction?.trim() ||
        `Revise the agreement to address ${lowerFirst(gap.gap ?? gap.claim)}`;
      lines.push(
        `${index + 1}. **${displayLabelForFinding(state, gap)}:** ${ensureSentence(instruction)}`
      );
    }
  }
  lines.push("");

  const related = findings.filter(
    (f) => f.relatedNotRequested && f.visibility !== "internal"
  );
  const orgPlaybook = findings.filter((f) => f.orgPlaybook && f.visibility !== "internal");
  const tierP = findings.filter((f) => findingTier(f) === "P" && f.visibility !== "internal");
  const unverified = findings.filter(
    (f) => (f.unverified || findingTier(f) === "C") && f.visibility !== "internal"
  );
  lines.push("## 6. Related, Not Requested", "");
  if (
    related.length === 0 &&
    orgPlaybook.length === 0 &&
    tierP.length === 0 &&
    unverified.length === 0
  ) {
    lines.push("_No related or supplemental findings were included._");
  } else {
    const notes = unitRelatedNotes(state).filter(Boolean);
    if (notes.length) {
      lines.push(notes.join(" "), "");
    }
    for (const g of related) {
      const marker = citations.markerForFinding(g);
      lines.push(
        `${ensureSentence(`${displayLabelForFinding(state, g)}: ${g.claim}`)}${marker ? ` ${marker}` : ""}`
      );
    }
    for (const g of orgPlaybook) {
      const marker = citations.markerForFinding(g);
      lines.push(`${ensureSentence(`Organisation playbook note: ${g.claim}`)}${marker ? ` ${marker}` : ""}`);
    }
    for (const g of tierP) {
      const marker = citations.markerForFinding(g);
      lines.push(`${ensureSentence(`Playbook comparison: ${g.claim}`)}${marker ? ` ${marker}` : ""}`);
    }
    for (const g of unverified) {
      const when = g.retrievedAt ? ` Retrieved: ${g.retrievedAt}.` : "";
      lines.push(
        `${ensureSentence(`Unverified reference note: ${g.claim}`)}${g.sourceUrl ? ` ${g.sourceUrl}` : ""}${when}`
      );
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
  findings: Finding[],
  citations: CitationRegistry
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
      const marker = citations.markerForFinding(g);
      lines.push(`- **${displayLabelForFinding(state, g)}**: ${g.claim}${marker ? ` ${marker}` : ""}`);
    }
  }
  const orgPlaybook = findings.filter((f) => f.orgPlaybook);
  if (orgPlaybook.length) {
    lines.push("", "## Org playbook (attributed)", "");
    for (const g of orgPlaybook) {
      const marker = citations.markerForFinding(g);
      lines.push(`- ${g.claim}${marker ? ` ${marker}` : ""}`);
    }
  }
}

interface CitationRegistry {
  markerForFinding(finding: Finding): string;
  markerForDoc(docId: string): string;
  allMarkers(): string;
  referenceLines(): string[];
}

function createCitationRegistry(
  state: AnalysisState,
  findings: Finding[]
): CitationRegistry {
  const numbers = new Map<string, number>();
  const register = (docId: string): number => {
    let number = numbers.get(docId);
    if (!number) {
      number = numbers.size + 1;
      numbers.set(docId, number);
    }
    return number;
  };
  for (const finding of findings) {
    for (const evidence of finding.evidence) register(evidence.locator.docId);
  }

  return {
    markerForFinding(finding) {
      const markers = [
        ...new Set(finding.evidence.map((evidence) => register(evidence.locator.docId))),
      ];
      return markers.map((number) => `[${number}]`).join("");
    },
    markerForDoc(docId) {
      return `[${register(docId)}]`;
    },
    allMarkers() {
      return [...numbers.values()].map((number) => `[${number}]`).join("");
    },
    referenceLines() {
      return [...numbers.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([docId, number]) => {
          const doc = state.workspace.documents.find((candidate) => candidate.docId === docId);
          const title =
            doc?.title ?? state.request.documentTitles?.[docId] ?? docId;
          return `[${number}] ${title}`;
        });
    },
  };
}

function appendReferences(lines: string[], citations: CitationRegistry): void {
  const references = citations.referenceLines();
  if (references.length === 0) return;
  lines.push("", "## References", "", ...references);
}

export function getEligibleRemedialFindings(findings: Finding[]): Finding[] {
  return findings.filter(
    (finding) =>
      finding.visibility !== "internal" &&
      !finding.relatedNotRequested &&
      findingTier(finding) === "B" &&
      !finding.unverified &&
      !finding.orgPlaybook &&
      (finding.severity === "medium" || finding.severity === "high") &&
      (finding.kind === "risk" ||
        finding.status !== "present" ||
        finding.matrixAddressing === "generic" ||
        finding.matrixAddressing === "absent")
  );
}

function architectureParagraph(
  findings: Finding[],
  citations: CitationRegistry
): string {
  const summary = findings.find(
    (finding) => finding.kind === "summary_point" && finding.visibility !== "internal"
  );
  const assistance = findings.find((finding) => finding.ruleId === "gdpr.art28.3.e");
  const named = findings.filter((f) => f.matrixAddressing === "named").length;
  const generic = findings.filter((f) => f.matrixAddressing === "generic").length;
  const absent = findings.filter((f) => f.matrixAddressing === "absent").length;
  const sentences: string[] = [];

  if (summary) {
    sentences.push(
      `${ensureSentence(summary.claim)}${citations.markerForFinding(summary) ? ` ${citations.markerForFinding(summary)}` : ""}`
    );
  } else if (assistance) {
    sentences.push(
      `${ensureSentence(assistance.claim)}${citations.markerForFinding(assistance) ? ` ${citations.markerForFinding(assistance)}` : ""}`
    );
  } else {
    sentences.push(
      "The review considers the agreement's contractual mechanism for assisting with GDPR Chapter III rights and the operational terms that support that mechanism."
    );
  }

  if (named + generic + absent === 0) {
    sentences.push(
      "No matrix-row findings were available to determine which individual rights are named, generically covered, or absent."
    );
  } else {
    sentences.push(
      `Across the evaluated rights, ${named} ${named === 1 ? "right is" : "rights are"} expressly named, ${generic} ${generic === 1 ? "is" : "are"} covered only by generic cooperation language, and ${absent} ${absent === 1 ? "is" : "are"} absent or unsupported by the available text.`
    );
  }
  sentences.push(
    "The practical result should be read as an allocation-of-obligations analysis: a broad assistance promise may establish the architecture, while the matrix and gap sections identify where execution, timing, or right-specific drafting remains uncertain."
  );
  return sentences.join(" ");
}

function numericSlaContrastParagraph(
  state: AnalysisState,
  art12: Finding | undefined,
  citations: CitationRegistry
): string | null {
  const docs = state.workspace.documents;
  const seen = new Set<string>();
  const examples: string[] = [];
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
      examples.push(
        `${c.clauseType.replace(/_/g, " ")} (“${m[0]}”) ${citations.markerForDoc(doc.docId)}`
      );
    }
  }
  if (examples.length === 0) return null;
  return `By contrast, the agreement already uses specific numeric service levels elsewhere, including ${examples.slice(0, 4).join(", ")}. Those provisions do not themselves satisfy Article 12(3), but they show that the document can express measurable response commitments where the parties choose to do so.`;
}

function gapParagraph(
  state: AnalysisState,
  finding: Finding,
  citations: CitationRegistry
): string {
  if (finding.status === "not_covered") {
    return ensureSentence(
      `${displayLabelForFinding(state, finding)}: ${finding.claim} This reflects a system coverage limitation — not a determination that the document complies or violates the standard.`
    );
  }
  const label = displayLabelForFinding(state, finding);
  const article = articleForFinding(state, finding);
  const marker = citations.markerForFinding(finding);
  const sentences = [
    ensureSentence(
      `${label} is assessed as a ${finding.severity ?? "material"}-severity issue${article ? ` under ${article}` : ""}`
    ),
    `${ensureSentence(finding.claim)}${marker ? ` ${marker}` : ""}`,
    finding.gap ? ensureSentence(`The resulting gap is that ${lowerFirst(finding.gap)}`) : "",
  ].filter(Boolean);
  if (finding.evidence[0]) {
    sentences.push(
      `The relevant agreement language states, “${cleanQuote(finding.evidence[0].quotedText, 260)}.”${marker ? ` ${marker}` : ""}`
    );
  }
  const legalHook = finding.ruleId
    ? state.mergedRegimeRules?.find((rule) => rule.ruleId === finding.ruleId)?.legalHook
    : undefined;
  if (legalHook) sentences.push(ensureSentence(legalHook));
  return sentences.join(" ");
}

function articleForFinding(state: AnalysisState, finding: Finding): string | null {
  if (finding.matrixRowId) {
    const row = state.activeSkills
      ?.flatMap((skill) => skill.rightsMatrixRows ?? [])
      .find((candidate) => candidate.rowId === finding.matrixRowId);
    if (row) return `GDPR Article ${row.article}`;
  }
  const match = finding.ruleId?.match(/^gdpr\.art(.+)$/);
  if (!match) return null;
  const parts = match[1].split(".");
  return `GDPR Article ${parts[0]}${parts.length > 1 ? `(${parts.slice(1).join(")(")})` : ""}`;
}

function categoryLabels(state: AnalysisState): Map<string, string> {
  const labels = new Map<string, string>();
  for (const skill of state.activeSkills ?? []) {
    for (const risk of skill.riskCategories) labels.set(risk.category, risk.displayLabel);
    for (const rule of skill.regimeRules) {
      if (!labels.has(rule.findingCategory)) {
        labels.set(rule.findingCategory, rule.label ?? humanizeCategory(rule.findingCategory));
      }
    }
  }
  for (const rule of state.mergedRegimeRules ?? []) {
    if (!labels.has(rule.findingCategory)) {
      labels.set(rule.findingCategory, rule.label ?? humanizeCategory(rule.findingCategory));
    }
  }
  return labels;
}

function displayLabelForFinding(state: AnalysisState, finding: Finding): string {
  const labels = categoryLabels(state);
  const configured = labels.get(finding.category);
  if (configured) return configured;
  if (finding.matrixRowId) {
    const row = state.activeSkills
      ?.flatMap((skill) => skill.rightsMatrixRows ?? [])
      .find((candidate) => candidate.rowId === finding.matrixRowId);
    if (row) return `${row.label} (Art ${row.article})`;
  }
  return humanizeCategory(finding.category);
}

function replaceRawCategoryIds(
  output: string,
  state: AnalysisState,
  findings: Finding[]
): string {
  const labels = categoryLabels(state);
  for (const finding of findings) {
    if (!labels.has(finding.category)) {
      labels.set(finding.category, displayLabelForFinding(state, finding));
    }
  }
  let safe = output;
  for (const [category, label] of [...labels.entries()].sort(
    (a, b) => b[0].length - a[0].length
  )) {
    safe = safe.replaceAll(category, label);
  }
  return safe;
}

function humanizeCategory(category: string): string {
  const withoutRulePrefix = category.replace(/^gdpr\.art[\w.-]+\./, "");
  return withoutRulePrefix
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowerFirst(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

function cleanQuote(value: string, maxLength: number): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replace(/[.”"]+$/, "");
}

async function streamBottomLine(state: AnalysisState, sections: string): Promise<string> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  try {
    const outcome = await executeBoundedCompletion(
      [
        "Write one short bottom-line paragraph in the voice of a senior associate advising a controller-side lawyer.",
        "Synthesize related findings into flowing prose with clear connective reasoning; never bullet-dump or mechanically repeat findings.",
        "Reorganize and rephrase ONLY claims already present in the structured sections below.",
        "Do not invent rights, timeframes, citations, or any new claim not traceable to a listed finding.",
        "Do not advise whether to sign or litigate.",
        "",
        sections,
      ].join("\n"),
      "Write polished senior-associate legal-memo prose from verified findings. Synthesize meaningfully, but introduce no new claim — reorganize and rephrase only.",
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
        "Write in the voice of a senior associate. Synthesize related findings into flowing paragraphs grouped by theme; never bullet-dump raw findings.",
        "Reorganize and rephrase only. Do not invent clauses, parties, risks, or claims not listed.",
        "Keep Tier B / Tier P / Tier C sections visually separate — never blend into one compliance table.",
        "Preserve every supplied [N] citation marker and the References section. Cite quoted evidence where provided.",
        "Use markdown headings and paragraphs; use bullets only where they materially improve readability.",
        "",
        structured,
      ].join("\n"),
      "You are a senior-associate document-analysis writer. Produce cohesive legal-memo prose, not a raw finding dump. Stay faithful to the supplied findings; no new claims. Never advise whether to sign or litigate.",
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
