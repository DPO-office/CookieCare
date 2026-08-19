import type { AnalysisState } from "../models/analysis-state.js";
import type { Finding } from "../models/finding.js";
import type { ReportSectionId, ReportSpec } from "../models/intent.js";
import { conversationContextForIntent } from "../memory/conversation-window.js";
import type { RequirementAssessment } from "../models/requirement-assessment.js";
import {
  groupAssessmentsForReport,
  humanizeRequirementId,
} from "../capabilities/act/group-assessments.js";
import {
  REPORT_SECTION_DEFINITIONS,
  buildSectionGuidanceBlock,
  narrativeArcGuidance,
  normalizeReportSections,
  suggestedHeading,
} from "./report-sections.js";

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
  "Treat the supplied statuses as given. Explain them; do not silently reverse them.",
  "Interpret statuses as follows:",
  "- covered: the obligation is present in the reviewed materials with enough substance to support the conclusion.",
  "- partial: some required elements are present and others are incomplete, weak, or qualified.",
  "- missing: a positive gap in the reviewed text of a provision that was expected to contain the obligation.",
  "- cannot_determine: the reviewed materials do not let you verify the point — including incomplete extraction, or substance that lives in an annex, schedule, SOW, appendix, policy, or other document not supplied.",
  "- not_applicable: outside the scope of this agreement or request.",
  "",
  "Absence from the extracted evidence is not, by itself, proof that the obligation is missing from the agreement.",
  "If the document points to an annex, schedule, SOW, appendix, incorporated policy, or another agreement, say that compliance cannot be fully verified from the supplied materials. Do not treat the unavailability of that material as proof the obligation is absent.",
  "Distinguish whether an obligation exists from whether its adequacy can be verified.",
  "",
  "Do not overstate. Prefer \"not identified in the reviewed materials\" over \"the agreement does not contain…\" unless the relevant agreement or section was actually reviewed in full.",
  "Never turn incomplete evidence into a categorical legal conclusion.",
  "",
  "Each report section has a distinct rhetorical role (see SECTION ARCHITECTURE in the user brief).",
  "Respect the declared section order. Adapt heading wording to the user's request when natural, but never merge scope with conclusion or state the overall verdict in the scope section.",
  "When analysis sections precede a conclusion, build the case first and synthesize the bottom line only in the conclusion section.",
  "Highlight contradictions, qualifications, and cross-references that materially affect the conclusion.",
  "Recommendations must follow from identified gaps. Do not invent generic checklists or advise whether to sign or litigate.",
  "Introduce no new claim, right, timeframe, or citation that is not in the supplied assessments, findings, or evidence.",
    "Use only the requested sections, in order, and omit any that would be empty.",
  "The report should read like work from a senior legal or compliance analyst.",
  "",
  "If OUTPUT FORM is tabular, write the analysis as markdown tables with a short prose bottom line. Do not write long narrative sections.",
  "If OUTPUT FORM is narrative, write flowing prose. Use tables only when they materially help.",
  "If DOCUMENT PRESENTATION is individual, write a clearly separated section for each named document. Do not blend documents into one undivided report.",
  "If DOCUMENT PRESENTATION is unified and multiple documents were reviewed, write one combined report and name the documents in the scope section.",
  "If PRIOR CONVERSATION is supplied, answer the current user message in that context. Do not reprint the entire prior report unless the user asked to rewrite it.",
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

  const presentation =
    state.intent?.documentPresentation ??
    state.request.documentPresentation ??
    "unified";
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
    "DOCUMENT PRESENTATION",
    presentation === "individual"
      ? "individual — a separate headed section per uploaded document"
      : "unified — one combined report covering all target documents",
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
    "Write one user-facing section per THEME GROUP below. Internal members of a group are the same legal question; synthesize them into one assessment.",
    "",
    "THEME GROUPS",
    renderThemeGroups(groups, findingById),
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
          `  - ${humanizeRequirementId(member.requirementId)} [${member.status}] ${member.summary}`,
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
        `Combined status: ${group.status}`,
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
  const partial = assessments.filter((a) => a.status === "partial");
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
      if (artifact.type === "transfer_inventory" && data.transfers) {
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
  return risks.map((f) => `- ${f.claim} (severity: ${f.severity ?? "n/a"})`).join("\n");
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
