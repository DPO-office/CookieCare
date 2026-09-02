import type { AnalysisState } from "../models/analysis-state.js";
import type { Finding } from "../models/finding.js";
import type {
  ReportOutlineItem,
  ReportSectionId,
  ReportSpec,
} from "../models/intent.js";
import { conversationContextForIntent } from "../memory/conversation-window.js";
import type { RequirementAssessment } from "../models/requirement-assessment.js";
import { isConditionalLike, isMaterialIssueStatus, displayRequirementStatus } from "../models/requirement-assessment.js";
import {
  groupAssessmentsForReport,
  humanizeRequirementId,
} from "../shared/group-assessments.js";
import {
  REPORT_SECTION_DEFINITIONS,
  buildSectionGuidanceBlock,
  isAnalysisSectionId,
  isCaveatSectionId,
  isOpeningSectionId,
  narrativeArcGuidance,
  normalizeReportSections,
  outlineItemSectionId,
  suggestedHeading,
} from "./report-sections.js";
import { LEGAL_MEMO_MARKDOWN_CRAFT, TABULAR_SECTION_MARKDOWN_CRAFT } from "./memo-markdown-craft.js";

export const SYNTHESIS_SECTION_LABELS: Record<ReportSectionId, string> = Object.fromEntries(
  Object.entries(REPORT_SECTION_DEFINITIONS).map(([id, def]) => [id, def.suggestedHeading])
) as Record<ReportSectionId, string>;

/**
 * Final-report writer. The pipeline already assessed requirements; this model
 * must answer the user, not reprint the internal work product.
 */
