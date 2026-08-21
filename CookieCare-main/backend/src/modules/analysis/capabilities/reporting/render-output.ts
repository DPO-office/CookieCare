import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding, MatrixAddressing } from "../../models/finding.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import type { RuleSourceTier } from "../../models/rule-source.js";
import type { ReportSpec } from "../../models/intent.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { extractArticleNumbers } from "../../skills/runtime/focus/extract-instruction-focus.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { synthesizeReport } from "./synthesize-report.js";
import { enforceConclusionSectionLast } from "../../prompts/report-sections.js";
import { pacLog } from "../../utils/pac-log.js";
import {
  BOTTOM_LINE_SYSTEM_PROMPT,
  NARRATIVE_REPORT_SYSTEM_PROMPT_WITH_CRAFT,
  buildBottomLineUserPrompt,
  buildNarrativeReportUserPrompt,
} from "../../prompts/render-output-prompts.js";
import type { RendererHooks, SkillRegimeRule } from "../../skills/runtime/catalog/types.js";
import {
  articleNumberForFinding as resolveArticleNumber,
  crossCuttingTimeframeFindings,
  gapFindingsForArticle,
} from "../../shared/article-linkage.js";

/** Find the first authored rule whose rendererHooks[hook] is truthy. */
export function findRuleByRendererHook(
  state: AnalysisState,
  hook: keyof RendererHooks
): SkillRegimeRule | undefined {
  for (const skill of state.activeSkills ?? []) {
    for (const rule of skill.regimeRules ?? []) {
      if (rule.rendererHooks?.[hook]) return rule;
    }
  }
  for (const rule of state.mergedRegimeRules ?? []) {
    if (rule.rendererHooks?.[hook]) return rule;
  }
  return undefined;
}

function plainDescriptionForArticle(
  state: AnalysisState,
  article: number
): string {
  const row = (state.activeSkills ?? [])
    .flatMap((skill) => skill.rightsMatrixRows ?? [])
    .find((candidate) => Number(candidate.article.match(/\d+/)?.[0]) === article);
  if (row?.plainDescription?.trim()) return row.plainDescription.trim();
  return `This article sets an obligation relevant to Article ${article}.`;
}

