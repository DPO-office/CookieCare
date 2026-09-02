import {
  executeBoundedCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding, MatrixAddressing } from "../../models/finding.js";
import type { AnalysisArtifact } from "../../models/evidence-package.js";
import type { RuleSourceTier } from "../../models/rule-source.js";
import type { ReportSpec } from "../../models/intent.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import {
  displayRequirementStatus,
  isConditionalLike,
  isCoveredLike,
  isGapLike,
  isMaterialIssueStatus,
} from "../../models/requirement-assessment.js";
import { deterministicFactRollup } from "../../prompts/analytical-synthesis.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { humanizeRequirementId } from "../../shared/group-assessments.js";
import { isTabularAnswerStyle, wantsMatrixTable } from "../../prompts/synthesis.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { extractArticleNumbers } from "../../skills/runtime/focus/extract-instruction-focus.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { synthesizeReport } from "./synthesize-report.js";
import { applyFinalizedReportSpec, finalizeReportSpec } from "./finalize-report-spec.js";
import { enforceConclusionSectionLast } from "../../prompts/report-sections.js";
import { pacLog, beginRenderStreaming } from "../../utils/pac-log.js";
import { groundFindings } from "../audit/ground-findings.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
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
import { isReferencedElsewhereClaim } from "../act/requirement-status-policy.js";
import {
  canonicalRequirementId,
  filterAssessmentsByRequirementIds,
  findingSupportsRequirement,
} from "../../shared/requirement-identity.js";

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
  beginRenderStreaming(state);
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const primarySkill = titleSkillForRender(state, skillIds);
  let visible = consolidateFindingsForRender(
    findings.filter((f) => f.visibility !== "internal")
  );
  visible = filterFindingsForMatrixFocus(visible, state);
  state = {
    ...state,
    findings: visible,
    requirementAssessments: filterAssessmentsForMatrixFocus(
      state.requirementAssessments ?? [],
      visible,
      state
    ),
  };
  state = groundFindings(state);
  visible = (state.findings ?? []).filter((f) => f.visibility !== "internal");
  state = attachRightsMatrixTableArtifact(state, visible);

  const followUpKind = String(unit.input.followUpKind ?? "");
  if (followUpKind === "conversational_qa") {
    const targeted = assessmentsMentionedInInstruction(
      state.request.instruction,
      state.requirementAssessments ?? []
    );
    if (targeted.length > 0) {
      state = { ...state, requirementAssessments: targeted };
    }
  }

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
  const matrixFindingsExist = visible.some((f) => Boolean(f.matrixRowId));
  const usesSynthesis =
    (assessments.length > 0 || forceSynthesisFromSpec || matrixFindingsExist) &&
    schemaId !== "rights_matrix_memo" &&
    schemaId !== "playbook_comparison_memo" &&
    !briefSummaryIsArticleQuickRef;

  let rendered: string;
  let usedBluf = false;
  if (usesSynthesis) {
    const synthStarted = Date.now();
    const spec = finalizeReportSpec(state);
    state = applyFinalizedReportSpec(state, spec);
    const retrySectionIds = Array.isArray(unit.input.retrySectionIds)
      ? (unit.input.retrySectionIds as string[])
      : [];
    // BLUF collapse (flagged): one bottom-line call + a deterministic matrix,
    // instead of the section-per-call synthesis. The open risk and compare
    // lanes (operation=risk_flag/compare) always skip BLUF: their answer
    // shapes come from designRiskOutline/designComparisonOutline + synthesis.ts's
    // lane-aware content blocks (Part 3b/3c), which BLUF's fixed "Requirements
    // at a glance" / "Key risks" template does not implement — BLUF shows every
    // kind:"risk" or kind:"comparison_delta" finding as an undifferentiated row
    // (no nli filtering, no compareGroup pairing, no Finding.severity),
    // producing generic "Other material contractual risk — MEDIUM" entries
    // instead of a real answer.
    const usesDynamicOutlineLane =
      state.intent?.operation === "risk_flag" || state.intent?.operation === "compare";
    if (blufReportEnabled() && !usesDynamicOutlineLane) {
      rendered = await buildBlufReport(state, visible, spec);
      usedBluf = true;
    } else {
      rendered = await synthesizeReport(state, visible, spec, { retrySectionIds });
    }
    pacLog("render synthesis", {
      ms: Date.now() - synthStarted,
      assessments: assessments.length,
      schemaId,
      bluf: usedBluf,
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
  // BLUF already built its own single-matrix layout — the tabular table
  // injection would append a duplicate matrix, so skip it for BLUF output.
  if (!usedBluf) rendered = enforceAnswerStyleLayout(rendered, state);

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

export function buildRightsMatrixTableMarkdown(
  state: AnalysisState,
  findings: Finding[]
): string {
  const citations = createCitationRegistry(state, findings);
  const matrix = findings.filter(
    (f) => f.matrixRowId && findingTier(f) === "B" && !f.unverified && !f.orgPlaybook
  );
  const rows = state.activeSkills?.flatMap((s) => s.rightsMatrixRows ?? []) ?? [];
  const timeframeGaps = crossCuttingTimeframeFindings(findings, state);
  if (matrix.length === 0) {
    return "_No matrix-row findings were emitted._";
  }
  const lines = ["| Right | Article | Addressed? | Gap |", "|---|---|---|---|"];
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
  return lines.join("\n");
}

export function filterFindingsForMatrixFocus(
  findings: Finding[],
  state: AnalysisState
): Finding[] {
  const matrixIds = state.plan?.focus?.matrixRowIds ?? [];
  if (matrixIds.length === 0) return findings;
  const structuralIds = new Set(
    (state.activeSkills ?? [])
      .flatMap((s) => s.evidencePackages ?? [])
      .filter(
        (pkg) =>
          pkg.orchestration?.role === "structural_review" ||
          pkg.orchestration?.suppressWhenMatrixFocus === true
      )
      .map((pkg) => pkg.id)
  );
  const leftoverRules = new Set(state.plan?.focus?.ruleIds ?? []);
  const mappedReqIds = new Set(
    (state.plan?.focus?.requirementMappings ?? [])
      .filter((mapping) =>
        mapping.capabilityIds.some(
          (id) => matrixIds.includes(id) || leftoverRules.has(id)
        )
      )
      .map((mapping) => mapping.requirementId)
  );
  return findings.filter((finding) => {
    if (finding.packageId && structuralIds.has(finding.packageId)) return false;
    if (finding.workUnitId) {
      for (const id of structuralIds) {
        if (finding.workUnitId.includes(id)) return false;
      }
    }
    if (finding.matrixRowId) return matrixIds.includes(finding.matrixRowId);
    if (finding.requirementId && mappedReqIds.has(finding.requirementId)) {
      return true;
    }
    if (finding.ruleId && leftoverRules.has(finding.ruleId)) return true;
    if (finding.kind === "risk" && finding.visibility !== "internal") return true;
    if (finding.kind === "summary_point") return true;
    return false;
  });
}

export function filterAssessmentsForMatrixFocus(
  assessments: NonNullable<AnalysisState["requirementAssessments"]>,
  findings: Finding[],
  state: AnalysisState
): NonNullable<AnalysisState["requirementAssessments"]> {
  if (!(state.plan?.focus?.matrixRowIds?.length)) return assessments;
  const keptFindingIds = new Set(findings.map((f) => f.findingId));
  const keptReqIds = new Set(
    findings.map((f) => f.requirementId).filter((id): id is string => Boolean(id))
  );
  return assessments.filter((assessment) => {
    if (keptReqIds.has(assessment.requirementId)) return true;
    return assessment.supportingFindingIds.some((id) => keptFindingIds.has(id));
  });
}

export function assessmentsMentionedInInstruction(
  instruction: string,
  assessments: RequirementAssessment[]
): RequirementAssessment[] {
  const hay = instruction.toLowerCase();
  const articleHits = [...hay.matchAll(/\b(?:art(?:icle)?\s*)(\d{1,3})(?:\s*\(\s*(\d+)\s*\))?(?:\s*\(\s*([a-h])\s*\))?/gi)];
  return assessments.filter((row) => {
    const id = row.requirementId.toLowerCase();
    if (hay.includes(id)) return true;
    const tokens = id.replace(/[._-]+/g, " ").split(/\s+/).filter((t) => t.length >= 4);
    if (tokens.some((token) => hay.includes(token))) return true;
    return articleHits.some((match) => {
      const article = match[1];
      const para = match[2];
      const letter = match[3]?.toLowerCase();
      if (!id.includes(article ?? "")) return false;
      if (letter && !id.includes(`_${letter}_`) && !id.endsWith(`_${letter}`) && !id.includes(`.${letter}`)) {
        return Boolean(para) && id.includes(para);
      }
      return true;
    });
  });
}

export function attachRightsMatrixTableArtifact(
  state: AnalysisState,
  findings: Finding[]
): AnalysisState {
  if (!(state.plan?.focus?.matrixRowIds?.length)) return state;
  if (!wantsMatrixTable(state)) return state;
  const ownerId =
    (state.activeSkills ?? [])
      .flatMap((s) => s.evidencePackages ?? [])
      .find((pkg) => pkg.orchestration?.role === "matrix_owner")?.id ??
    "rights_matrix";
  const artifact: AnalysisArtifact = {
    id: "rights_matrix_table",
    type: "rights_matrix_table",
    packageId: ownerId,
    sourceFindingIds: findings.filter((f) => f.matrixRowId).map((f) => f.findingId),
    data: { markdown: buildRightsMatrixTableMarkdown(state, findings) },
  };
  return {
    ...state,
    analysisArtifacts: {
      ...(state.analysisArtifacts ?? {}),
      [artifact.id]: artifact,
    },
  };
}

function titleSkillForRender(state: AnalysisState, skillIds: string[]) {
  const active = state.activeSkills ?? [];
  return (
    active.find((s) => s.axis === "regime") ??
    active.find((s) => s.axis === "doc-type") ??
    skillIds
      .map((id) => getSkillById(id))
      .find((s) => s && s.skillId !== "_global") ??
    (skillIds[0] ? getSkillById(skillIds[0]) : undefined)
  );
}

function consolidationKey(finding: Finding): string | null {
  if (finding.orgPlaybook || finding.unverified) return null;
  if (finding.matrixRowId) return `matrix:${finding.matrixRowId}`;
  if (finding.requirementId) {
    return `req:${finding.skillId ?? ""}:${finding.kind}:${finding.status}:${canonicalRequirementId(finding.requirementId)}`;
  }
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

  const matrixTable = buildRightsMatrixTableMarkdown(state, findings);
  lines.push("## 2. Rights Matrix / Mapping", "");
  lines.push(matrixTable, "");

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

const TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const SKIP_TABULAR_INJECT_HEADING =
  /^(scope|references|limitations|document overview|instruction)\b/i;

export function countMarkdownTables(markdown: string): number {
  return markdownTableRanges(markdown).length;
}

function isTableLine(line: string): boolean {
  return TABLE_LINE_RE.test(line);
}

function markdownTableRanges(markdown: string): Array<{ startLine: number; endLine: number }> {
  const lines = markdown.split(/\n/);
  const ranges: Array<{ startLine: number; endLine: number }> = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i] ?? "")) {
      i += 1;
      continue;
    }
    const startLine = i;
    while (i < lines.length && isTableLine(lines[i] ?? "")) i += 1;
    if (i - startLine >= 2) ranges.push({ startLine, endLine: i });
  }
  return ranges;
}