export const SYNTHESIS_SYSTEM_PROMPT = [
  "You are the final legal analysis writer for a document-review pipeline.",
  "Write one coherent answer to the user's request. You are not rendering internal findings, work units, or a requirements database.",
  "",
  "Before writing, form the overall legal position from the supplied materials: what the user asked, which themes the assessments actually cover, where evidence is complete, and where it is qualified by cross-references or gaps.",
  "Then write the report. Do not think out loud in the output.",
  "",
  "User-facing granularity is coarser than internal granularity. Collapse overlapping or duplicate requirements into a single assessment. Never write two sections that reach the same conclusion in different words.",
  "Do not expose internal requirement IDs, work-unit IDs, package IDs, or finding IDs unless the user asked for them.",
  "",
  "Treat the supplied statuses as given. Explain them; do not silently reverse them. Do not change compliance, invent a gap, invent evidence, or add a recommendation kind.",
  "Print Status cells with these user-facing labels only:",
  "- Strong",
  "- Present & adequate",
  "- Present, particulars in schedule",
  "- Minor drafting gap",
  "- Gap",
  "- Cannot determine",
  "- Not applicable",
  "Never print the internal tokens conditional, covered, partial, missing, cannot_determine, nli, or evidenceState in a Status cell.",
  "Interpret statuses as follows:",
  "- strong / Strong: operative detail in this document fully substantiates the element.",
  "- adequate / Present & adequate: the obligation is present and verifiable in this document.",
  "- Present, particulars in schedule: the requirement is binding in this instrument; particulars live in a named schedule. Rec is Obtain, not Amend, and not Minor drafting gap.",
  "- conditional / Minor drafting gap: the obligation exists here but wording is incomplete or could be clearer. Not used for annex pointers.",
  "- gap / Gap: a positive absence in the reviewed text of a provision that was expected to contain the obligation.",
  "- cannot_determine / Cannot determine: no usable quote, unread truncated heading, or a floating/non-binding schedule pointer without enough contractual substance.",
  "- not_applicable / Not applicable: outside the scope of this agreement or request.",
  "",
  "Absence from the extracted evidence is not, by itself, proof that the obligation is missing from the agreement.",
  "A mere 'see Schedule X' pointer without enough contractual substance is Cannot determine (Obtain the schedule) — not Present and not Minor drafting gap.",
  "A binding incorporation that materially covers the requirement is Present, particulars in schedule.",
  "NLI is not compliance. Do not treat entailed as Present or not_mentioned as Gap.",
  "Distinguish whether an obligation exists from whether its adequacy can be verified.",
  "",
  "Do not overstate. Prefer \"not identified in the reviewed materials\" over \"the agreement does not contain…\" unless the relevant agreement or section was actually reviewed in full.",
  "Never turn incomplete evidence into a categorical legal conclusion.",
  "",
  "Each report section has a distinct rhetorical role (see SECTION ARCHITECTURE in the user brief).",
  "Respect the declared section order. Adapt heading wording to the user's request when natural, but never merge scope with conclusion or state the overall verdict in the scope section.",
  "Universal rule for every request and document type: write the Conclusion (or Bottom Line / Overall assessment) only after all analysis, qualifications, recommendations, and missing-materials sections. Never place it immediately after Scope when later sections exist. Only References may follow Conclusion.",
  "When analysis sections precede a conclusion, build the case first and synthesize the bottom line only in the conclusion section.",
  "Highlight contradictions, qualifications, and cross-references that materially affect the conclusion.",
  "Recommendations must follow from identified gaps. Do not invent generic checklists or advise whether to sign or litigate.",
  "Never recommend amending the agreement from cannot_determine, insufficient evidence, truncated quotes, or unread remainder of a clause. Those items get Obtain / Confirm / re-read only.",
  "Use Amend only when the assessment status is gap or partial and the suggested fix is tied to a complete cited operative quote.",
  "Introduce no new claim, right, timeframe, or citation that is not in the supplied assessments, findings, or evidence.",
    "Use only the requested sections, in order, and omit any that would be empty.",
  "The report should read like work from a senior legal or compliance analyst.",
  "",
  "If OUTPUT FORM is tabular, write the analysis as markdown tables with a short prose bottom line. Do not write long narrative sections.",
  "If OUTPUT FORM is narrative, write flowing prose. Use tables only when they materially help.",
  "When multiple documents were reviewed, write one combined report and name the documents in the scope section.",
  "If PRIOR CONVERSATION is supplied, answer the current user message in that context. Do not reprint the entire prior report unless the user asked to rewrite it.",
  "",
  LEGAL_MEMO_MARKDOWN_CRAFT,
].join("\n");