function resolveReportSpec(state: AnalysisState, schemaId: string): ReportSpec {
  const spec = state.plan?.reportSpec;
  if (spec) return spec;
  throw new Error(
    `Missing ReportSpec on analysis plan (schemaId=${schemaId}). PLAN must author report structure before render.`
  );
}

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

  const assessments = state.requirementAssessments ?? [];
  const requestedArticles = extractArticleNumbers(state.request.instruction);
  const reportSpec = state.plan?.reportSpec;
  const wantsRequirementsDetail = reportSpec?.sections.includes("requirements_detail");
  const briefSummaryIsArticleQuickRef =
    schemaId === "brief_summary" &&
    requestedArticles.length > 0 &&
    !wantsRequirementsDetail;
  const forceSynthesisFromSpec =
    schemaId === "brief_summary" && Boolean(wantsRequirementsDetail);
  const usesSynthesis =
    (assessments.length > 0 || forceSynthesisFromSpec) &&
    schemaId !== "rights_matrix_memo" &&
    schemaId !== "playbook_comparison_memo" &&
    !briefSummaryIsArticleQuickRef;

  const presentation =
    state.intent?.documentPresentation ??
    state.request.documentPresentation ??
    "unified";
  const targetDocs = (state.workspace.documents ?? []).filter(
    (d) => d.role !== "reference"
  );

  let rendered: string;
  if (usesSynthesis) {
    const synthStarted = Date.now();
    const spec = resolveReportSpec(state, schemaId);
    if (presentation === "individual" && targetDocs.length > 1) {
      rendered = await synthesizeIndividualReports(state, visible, spec, targetDocs);
    } else {
      rendered = await synthesizeReport(state, visible, spec);
    }
    pacLog("render synthesis", {
      ms: Date.now() - synthStarted,
      assessments: assessments.length,
      presentation,
      schemaId,
    });
  } else if (schemaId === "brief_summary") {
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
  rendered = sanitizeRenderedOutput(rendered);

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

async function synthesizeIndividualReports(
  state: AnalysisState,
  findings: Finding[],
  spec: ReportSpec,
  docs: SegmentedDocument[]
): Promise<string> {
  const parts: string[] = [];
  for (const [index, doc] of docs.entries()) {
    const docFindings = findings.filter((finding) =>
      findingBelongsToDoc(finding, doc.docId, index)
    );
    const findingIds = new Set(docFindings.map((finding) => finding.findingId));
    const assessments = (state.requirementAssessments ?? []).filter((assessment) =>
      assessment.supportingFindingIds.length === 0
        ? docFindings.length > 0
        : assessment.supportingFindingIds.some((id) => findingIds.has(id))
    );
    const heading = `# Analysis for: ${doc.title || doc.docId}`;
    emitAnalysisToken(state, `\n\n${heading}\n\n`);
    const scoped: AnalysisState = {
      ...state,
      findings: docFindings,
      requirementAssessments: assessments,
      request: {
        ...state.request,
        instruction: `${state.request.instruction}\n\nWrite this section only for document: ${doc.title || doc.docId}.`,
      },
    };
    const body = await synthesizeReport(scoped, docFindings, spec);
    parts.push(`${heading}\n\n${body}`);
  }
  return parts.join("\n\n---\n\n");
}

function findingBelongsToDoc(finding: Finding, docId: string, docIndex: number): boolean {
  if (finding.evidence.some((span) => span.locator.docId === docId)) return true;
  if (finding.workUnitId?.startsWith(`d${docIndex}-`)) return true;
  return false;
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
 * One user-facing conclusion per legal theme. Per-clause flag_risk / rule
 * attempts stay in the finding store for critique; the memo must not reprint
 * the same Art 17 / Art 20 gap a dozen times.
 */
export function consolidateFindingsForRender(findings: Finding[]): Finding[] {
  const grouped = new Map<string, Finding[]>();
  const passthrough: Finding[] = [];

  for (const finding of findings.map(userSafeFinding)) {
    const key = consolidationKey(finding);
    if (!key) {
      passthrough.push(finding);
      continue;
    }
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }

  for (const group of grouped.values()) {
    passthrough.push(pickPreferredFinding(group));
  }

  return passthrough;
}

function consolidationKey(finding: Finding): string | null {
  if (finding.orgPlaybook || finding.unverified) return null;
  if (finding.matrixRowId) return `matrix:${finding.matrixRowId}`;
  if (finding.kind === "compliance" && finding.ruleId) {
    return `rule:${finding.skillId ?? ""}:${finding.ruleId}`;
  }
  if (finding.kind === "risk" || finding.kind === "compliance") {
    const lane = finding.relatedNotRequested ? "rel" : "pri";
    return `theme:${lane}:${finding.skillId ?? ""}:${finding.kind}:${finding.category}`;
  }
  return null;
}

function pickPreferredFinding(group: Finding[]): Finding {
  const statusRank: Record<Finding["status"], number> = {
    absent_expected: 4,
    not_covered: 3,
    insufficient_evidence: 2,
    present: 1,
  };
  const severityRank = { high: 3, medium: 2, low: 1 } as const;
  const selected = [...group].sort((a, b) => {
    const status = statusRank[b.status] - statusRank[a.status];
    if (status !== 0) return status;
    return (
      (severityRank[b.severity ?? "low"] ?? 0) -
      (severityRank[a.severity ?? "low"] ?? 0)
    );
  })[0]!;
  return { ...selected, evidence: mergeUniqueEvidence(group) };
}

function mergeUniqueEvidence(findings: Finding[]): Finding["evidence"] {
  return findings
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
}

function articleNumberForFinding(
  finding: Finding,
  state?: AnalysisState
): number | undefined {
  return resolveArticleNumber(finding, state);
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
    const description = plainDescriptionForArticle(state, article);
    lines.push(`| Article ${article} | ${description} | ${briefStatus(finding)} |`);
  }

  lines.push("", "## What this means", "");
  for (const article of requested) {
    const row = rows.find((candidate) => Number(candidate.article.match(/\d+/)?.[0]) === article);
    const finding =
      findings.find((candidate) => candidate.matrixRowId === row?.rowId) ??
      findings.find((candidate) => articleNumberForFinding(candidate) === article);
    const description = plainDescriptionForArticle(state, article);
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
  appendCoverageLimitationsSection(lines, state, findings);
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
    lines.push("| Status | Category | Severity | Claim |");
    lines.push("|---|---|---|---|");
    for (const f of tierB) {
      const marker = citations.markerForFinding(f);
      const status = memoStatusLabel(f);
      const severity = displaySeverity(f);
      lines.push(
        `| **${status}** | ${displayLabelForFinding(state, f)} | **${severity}** | ${`${f.claim}${marker ? ` ${marker}` : ""}`.replace(/\|/g, "/")} |`
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

function memoStatusLabel(f: Finding): string {
  if (f.matrixAddressing === "named") return "Covered";
  if (f.matrixAddressing === "generic") return "Partial";
  if (f.matrixAddressing === "absent") return "Gap";
  if (f.status === "present") return "Covered";
  if (f.status === "absent_expected") return "Gap";
  if (f.status === "insufficient_evidence") return "Cannot determine";
  if (f.status === "not_covered") return "Not yet supported";
  return humanizeCategory(f.status);
}

function displaySeverity(f: Finding): string {
  const severity = f.severity ?? "material";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function gapLeadIn(state: AnalysisState, finding: Finding): string {
  const label = displayLabelForFinding(state, finding);
  return `**${displaySeverity(finding)} — ${label}.**`;
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
  const lines = [
    sections,
    "## 7. Bottom Line",
    "",
    citedBottom,
  ];
  // Limitations sit immediately after the conclusion — only when skill/package gaps exist.
  appendCoverageLimitationsSection(lines, state, findings);
  lines.push(
    "",
    "## 8. References",
    "",
    references.length > 0 ? references.join("\n") : "_No source documents were cited._"
  );
  const full = lines.join("\n").trim();
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

  lines.push("## 1. Architecture / Obligations Summary", "");
  lines.push(architectureParagraph(state, findings, citations), "");

  const matrix = findings.filter(
    (f) => f.matrixRowId && findingTier(f) === "B" && !f.unverified && !f.orgPlaybook
  );
  const rows = state.activeSkills?.flatMap((s) => s.rightsMatrixRows ?? []) ?? [];
  const timeframeGaps = crossCuttingTimeframeFindings(findings, state);
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
      const articleNum = Number(String(article).match(/\d+/)?.[0]);
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
      const gap = matrixGapCell(state, findings, f, articleNum, timeframeGaps, citations);
      lines.push(`| ${right} | ${article} | ${addressed} | ${gap} |`);
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
  const timeframeRule = findRuleByRendererHook(state, "responseTimeframeSection");
  const timeframeFinding = timeframeRule
    ? findings.find((f) => f.ruleId === timeframeRule.ruleId)
    : undefined;
  if (timeframeFinding) {
    const marker = citations.markerForFinding(timeframeFinding);
    const timeframeSentences = [
      ensureSentence(timeframeFinding.claim),
      timeframeFinding.gap
        ? ensureSentence(`The identified gap is that ${lowerFirst(timeframeFinding.gap)}`)
        : "",
    ].filter(Boolean);
    if (timeframeFinding.evidence[0]) {
      timeframeSentences.push(
        `The relevant agreement language states, “${cleanQuote(timeframeFinding.evidence[0].quotedText, 280)}.”`
      );
    }
    lines.push(`${timeframeSentences.join(" ")}${marker ? ` ${marker}` : ""}`);
  } else {
    const label =
      timeframeRule?.rendererHooks?.slaContrastLabel ?? "response-timeframe";
    lines.push(`No ${label} finding was emitted.`);
  }
  const slaContrast = numericSlaContrastParagraph(state, timeframeFinding, citations);
  if (slaContrast) {
    lines.push("");
    lines.push(slaContrast);
  }
  lines.push("");

  lines.push("## 4. Gaps That Could Result in a Violation", "");
  const gaps = getEligibleRemedialFindings(findings, state);
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

function matrixGapCell(
  state: AnalysisState,
  findings: Finding[],
  matrixFinding: Finding,
  articleNum: number,
  timeframeGaps: Finding[],
  citations: CitationRegistry
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const pushGap = (finding: Finding, text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const marker = citations.markerForFinding(finding);
    parts.push(`${cleaned}${marker ? ` ${marker}` : ""}`);
  };

  if (matrixFinding.gap?.trim()) {
    pushGap(matrixFinding, matrixFinding.gap);
  } else if (matrixFinding.status !== "present" && matrixFinding.claim) {
    pushGap(matrixFinding, matrixFinding.claim);
  }

  if (Number.isFinite(articleNum) && articleNum > 0) {
    for (const linked of gapFindingsForArticle(
      articleNum,
      findings,
      state,
      new Set([matrixFinding.findingId])
    )) {
      pushGap(
        linked,
        linked.gap?.trim() ||
          displayLabelForFinding(state, linked) ||
          linked.claim
      );
    }
  }

  for (const tf of timeframeGaps) {
    if (tf.findingId === matrixFinding.findingId) continue;
    const label = displayLabelForFinding(state, tf);
    const detail = tf.gap?.trim() || tf.claim;
    pushGap(tf, `⚑ Response timeframe: ${detail || label}`);
  }

  if (parts.length === 0) return "—";
  return parts.join("; ").replace(/\|/g, "/");
}

function unitRelatedNotes(state: AnalysisState): string[] {
  const fromSkills = (state.activeSkills ?? []).flatMap((s) =>
    (s.relatedChecks ?? []).map((r) => r.note).filter((n): n is string => Boolean(n))
  );
  return [...new Set(fromSkills)];
}

/**
 * Skill / package coverage gaps only — omitted when analysis coverage is complete.
 * Placed after the Bottom Line conclusion so the analysis is not framed as untrustworthy up front.
 */
function appendCoverageLimitationsSection(
  lines: string[],
  state: AnalysisState,
  findings: Finding[]
): void {
  const notCovered = findings.filter(
    (f) => f.status === "not_covered" && f.visibility !== "internal"
  );
  const draftWarns = state.partialCoverageWarning ?? [];
  if (notCovered.length === 0 && draftWarns.length === 0) return;

  lines.push("", "## Coverage limitations", "");
  lines.push(
    "These points could not be fully evaluated because a required skill, rule, or analysis package is missing or incomplete. Rely on the rest of this analysis as usual; treat only the items below with extra caution.",
    ""
  );
  for (const warn of draftWarns) {
    lines.push(`- ${warn}`);
  }
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
}

function appendAttributionSections(
  lines: string[],
  state: AnalysisState,
  findings: Finding[],
  citations: CitationRegistry
): void {
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

export function getEligibleRemedialFindings(
  findings: Finding[],
  state?: AnalysisState
): Finding[] {
  const eligible = findings.filter(
    (finding) =>
      finding.visibility !== "internal" &&
      !finding.relatedNotRequested &&
      finding.status !== "not_covered" &&
      findingTier(finding) === "B" &&
      !finding.unverified &&
      !finding.orgPlaybook &&
      (finding.severity === "medium" || finding.severity === "high") &&
      (finding.kind === "risk" ||
        finding.status !== "present" ||
        finding.matrixAddressing === "generic" ||
        finding.matrixAddressing === "absent")
  );
  const byLabel = new Map<string, Finding[]>();
  for (const finding of eligible) {
    const label = (
      state ? displayLabelForFinding(state, finding) : finding.category
    )
      .trim()
      .toLowerCase();
    byLabel.set(label, [...(byLabel.get(label) ?? []), finding]);
  }
  return [...byLabel.values()].map((group) => pickPreferredFinding(group));
}

function architectureParagraph(
  state: AnalysisState,
  findings: Finding[],
  citations: CitationRegistry
): string {
  const summary = findings.find(
    (finding) => finding.kind === "summary_point" && finding.visibility !== "internal"
  );
  const assistanceRule = findRuleByRendererHook(state, "particularsChecklist");
  const assistance = assistanceRule
    ? findings.find((finding) => finding.ruleId === assistanceRule.ruleId)
    : undefined;
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
      assistanceRule?.rendererHooks?.architectureFallback ??
        "The review considers the agreement's contractual mechanism for assisting with data-subject rights and the operational terms that support that mechanism."
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
  timeframeFinding: Finding | undefined,
  citations: CitationRegistry
): string | null {
  const slaRule = findRuleByRendererHook(state, "slaContrast");
  if (!slaRule?.rendererHooks?.slaContrast) return null;
  const excludeTypes = new Set(
    slaRule.rendererHooks.excludeClauseTypesFromSlaContrast ?? []
  );
  const contrastLabel =
    slaRule.rendererHooks.slaContrastLabel ?? "the response-timeframe rule";
  const docs = state.workspace.documents;
  const seen = new Set<string>();
  const examples: string[] = [];
  const re =
    /\b(\d+)\s*(hour|hours|day|days|week|weeks|month|months|business days?)\b/gi;
  for (const doc of docs) {
    for (const c of doc.clauses ?? []) {
      if (excludeTypes.has(c.clauseType)) continue;
      const m = c.text.match(re);
      if (!m) continue;
      const key = `${c.clauseType}:${m[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        timeframeFinding?.evidence[0]?.quotedText &&
        m[0] === timeframeFinding.evidence[0].quotedText
      ) {
        continue;
      }
      examples.push(
        `${c.clauseType.replace(/_/g, " ")} (“${m[0]}”) ${citations.markerForDoc(doc.docId)}`
      );
    }
  }
  if (examples.length === 0) return null;
  return `By contrast, the agreement already uses specific numeric service levels elsewhere, including ${examples.slice(0, 4).join(", ")}. Those provisions do not themselves satisfy ${contrastLabel}, but they show that the document can express measurable response commitments where the parties choose to do so.`;
}

function gapParagraph(
  state: AnalysisState,
  finding: Finding,
  citations: CitationRegistry
): string {
  if (finding.status === "not_covered") {
    return `${gapLeadIn(state, finding)} ${ensureSentence(
      `${finding.claim} This reflects a system coverage limitation — not a determination that the document complies or violates the standard.`
    )}`;
  }
  const article = articleForFinding(state, finding);
  const marker = citations.markerForFinding(finding);
  const sentences = [
    gapLeadIn(state, finding),
    `${ensureSentence(finding.claim)}${marker ? ` ${marker}` : ""}`,
    finding.gap ? ensureSentence(`The resulting gap is that ${lowerFirst(finding.gap)}`) : "",
    article ? ensureSentence(`This assessment relates to **${article}**.`) : "",
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
    if (row) {
      const regime = row.regimeLabel?.trim();
      return regime ? `${regime} Article ${row.article}` : `Article ${row.article}`;
    }
  }
  const match = finding.ruleId?.match(/\.art(.+)$/i);
  if (!match) return null;
  const parts = match[1].split(".");
  const article =
    parts[0] + (parts.length > 1 ? `(${parts.slice(1).join(")(")})` : "");
  const rowLabel = (state.activeSkills ?? [])
    .flatMap((skill) => skill.rightsMatrixRows ?? [])
    .find((r) => r.regimeLabel)?.regimeLabel?.trim();
  return rowLabel ? `${rowLabel} Article ${article}` : `Article ${article}`;
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
  const withoutRulePrefix = category.replace(/^[a-z0-9_-]+\.art[\w.-]+\./i, "");
  return withoutRulePrefix
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const INTERNAL_OUTPUT_PATTERNS = [
  /\bpackageId[=:\s][\w.-]+/gi,
  /\bworkUnitId[=:\s][\w.-]+/gi,
  /no analysis package exists/gi,
  /\bnot_supported\b/gi,
  /\bretry diagnostics\b/gi,
];

export function sanitizeRenderedOutput(output: string): string {
  let safe = output;
  for (const pattern of INTERNAL_OUTPUT_PATTERNS) {
    safe = safe.replace(pattern, "[redacted internal routing detail]");
  }
  // Universal post-process for every report type/ask: Conclusion before References.
  return enforceConclusionSectionLast(safe);
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
      buildBottomLineUserPrompt(sections),
      BOTTOM_LINE_SYSTEM_PROMPT,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI,
      {
        onDelta: (delta) => emitAnalysisToken(state, delta),
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
  try {
    const outcome = await executeBoundedCompletion(
      buildNarrativeReportUserPrompt(structured, schemaId),
      NARRATIVE_REPORT_SYSTEM_PROMPT_WITH_CRAFT,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI,
      {
        onDelta: (delta) => emitAnalysisToken(state, delta),
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