function tableText(lines: string[], range: { startLine: number; endLine: number }): string {
  return lines.slice(range.startLine, range.endLine).join("\n");
}

function mdCell(value: string): string {
  const clean = value.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  if (clean.length <= 360) return clean;
  // Truncate at a word boundary and add an ellipsis rather than slicing
  // mid-word (the old behaviour produced "…retrieval, analys").
  const cut = clean.slice(0, 360);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > 240 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, "");
  return `${trimmed}…`;
}

/**
 * Prettify a GDPR-article requirement id that lacks a trailing letter (the
 * lettered case is already handled by humanizeRequirementId). Turns
 * "gdpr.article28_3.mandatory_clauses_adequacy" into
 * "Art 28(3) — Mandatory Clauses Adequacy" instead of the raw
 * "Article28 3 Mandatory Clauses Adequacy". Local to rendering so the shared
 * humanizeRequirementId (and its test) stay untouched.
 */
function prettyArticleLabel(id: string): string | null {
  const m = id.match(/article[._-]?(\d{1,3})(?:[._-](\d+))?/i);
  if (!m || m.index === undefined) return null;
  const base = `Art ${m[1]}${m[2] ? `(${m[2]})` : ""}`;
  const tail = id
    .slice(m.index + m[0].length)
    .replace(/^[._-]+/, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return tail ? `${base} — ${tail}` : base;
}

function requirementLabel(
  requirementId: string,
  state?: AnalysisState
): string {
  const description = state?.intent?.requirements?.find((r) => r.id === requirementId)
    ?.description?.trim();
  if (description && description !== requirementId && description.length <= 80) {
    return description;
  }
  const humanized = humanizeRequirementId(requirementId);
  // humanizeRequirementId handles lettered ids ("Art 28(3)(g)…"); catch the
  // non-lettered article ids it leaves as "Article28 3 …".
  if (/^Article\d/.test(humanized)) {
    return prettyArticleLabel(requirementId) ?? humanized;
  }
  return humanized;
}

function pickRowFinding(
  assessment: RequirementAssessment,
  findingById: Map<string, Finding>
): Finding | undefined {
  const linked = assessment.supportingFindingIds
    .map((id) => findingById.get(id))
    .filter((f): f is Finding => Boolean(f));
  const direct = linked.filter((f) =>
    findingSupportsRequirement(f.requirementId, assessment.requirementId)
  );
  const pool = direct.length > 0 ? direct : linked;
  return (
    pool.find((f) => Boolean(f.evidence[0]?.quotedText?.trim())) ?? pool[0]
  );
}

/** "clause-3.6.3" → "cl. 3.6.3"; leaves section/article-style paths as-is; drops opaque ids. */
function formatLocator(path?: string): string {
  if (!path) return "";
  const clause = path.match(/^clause-(.+)$/i);
  if (clause) return `cl. ${clause[1]}`;
  if (/section|article|art\b|appendix|annex|schedule/i.test(path)) {
    return path.replace(/[-_]+/g, " ");
  }
  return "";
}

function evidenceCellText(
  assessment: RequirementAssessment,
  finding: Finding | undefined
): string {
  const quote = finding?.evidence[0]?.quotedText?.trim() ?? "";
  if (quote) {
    const loc = formatLocator(finding?.evidence[0]?.locator.structuralPath);
    return loc ? `${loc} — ${quote}` : quote;
  }
  if (finding && isReferencedElsewhereClaim(finding)) {
    return "Particulars referenced outside this extract";
  }
  if (
    isConditionalLike(assessment.status) ||
    assessment.judgement?.evidenceState === "incorporated"
  ) {
    return "Particulars referenced outside this extract";
  }
  return "No verbatim extract";
}

/**
 * ACT-Phase 7 — compose (never invent) VERIFY's locked enrichment fields
 * into the table's Finding cell. Only ever present on requirements
 * evaluated through the VERIFY path; a requirement with none of these
 * fields renders exactly as before.
 */
function enrichmentSuffix(assessment: RequirementAssessment, base: string): string {
  const parts: string[] = [];
  // VERIFY-produced findings often set the finding's own claim to the same
  // text as the assessment's gapDescription (buildInsufficientVerifyFinding)
  // — skip re-appending it verbatim when `base` already carries it.
  if (assessment.gapDescription && !base.includes(assessment.gapDescription)) {
    parts.push(assessment.gapDescription);
  }
  if (assessment.dependency) {
    parts.push(
      `Depends on ${assessment.dependency.document}: ${assessment.dependency.whyNeeded}`
    );
  }
  // Remediation is no longer crammed here — it renders in its own Action cell.
  return parts.join(" ");
}

/**
 * The per-row next step. Prefers VERIFY's specific, locked `remediation`; falls
 * back to a short verb-led phrase from the recommendation kind. Covered rows
 * with nothing to do return "" (a blank cell — never "—", which the layout
 * contract forbids). This is the industry-standard "what to do" column that
 * keeps the Finding cell to the finding itself instead of a truncated wall.
 */
function actionCellText(assessment: RequirementAssessment): string {
  const remedy = assessment.remediation?.trim();
  if (remedy) return remedy;
  switch (assessment.judgement?.recommendationKind) {
    case "obtain":
      return "Obtain the referenced schedule or materials.";
    case "amend":
      return "Amend the text to close the gap.";
    case "confirm":
      return "Confirm the incorporated schedule.";
    case "clarify":
      return "Clarify the wording.";
    default:
      return "";
  }
}

export function assessmentTableMarkdown(
  assessments: RequirementAssessment[],
  findings: Finding[],
  state?: AnalysisState
): string {
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  const header = [
    "| Requirement | Status | Evidence | Finding | Action |",
    "| :--- | :--- | :--- | :--- | :--- |",
  ];
  const rows = assessments.map((assessment) => {
    const support = pickRowFinding(assessment, findingById);
    const base = assessment.establishedBy ?? support?.claim ?? assessment.summary;
    const finding = [base, enrichmentSuffix(assessment, base)].filter(Boolean).join(" ");
    return `| ${mdCell(requirementLabel(assessment.requirementId, state))} | **${mdCell(displayRequirementStatus(assessment))}** | ${mdCell(evidenceCellText(assessment, support))} | ${mdCell(finding)} | ${mdCell(actionCellText(assessment))} |`;
  });
  return [...header, ...rows].join("\n");
}

function keepLargestMarkdownTable(markdown: string, preferText?: string): string {
  const lines = markdown.split(/\n/);
  const ranges = markdownTableRanges(markdown);
  if (ranges.length <= 1) return markdown;
  let keep = ranges[0]!;
  let keepScore = tableText(lines, keep).length;
  if (preferText) {
    const pref = preferText.replace(/\s+/g, " ").slice(0, 120);
    for (const range of ranges) {
      const text = tableText(lines, range);
      if (text.replace(/\s+/g, " ").includes(pref) || preferText.includes(text.slice(0, 80))) {
        keep = range;
        keepScore = Number.MAX_SAFE_INTEGER;
        break;
      }
    }
  }
  if (keepScore !== Number.MAX_SAFE_INTEGER) {
    for (const range of ranges) {
      const score = tableText(lines, range).length;
      if (score > keepScore) {
        keep = range;
        keepScore = score;
      }
    }
  }
  const drop = new Set(
    ranges.filter((r) => r.startLine !== keep.startLine).flatMap((r) => {
      const idxs: number[] = [];
      for (let i = r.startLine; i < r.endLine; i++) idxs.push(i);
      return idxs;
    })
  );
  return lines.filter((_, i) => !drop.has(i)).join("\n");
}

function assessmentsForHeading(
  heading: string,
  state: AnalysisState,
  assessments: RequirementAssessment[]
): RequirementAssessment[] {
  const outline = state.plan?.reportSpec?.outline ?? [];
  const needle = heading.trim().toLowerCase();
  const item = outline.find((entry) => entry.heading.trim().toLowerCase() === needle);
  if (!item?.requirementIds?.length) return [];
  return filterAssessmentsByRequirementIds(assessments, item.requirementIds);
}

export function stripMarkdownTables(markdown: string): string {
  const lines = markdown.split(/\n/);
  const drop = new Set(
    markdownTableRanges(markdown).flatMap((range) => {
      const idxs: number[] = [];
      for (let i = range.startLine; i < range.endLine; i++) idxs.push(i);
      return idxs;
    })
  );
  return lines
    .filter((_, i) => !drop.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function leadSentence(prose: string): string {
  const trimmed = prose.trim();
  if (!trimmed) return "";
  const firstPara = (trimmed.split(/\n\s*\n/)[0] ?? "").replace(/\n/g, " ").trim();
  const match = firstPara.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? firstPara).trim();
}

function sectionWithLockedTable(body: string, table: string): string {
  // Strip formal markdown tables and leftover pipe-rows (LLM often emits a
  // headerless "| Duration | Cannot determine |" that is not a GFM table).
  const withoutTables = stripMarkdownTables(body);
  const withoutPipeRows = withoutTables
    .split("\n")
    .filter((line) => !/^\|.*\|$/.test(line.trim()))
    .join("\n");
  const lead = leadSentence(withoutPipeRows);
  return lead ? `${lead}\n\n${table}` : table;
}

function injectAssessmentTableIntoSections(
  markdown: string,
  state: AnalysisState,
  assessments: RequirementAssessment[]
): string {
  if (assessments.length === 0) return markdown;
  const findings = state.findings ?? [];
  const locked = (rows: RequirementAssessment[]) =>
    assessmentTableMarkdown(rows, findings, state);
  const lines = markdown.split(/\n/);
  const headingIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? "")) headingIdxs.push(i);
  }
  if (headingIdxs.length === 0) {
    return `${sectionWithLockedTable(markdown, locked(assessments))}\n`;
  }

  const rebuilt: string[] = [];
  const prefix = lines.slice(0, headingIdxs[0]).join("\n").trimEnd();
  if (prefix) rebuilt.push(prefix);

  // Each locked assessment row belongs in exactly ONE section table. Recap
  // sections (Material gaps / Missing materials) list requirement ids that
  // overlap the requirement sections, which used to re-print the same rows
  // verbatim 2–3×. First occurrence (the requirement section) wins; a later
  // recap section whose rows were all already shown renders its prose lead
  // only, as a pointer back to the matrix — no duplicate table.
  const emitted = new Set<string>();
  let attachedAny = false;
  for (let h = 0; h < headingIdxs.length; h++) {
    const start = headingIdxs[h]!;
    const end = headingIdxs[h + 1] ?? lines.length;
    const headingLine = lines[start] ?? "";
    const heading = headingLine.replace(/^##\s+/, "").trim();
    const body = lines.slice(start + 1, end).join("\n");
    if (rebuilt.length > 0) rebuilt.push("");
    rebuilt.push(headingLine);
    if (SKIP_TABULAR_INJECT_HEADING.test(heading)) {
      const kept = body.replace(/^\n+/, "").replace(/\n+$/, "");
      if (kept) {
        rebuilt.push("");
        rebuilt.push(kept);
      }
      continue;
    }
    const scoped = assessmentsForHeading(heading, state, assessments).filter(
      (a) => !emitted.has(canonicalRequirementId(a.requirementId))
    );
    if (scoped.length > 0) {
      for (const a of scoped) emitted.add(canonicalRequirementId(a.requirementId));
      rebuilt.push("");
      rebuilt.push(sectionWithLockedTable(body, locked(scoped)));
      attachedAny = true;
      continue;
    }
    const prose = stripMarkdownTables(body);
    if (prose) {
      rebuilt.push("");
      rebuilt.push(prose);
    }
  }

  if (!attachedAny) {
    return `${sectionWithLockedTable(rebuilt.join("\n"), locked(assessments))}\n`;
  }
  return `${rebuilt.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function normalizeMarkdownTables(markdown: string): string {
  const lines = markdown.split(/\n/);
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (isTableLine(line) && prev !== undefined && prev.trim() !== "" && !isTableLine(prev)) {
      out.push("");
    }
    out.push(line);
  }
  return out.join("\n");
}

export function enforceAnswerStyleLayout(
  markdown: string,
  state: AnalysisState
): string {
  if (!markdown.trim()) return markdown;
  const separated = normalizeMarkdownTables(markdown);
  if (isTabularAnswerStyle(state)) {
    const assessments = state.requirementAssessments ?? [];
    if (assessments.length === 0) return separated;
    return injectAssessmentTableIntoSections(separated, state, assessments);
  }
  if (countMarkdownTables(separated) > 1) {
    const artifactMd =
      typeof state.analysisArtifacts?.rights_matrix_table?.data === "object"
        ? String(
            (state.analysisArtifacts.rights_matrix_table.data as { markdown?: string })
              .markdown ?? ""
          )
        : "";
    return keepLargestMarkdownTable(separated, artifactMd || undefined);
  }
  return separated;
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
        thinkingLevel: profileThinkingLevel(state, LLMTask.REFINEMENT),
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

/**
 * BLUF (bottom-line-up-front) report — behind ANALYSIS_BLUF_REPORT. Replaces
 * the multi-pass per-section LLM synthesis (which restated the same findings
 * in an executive summary, several matrix sections, a material-gaps prose
 * block, and a conclusion) with ONE inverted-pyramid layout:
 *   ## Bottom line            — one short LLM paragraph (the only LLM call)
 *   ## Requirements at a glance — one deterministic matrix, severity-ordered
 *   ## What needs attention   — deterministic one-liners for the problem rows
 *   ## Missing materials      — deterministic list of incorporated-but-unsupplied docs
 * Each fact appears once. Fewer LLM calls than the section-per-call path, so
 * it is also faster. Off by default → the existing path is unchanged.
 */
export function blufReportEnabled(): boolean {
  return process.env.ANALYSIS_BLUF_REPORT === "1";
}

/** Problems first: gap → conditional/partial → cannot_determine → covered → n/a. */
function severityRank(status: RequirementAssessment["status"]): number {
  if (isGapLike(status)) return 0;
  if (isConditionalLike(status)) return 1;
  if (status === "cannot_determine") return 2;
  if (isCoveredLike(status)) return 3;
  return 4;
}

async function streamBlufBottomLine(
  state: AnalysisState,
  assessments: RequirementAssessment[],
  riskFindings: Finding[] = []
): Promise<string> {
  const rollup = deterministicFactRollup(assessments);
  const system = [
    "You are a senior analyst writing the BOTTOM LINE of a document review for counsel.",
    "Write 2–4 sentences: the overall position, then the one or two items that most need attention, ending on what to do next.",
    "Use only the supplied counts, residual items, and risks. Do not invent findings, do not enumerate every item, do not restate a matrix, do not write a heading. No preamble such as 'In summary'.",
  ].join(" ");
  const riskSummary =
    riskFindings.length > 0
      ? (() => {
          const by = { high: 0, medium: 0, low: 0 } as Record<string, number>;
          for (const r of riskFindings) by[r.severity ?? "medium"] = (by[r.severity ?? "medium"] ?? 0) + 1;
          const top = riskFindings
            .filter((r) => r.severity === "high")
            .slice(0, 3)
            .map((r) => displayLabelForFinding(state, r));
          return [
            `Risks identified: ${riskFindings.length} (high ${by.high}, medium ${by.medium}, low ${by.low}).`,
            top.length > 0 ? `Most serious: ${top.join("; ")}.` : "",
          ]
            .filter(Boolean)
            .join(" ");
        })()
      : "";
  const user = [
    `User request: ${state.request.instruction.slice(0, 400)}`,
    "",
    rollup,
    riskSummary,
  ]
    .filter(Boolean)
    .join("\n");
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  try {
    const outcome = await executeBoundedCompletion(
      user,
      system,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI,
      {
        onDelta: (delta) => emitAnalysisToken(state, delta),
        tracker,
        thinkingLevel: profileThinkingLevel(state, LLMTask.REFINEMENT),
      }
    );
    if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
    return outcome.text.trim();
  } catch (err) {
    console.warn("[buildBlufReport] bottom line failed; using deterministic counts:", err);
    const fallback = rollup.split("\n")[0] ?? "See the requirements matrix below.";
    emitAnalysisToken(state, fallback);
    return fallback;
  }
}

function dedupeDependencies(
  assessments: RequirementAssessment[]
): Array<{ document: string; whyNeeded: string }> {
  const seen = new Set<string>();
  const out: Array<{ document: string; whyNeeded: string }> = [];
  for (const a of assessments) {
    const dep = a.dependency;
    if (!dep?.document) continue;
    const key = dep.document.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ document: dep.document.trim(), whyNeeded: dep.whyNeeded?.trim() ?? "" });
  }
  return out;
}

async function buildBlufReport(
  state: AnalysisState,
  findings: Finding[],
  _spec: ReportSpec
): Promise<string> {
  beginRenderStreaming(state);
  const allAssessments = [...(state.requirementAssessments ?? [])].sort(
    (a, b) => severityRank(a.status) - severityRank(b.status)
  );
  const findingList = state.findings ?? findings;
  const findingById = new Map(findingList.map((f) => [f.findingId, f]));

  // A requirement whose only support is risk findings (e.g. an open "biggest
  // risks" ask) isn't a compliance row — its content renders in Key risks
  // below, not as a "Cannot determine" matrix row.
  const isRiskOnly = (a: RequirementAssessment): boolean => {
    const supp = a.supportingFindingIds
      .map((id) => findingById.get(id))
      .filter((f): f is Finding => Boolean(f));
    return supp.length > 0 && supp.every((f) => f.kind === "risk");
  };
  const assessments = allAssessments.filter((a) => !isRiskOnly(a));
  const riskFindings = findingList.filter(
    (f) => f.kind === "risk" && f.visibility !== "internal"
  );

  const parts: string[] = [];

  // 1. Bottom line — the only LLM call, streamed live.
  emitAnalysisToken(state, "## Bottom line\n\n");
  const bottomLine = await streamBlufBottomLine(state, allAssessments, riskFindings);
  emitAnalysisToken(state, "\n\n");
  parts.push("## Bottom line", "", bottomLine, "");

  // 2. One deterministic compliance matrix, severity-ordered.
  if (assessments.length > 0) {
    const matrix = `## Requirements at a glance\n\n${assessmentTableMarkdown(assessments, findingList, state)}\n`;
    emitAnalysisToken(state, `${matrix}\n`);
    parts.push(matrix, "");
  }

  // 2b. Key risks — open/document-derived risk findings, most serious first.
  if (riskFindings.length > 0) {
    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = [...riskFindings].sort(
      (a, b) => (sevRank[a.severity ?? "medium"] ?? 1) - (sevRank[b.severity ?? "medium"] ?? 1)
    );
    const lines = ["## Key risks", ""];
    for (const r of sorted) {
      const sev = (r.severity ?? "medium").toUpperCase();
      const ev = r.evidence[0];
      const loc = ev ? formatLocator(ev.locator.structuralPath) : "";
      const quote = ev?.quotedText ? ` — “${cleanQuote(ev.quotedText, 180)}”` : "";
      lines.push(`### ${displayLabelForFinding(state, r)} — **${sev}**`);
      lines.push(`${ensureSentence(r.claim)}${loc ? ` (${loc})` : ""}${quote}`);
      lines.push("");
    }
    const section = lines.join("\n");
    emitAnalysisToken(state, `${section}\n`);
    parts.push(section, "");
  }

  // 3. What needs attention — problem rows only, one line each.
  const attention = assessments.filter(
    (a) => isMaterialIssueStatus(a.status) || a.status === "cannot_determine"
  );
  if (attention.length > 0) {
    const lines = ["## What needs attention", ""];
    for (const a of attention) {
      const action = actionCellText(a) || "Review with counsel.";
      lines.push(
        `- **${requirementLabel(a.requirementId, state)}** — ${displayRequirementStatus(a)}: ${action}`
      );
    }
    lines.push("");
    const section = lines.join("\n");
    emitAnalysisToken(state, `${section}\n`);
    parts.push(section, "");
  }

  // 4. Missing materials — incorporated-but-unsupplied documents.
  const deps = dedupeDependencies(assessments);
  if (deps.length > 0) {
    const lines = ["## Missing materials", ""];
    for (const dep of deps) {
      lines.push(`- **${dep.document}**${dep.whyNeeded ? ` — ${dep.whyNeeded}` : ""}`);
    }
    lines.push("");
    const section = lines.join("\n");
    emitAnalysisToken(state, section);
    parts.push(section);
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
        thinkingLevel: profileThinkingLevel(state, LLMTask.REFINEMENT),
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