export function buildSynthesisUserPrompt(
  state: AnalysisState,
  findings: Finding[],
  assessments: RequirementAssessment[],
  reportSpec: ReportSpec
): string {
  const sections = normalizeReportSections(reportSpec.sections);
  const sectionHeadings = sections
    .map((id) => `- ${suggestedHeading(id)}`)
    .join("\n");
  const groups = groupAssessmentsForReport(assessments);
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  const outline = reportSpec.outline ?? [];
  const outlineAnalysisItems = outline.filter(
    (item) =>
      item.role === "analysis" ||
      item.role === "chapeau_particulars" ||
      item.role === "requirements_matrix" ||
      item.role === "key_findings"
  );

  const outputForm = state.intent?.outputForm ?? (state.request.answerStyle === "tabular" ? "table" : "memo");
  const conversation = conversationContextForIntent({
    conversation: state.conversation,
    priorInstruction: state.priorAnalysis?.instruction,
    priorReport: state.priorAnalysis?.renderedOutput,
  });
  const documents = (state.workspace?.documents ?? [])
    .map((d) => `- ${d.title || d.docId} (${d.role || "target"})`)
    .join("\n");

  return [
    "USER REQUEST",
    state.request.instruction.slice(0, 800),
    "",
    conversation ? conversation : "",
    conversation ? "" : "",
    "OUTPUT FORM",
    outputForm === "table"
      ? "tabular — markdown tables with a short prose bottom line"
      : outputForm === "brief_summary"
        ? "brief summary — short prose, no exhaustive tables"
        : "narrative — memo/prose",
    "",
    documents ? `Documents:\n${documents}` : "",
    "",
    "LEGAL FRAMEWORK",
    legalFramework(state),
    "",
    "PRIMARY REQUIREMENTS",
    primaryRequirements(state),
    "",
    "REPORT SPEC",
    `Type: ${reportSpec.reportType}`,
    `Depth: ${reportSpec.depth}`,
    "Produce ONLY the section roles below, in order, omitting any that would be empty:",
    sectionHeadings,
    "",
    buildSectionGuidanceBlock(reportSpec.sections),
    "",
    depthGuidance(reportSpec.depth),
    "",
    narrativeArcGuidance(reportSpec.reportType, reportSpec.depth, reportSpec.sections),
    "",
    outlineAnalysisItems.length > 0
      ? "Write each outline item as a top-level `##` section using the heading verbatim. Do not nest them under a Requirements detail wrapper. Do not add extra analysis headings for internal theme members."
      : "Write one user-facing `##` section per THEME GROUP below. Internal members of a group are the same legal question; synthesize them into one assessment.",
    "",
    outlineAnalysisItems.length > 0
      ? "OUTLINE SECTIONS (top-level ## headings)"
      : "THEME GROUPS",
    outlineAnalysisItems.length > 0
      ? renderOutlineMappedThemeGroups(groups, findingById, outlineAnalysisItems)
      : renderThemeGroups(groups, findingById),
    "",
    "CROSS-REFERENCES",
    renderCrossReferences(state, findings, assessments),
    "",
    "STRUCTURED INVENTORIES",
    renderArtifacts(state),
    "",
    "CONTRADICTIONS AND QUALIFICATIONS",
    renderContradictions(groups, assessments),
    "",
    "MATERIAL RISKS",
    renderRisks(findings),
  ].join("\n");
}

function legalFramework(state: AnalysisState): string {
  const intent = state.intent;
  const standard =
    intent?.standardConcept ||
    (intent?.standard && intent.standard !== "none" ? intent.standard : "");
  const skills = (state.activeSkills ?? [])
    .map((s) => s.label)
    .filter(Boolean)
    .slice(0, 4);
  const lines = [
    standard ? `Named standard: ${standard}` : "",
    skills.length ? `Active skills: ${skills.join("; ")}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "Not separately identified; infer from the user request and assessments.";
}

function primaryRequirements(state: AnalysisState): string {
  const reqs = state.intent?.requirements ?? [];
  if (reqs.length === 0) {
    return "Use the user request as the question to answer. Do not invent extra legal tests.";
  }
  return reqs
    .slice(0, 12)
    .map((r) => `- ${r.description}`)
    .join("\n");
}

function renderThemeGroups(
  groups: ReturnType<typeof groupAssessmentsForReport>,
  findingById: Map<string, Finding>
): string {
  if (groups.length === 0) return "(no requirement assessments)";
  return groups
    .map((group) => {
      const memberLines = group.members.map((member) => {
        const supporting = member.supportingFindingIds
          .map((id) => findingById.get(id))
          .filter((f): f is Finding => Boolean(f));
        const quotes = supporting
          .flatMap((f) => f.evidence.map((e) => e.quotedText.slice(0, 200)))
          .filter(Boolean)
          .slice(0, 3);
        return [
          `  - ${humanizeRequirementId(member.requirementId)} [${displayRequirementStatus(member)}] ${member.summary}`,
          member.recommendation ? `    Suggested fix: ${member.recommendation}` : "",
          quotes.length
            ? `    Evidence: ${quotes.map((q) => `"${q}"`).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      });
      return [
        `### ${group.title}`,
        `Combined status: ${displayRequirementStatus(group.members[0] ?? { status: group.status })}`,
        group.members.length > 1
          ? "Write ONE assessment covering all members of this group."
          : "",
        ...memberLines,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function renderOutlineMappedThemeGroups(
  groups: ReturnType<typeof groupAssessmentsForReport>,
  findingById: Map<string, Finding>,
  outlineAnalysisItems: ReportOutlineItem[]
): string {
  if (outlineAnalysisItems.length === 0) return "(no outline analysis items)";

  const buckets = outlineAnalysisItems.map((item) => ({
    item,
    groups: [] as typeof groups,
    requirementSet: new Set(item.requirementIds),
  }));

  // Deterministically map each theme group to the outline item with the
  // strongest requirement-id overlap.
  for (const group of groups) {
    const memberReqIds = new Set(group.members.map((m) => m.requirementId));
    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < buckets.length; i++) {
      const reqSet = buckets[i]!.requirementSet;
      let score = 0;
      for (const id of memberReqIds) {
        if (reqSet.has(id)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    buckets[bestIdx]!.groups.push(group);
  }

  const blocks: string[] = [];
  for (const bucket of buckets) {
    if (bucket.groups.length === 0) continue;
    blocks.push(`## ${bucket.item.heading}`);
    for (const group of bucket.groups) {
      blocks.push(renderThemeGroupMembersOnly(group, findingById));
    }
    blocks.push("");
  }

  return blocks.join("\n");
}

function renderThemeGroupMembersOnly(
  group: ReturnType<typeof groupAssessmentsForReport>[number],
  findingById: Map<string, Finding>
): string {
  const memberLines = group.members.map((member) => {
    const supporting = member.supportingFindingIds
      .map((id) => findingById.get(id))
      .filter((f): f is Finding => Boolean(f));
    const quotes = supporting
      .flatMap((f) => f.evidence.map((e) => e.quotedText.slice(0, 200)))
      .filter(Boolean)
      .slice(0, 3);
    return [
      `  - ${humanizeRequirementId(member.requirementId)} [${displayRequirementStatus(member)}] ${member.summary}`,
      member.recommendation ? `    Suggested fix: ${member.recommendation}` : "",
      quotes.length
        ? `    Evidence: ${quotes.map((q) => `"${q}"`).join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `Combined status: ${displayRequirementStatus(group.members[0] ?? { status: group.status })}`,
    group.members.length > 1
      ? "Write ONE assessment covering all members of this group."
      : "",
    ...memberLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCrossReferences(
  state: AnalysisState,
  findings: Finding[],
  assessments: RequirementAssessment[]
): string {
  const named = new Set<string>();
  for (const bundle of Object.values(state.sharedEvidence ?? {})) {
    for (const item of bundle.items) {
      for (const name of item.referencedDocuments ?? []) {
        if (name.trim()) named.add(name.trim());
      }
      if (item.evidenceStatus === "referenced_elsewhere") {
        named.add(
          item.quotedText.slice(0, 120) || item.clauseType || "referenced material"
        );
      }
    }
  }
  const elsewhere = [
    ...assessments.filter((a) => a.status === "cannot_determine"),
    ...findings.filter((f) => f.status === "insufficient_evidence"),
  ];
  if (named.size === 0 && elsewhere.length === 0) {
    return "None identified in the supplied materials.";
  }
  const lines = [...named].slice(0, 8).map((n) => `- Referenced material: ${n}`);
  if (elsewhere.length > 0) {
    lines.push(
      `- ${elsewhere.length} assessment(s)/finding(s) could not be verified from the supplied text and may depend on material not in this review.`
    );
  }
  return lines.join("\n");
}

function renderContradictions(
  groups: ReturnType<typeof groupAssessmentsForReport>,
  assessments: RequirementAssessment[]
): string {
  const mixed = groups.filter(
    (g) => g.members.length > 1 && new Set(g.members.map((m) => m.status)).size > 1
  );
  const partial = assessments.filter((a) => isConditionalLike(a.status));
  if (mixed.length === 0 && partial.length === 0) {
    return "No material contradictions were flagged in the assessments.";
  }
  const lines: string[] = [];
  for (const group of mixed) {
    lines.push(
      `- ${group.title}: internal members disagree (${group.members
        .map((m) => `${humanizeRequirementId(m.requirementId)}=${m.status}`)
        .join("; ")}). Reconcile into one qualified conclusion.`
    );
  }
  for (const a of partial.slice(0, 6)) {
    lines.push(`- ${humanizeRequirementId(a.requirementId)} is partial: ${a.summary}`);
  }
  return lines.join("\n");
}

function renderArtifacts(state: AnalysisState): string {
  const artifacts = Object.values(state.analysisArtifacts ?? {});
  if (artifacts.length === 0) return "None.";
  return artifacts
    .map((artifact) => {
      const data = artifact.data as {
        markdown?: string;
        transfers?: Array<{
          mechanism?: string;
          destinationJurisdiction?: string;
          quotedText?: string;
          sectionIds?: string[];
        }>;
        records?: unknown[];
        mechanisms?: string[];
        jurisdictions?: string[];
      };
      if (typeof data.markdown === "string" && data.markdown.trim()) {
        return data.markdown;
      }
      if (Array.isArray(data.transfers) && data.transfers.length > 0) {
        const lines = data.transfers.slice(0, 20).map((row) => {
          const where = row.destinationJurisdiction || row.sectionIds?.join(", ") || "";
          return `- ${row.mechanism ?? "unspecified"}${where ? ` (${where})` : ""}${
            row.quotedText ? `: ${row.quotedText.slice(0, 160)}` : ""
          }`;
        });
        const summary = [
          data.mechanisms?.length ? `Mechanisms: ${data.mechanisms.join(", ")}` : "",
          data.jurisdictions?.length ? `Jurisdictions: ${data.jurisdictions.join(", ")}` : "",
        ].filter(Boolean);
        return ["Transfer provisions identified:", ...summary, ...lines].join("\n");
      }
      return `${artifact.type}: ${JSON.stringify(artifact.data).slice(0, 800)}`;
    })
    .join("\n\n");
}

function renderRisks(findings: Finding[]): string {
  const risks = findings.filter((f) => f.kind === "risk" && f.visibility !== "internal");
  if (risks.length === 0) return "None flagged as user-facing material risks.";
  // A risk proposition VERIFY *contradicted* means the risk is NOT present —
  // the document actually protects on that point (buildVerifiedFinding's risk
  // lane stamps nli="contradicted"). These must never be written up as risks;
  // separate them so the writer presents them as reassurance, not problems.
  const present = risks.filter((f) => f.judgement?.nli !== "contradicted");
  const cleared = risks.filter((f) => f.judgement?.nli === "contradicted");
  const lines: string[] = [];
  if (present.length > 0) {
    lines.push("CONFIRMED RISKS (verified present in the document):");
    for (const f of present) {
      lines.push(`- ${f.claim}${f.severity ? ` (severity: ${f.severity})` : ""}`);
    }
  }
  if (cleared.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      "CHECKED — NOT A RISK (the document protects the party on these points; present as reassurance, never as problems):"
    );
    for (const f of cleared) lines.push(`- ${f.claim}`);
  }
  return lines.join("\n");
}

/**
 * Compare lane — pair kind:"comparison_delta" findings back into their
 * compareGroup (decomposeReasoningAsk's side_a/side_b split) so the writer
 * sees both sides of each dimension together instead of as unrelated rows.
 * A side with no established finding (VERIFY returned insufficient_evidence)
 * is named as unresolved rather than silently dropped, so the comparison
 * never implicitly favors the side that happened to verify.
 */
function renderComparison(findings: Finding[]): string {
  const deltas = findings.filter(
    (f) => f.kind === "comparison_delta" && f.visibility !== "internal"
  );
  if (deltas.length === 0) return "None flagged as a user-facing comparison.";
  const groups = new Map<string, Finding[]>();
  for (const f of deltas) {
    const key = f.compareGroup ?? f.requirementId ?? f.findingId;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const lines: string[] = [];
  for (const [group, members] of groups) {
    const sideA = members.find((m) => m.compareRole === "side_a");
    const sideB = members.find((m) => m.compareRole === "side_b");
    lines.push(`Dimension: ${group.replace(/^compare_/, "").replace(/_/g, " ")}`);
    lines.push(`- Side A: ${sideA ? sideA.claim : "(not independently established)"}`);
    lines.push(`- Side B: ${sideB ? sideB.claim : "(not independently established)"}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function depthGuidance(depth: ReportSpec["depth"]): string {
  switch (depth) {
    case "narrow":
      return "Depth = narrow: concise scope framing and a direct conclusion; fold essential evidence into the conclusion rather than lengthy analysis sections.";
    case "deep":
      return "Depth = deep: thorough analysis sections with evidence and rationale; qualifications, recommendations, and missing materials where relevant; conclusion synthesizes without repeating the full analysis.";
    case "standard":
    default:
      return "Depth = standard: balanced analysis with gap explanation where needed; conclusion states the bottom line after the reader has seen the key findings.";
  }
}

export const SYNTHESIS_SECTION_SYSTEM_PROMPT = [
  "You write one section of a legal analysis report.",
  "Output only that section: a `##` heading (verbatim as supplied) and its body.",
  "Do not write other sections, a title page, or a closing offer to help.",
  "Do not expose internal requirement IDs, work-unit IDs, package IDs, or finding IDs unless the user asked for them.",
  "Treat supplied statuses as given. Do not silently reverse them. Do not change compliance, invent a gap, invent evidence, or add a recommendation.",
  "Status cells: Strong, Present & adequate, Present, particulars in schedule, Minor drafting gap, Gap, Cannot determine, Not applicable. Never print internal tokens in the Status column.",
  "A binding schedule incorporation is Present, particulars in schedule (Obtain). A floating pointer is Cannot determine (Obtain), not Minor drafting gap and not Amend.",
  "cannot_determine is not a legal gap. Never recommend amending the agreement from cannot_determine, insufficient evidence, truncated quotes, or unavailable annexes — use Obtain / Confirm / re-read.",
  "Use Amend only for gap or partial when the cited quote is complete and the defect is in this instrument.",
  "If ANALYTICAL SYNTHESIS is supplied, use it for interpretation. Do not contradict its fact rollup or the locked row labels.",
  "Answer what the user asked. Write 3–4 short paragraphs of professional prose.",
  "Do not emit markdown tables unless STRUCTURED INVENTORIES already include a matrix artifact the user asked for.",
  "Do not pad with stock memo boilerplate that does not advance their question.",
  "Finish the section completely — never stop mid-sentence or mid-table cell.",
  LEGAL_MEMO_MARKDOWN_CRAFT,
].join("\n");

export function isTabularAnswerStyle(state: AnalysisState): boolean {
  if (state.request.answerStyle === "tabular") return true;
  if (state.intent?.outputForm === "table") return true;
  if (state.plan?.outputForm === "table") return true;
  return false;
}

export function wantsMatrixTable(state: AnalysisState): boolean {
  if (isTabularAnswerStyle(state)) return true;
  const text = `${state.request.instruction ?? ""} ${state.intent?.outputForm ?? ""}`;
  return /\b(rights\s+matrix|as\s+a\s+(?:rights\s+)?matrix|matrix\s+of\s+rights|as(?:\s+a)?\s+table|in\s+a\s+table)\b/i.test(
    text
  );
}

export function synthesisSectionSystemPrompt(state: AnalysisState): string {
  if (!isTabularAnswerStyle(state)) return SYNTHESIS_SECTION_SYSTEM_PROMPT;
  return [
    "You write one section of a legal analysis report in tabular form.",
    "Output only that section: a `##` heading (verbatim as supplied) and its body.",
    "Do not write other sections, a title page, or a closing offer to help.",
    "Do not expose internal requirement IDs, work-unit IDs, package IDs, or finding IDs unless the user asked for them.",
    "Treat supplied statuses as given. Do not silently reverse them.",
    "Do not emit a markdown findings table. The renderer attaches the locked Requirement | Status | Evidence | Finding table.",
    "A floating schedule pointer is Cannot determine (Obtain), not Minor drafting gap.",
    "cannot_determine is not a legal gap. Never recommend amending the agreement from cannot_determine, insufficient evidence, or truncated quotes — use Obtain / Confirm / re-read.",
    "Use Amend only for gap or partial when the cited quote is complete.",
    "Answer what the user asked. One lead sentence of framing prose; do not invent Status/Evidence/Finding cells.",
    "Finish the section completely — never stop mid-sentence.",
    TABULAR_SECTION_MARKDOWN_CRAFT,
  ].join("\n");
}
export function assessmentsForOutlineItem(
  item: ReportOutlineItem,
  assessments: RequirementAssessment[]
): RequirementAssessment[] {
  const sectionId = outlineItemSectionId(item);
  if (item.requirementIds.length > 0) {
    const wanted = new Set(item.requirementIds);
    return assessments.filter((a) => wanted.has(a.requirementId));
  }
  if (isOpeningSectionId(sectionId) || sectionId === "conclusion") return assessments;
  if (sectionId === "evidence") return assessments;
  if (sectionId === "material_gaps" || sectionId === "recommendations") {
    return assessments.filter((a) => isMaterialIssueStatus(a.status));
  }
  if (sectionId === "missing_materials" || isCaveatSectionId(sectionId)) {
    return assessments.filter((a) => a.status === "cannot_determine");
  }
  if (sectionId === "risk_summary") return [];
  return assessments;
}

export function buildSectionSynthesisUserPrompt(input: {
  state: AnalysisState;
  findings: Finding[];
  assessments: RequirementAssessment[];
  reportSpec: ReportSpec;
  item: ReportOutlineItem;
}): string {
  const { state, findings, assessments, reportSpec, item } = input;
  const sectionId = outlineItemSectionId(item);
  const def = REPORT_SECTION_DEFINITIONS[sectionId];
  const slicedAssessments = assessmentsForOutlineItem(item, assessments);
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  const supportingIds = new Set(
    slicedAssessments.flatMap((a) => a.supportingFindingIds)
  );
  const slicedFindings = findings.filter(
    (f) =>
      supportingIds.has(f.findingId) ||
      (f.requirementId && slicedAssessments.some((a) => a.requirementId === f.requirementId))
  );
  const groups = groupAssessmentsForReport(slicedAssessments);
  const artifactFilter = item.artifactTypes ?? [];
  const artifacts =
    artifactFilter.length > 0
      ? Object.fromEntries(
          Object.entries(state.analysisArtifacts ?? {}).filter(([, artifact]) =>
            artifactFilter.includes(artifact.type)
          )
        )
      : {};
  const artifactState = { ...state, analysisArtifacts: artifacts } as AnalysisState;
  // Risk lane surfaces the risk material into the sections that must speak to
  // it: the direct-answer/lead, the recommendations ("what to negotiate"), and
  // the bottom line — not only a dedicated risk_summary section.
  const isRiskLane = state.intent?.operation === "risk_flag";
  const includeRisks =
    sectionId === "risk_summary" ||
    (isRiskLane &&
      (isOpeningSectionId(sectionId) ||
        sectionId === "conclusion" ||
        sectionId === "recommendations"));
  // Compare lane surfaces the paired comparison into the same section shape
  // risk_flag uses: the direct-answer/lead, the dedicated comparison section,
  // recommendations, and the bottom line.
  const isCompareLane = state.intent?.operation === "compare";
  const includeComparison =
    sectionId === "comparison" ||
    (isCompareLane &&
      (isOpeningSectionId(sectionId) ||
        sectionId === "conclusion" ||
        sectionId === "recommendations"));
  const tabular = isTabularAnswerStyle(state);
  const isAnalysis =
    isAnalysisSectionId(sectionId) ||
    item.role === "analysis" ||
    item.role === "chapeau_particulars" ||
    item.role === "requirements_matrix" ||
    item.role === "key_findings" ||
    sectionId === "material_gaps";
  const compactStatuses =
    isOpeningSectionId(sectionId) || sectionId === "conclusion"
      ? slicedAssessments
          .map((a) => `- ${displayRequirementStatus(a)}: ${a.summary}`)
          .join("\n") || "(none)"
      : "";
  const synthesis = state.analyticalSynthesis;
  const analyticalBlock = synthesis
    ? [
        "ANALYTICAL SYNTHESIS (interpret; do not change locked statuses)",
        `Fact rollup:\n${synthesis.factRollup}`,
        `Overall: ${synthesis.overallAssessment}`,
        synthesis.substantiveVsDrafting
          ? `Substantive vs drafting: ${synthesis.substantiveVsDrafting}`
          : "",
        synthesis.residualUncertainty
          ? `Residual uncertainty: ${synthesis.residualUncertainty}`
          : "",
        synthesis.keyThemes.length
          ? `Themes:\n${synthesis.keyThemes
              .map((theme) => `- ${theme.title}: ${theme.analysis}`)
              .join("\n")}`
          : "",
        "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return [
    "USER REQUEST",
    state.request.instruction.slice(0, 800),
    "",
    "ANSWER STYLE",
    tabular
      ? "tabular — one lead sentence only; do not emit a findings table (the renderer attaches the locked table); no paragraph restatements of rows"
      : "narrative — 3–4 short paragraphs; no markdown tables unless STRUCTURED INVENTORIES already contain a user-requested matrix artifact; cite evidence inline as [E1]",
    "",
    "THIS SECTION ONLY",
    `Heading (use verbatim as ##): ${item.heading}`,
    `Role: ${def?.role ?? item.role}`,
    `Depth: ${reportSpec.depth}`,
    depthGuidance(reportSpec.depth),
    "Serve the user's request above. Do not invent unrelated stock sections or repeat the same gap story already covered elsewhere.",
    "Complete every sentence and every table cell. Do not truncate mid-thought.",
    "",
    "LEGAL FRAMEWORK",
    legalFramework(state),
    "",
    compactStatuses
      ? ["ASSESSMENT STATUSES (compact)", compactStatuses, ""].join("\n")
      : "",
    analyticalBlock,
    tabular && isAnalysis
      ? [
          "TABLE CONTRACT FOR THIS SECTION",
          "Write at most one lead sentence. Do not emit a markdown findings table.",
          "The renderer will attach the locked Requirement | Status | Evidence | Finding table from validated assessments.",
          "",
        ].join("\n")
      : sectionId === "requirements_matrix" && !tabular
        ? "NARRATIVE CONTRACT: numbered list of rights/obligations with status and a short evidence cite. No markdown table."
        : "",
    "MATERIALS FOR THIS SECTION",
    groups.length > 0
      ? renderThemeGroups(groups, findingById)
      : "(no requirement assessments mapped to this section)",
    "",
    "CROSS-REFERENCES",
    renderCrossReferences(state, slicedFindings, slicedAssessments),
    "",
    artifactFilter.length > 0 ? "STRUCTURED INVENTORIES" : "",
    artifactFilter.length > 0 ? renderArtifacts(artifactState) : "",
    includeRisks ? "MATERIAL RISKS" : "",
    includeRisks ? renderRisks(findings) : "",
    includeComparison ? "COMPARISON MATERIAL (side A vs side B, grouped by dimension)" : "",
    includeComparison ? renderComparison(findings) : "",
    "",
    "Write only this section. Start with `## " + item.heading + "`.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
