import type {
  ReportDepth,
  ReportOutlineItem,
  ReportSectionId,
  ReportSectionRole,
  ReportType,
} from "../models/intent.js";
import { LEGAL_MEMO_MARKDOWN_CRAFT } from "./memo-markdown-craft.js";

/** Semantic role of each report section — guides the synthesis LLM, not a fixed template. */
export interface ReportSectionDefinition {
  id: ReportSectionId;
  /** Preferred markdown heading; the writer may use a natural equivalent. */
  suggestedHeading: string;
  /** What this section must accomplish rhetorically. */
  role: string;
  /** Alternate heading phrases that still satisfy critique when the writer adapts wording. */
  headingPatterns: RegExp[];
}

export const REPORT_SECTION_DEFINITIONS: Record<ReportSectionId, ReportSectionDefinition> = {
  scope: {
    id: "scope",
    suggestedHeading: "Scope",
    role:
      "Frame the review: what the user asked, which document(s) were reviewed, the legal framework, and material limits on what was in scope. Do not state the overall compliance verdict or bottom line here.",
    headingPatterns: [
      /\bscope\b/i,
      /\breview scope\b/i,
      /\bdocuments reviewed\b/i,
      /\bexecutive summary\b/i,
    ],
  },
  executive_summary: {
    id: "executive_summary",
    suggestedHeading: "Executive Summary",
    role:
      "Frame the review: what the user asked, which document(s) were reviewed, the legal framework, and material limits on what was in scope. Do not state the overall compliance verdict or bottom line here.",
    headingPatterns: [
      /\bexecutive summary\b/i,
      /\bscope\b/i,
      /\breview scope\b/i,
      /\bdocuments reviewed\b/i,
    ],
  },
  conclusion: {
    id: "conclusion",
    suggestedHeading: "Conclusion",
    role:
      "Synthesize the bottom line after the analysis: overall compliance position, the most material gaps, and whether verification was limited. Be concise. Do not introduce new findings or repeat the full analysis.",
    headingPatterns: [
      /\bconclusion\b/i,
      /\bbottom line\b/i,
      /\boverall (assessment|position|finding)\b/i,
      /\bsummary conclusion\b/i,
      /^##\s+answer\b/im,
    ],
  },
  scope_and_conclusion: {
    id: "scope_and_conclusion",
    suggestedHeading: "Scope and conclusion",
    role:
      "Legacy combined section. When separate Scope and Conclusion sections are requested, never merge them.",
    headingPatterns: [/\bscope and conclusion\b/i],
  },
  chapeau_particulars: {
    id: "chapeau_particulars",
    suggestedHeading: "Processing particulars",
    role:
      "Assess processing particulars: subject matter, duration, nature and purpose, data categories, data subjects, and controller obligations.",
    headingPatterns: [/\bchapeau particulars\b/i, /\bprocessing particulars\b/i],
  },
  requirements_matrix: {
    id: "requirements_matrix",
    suggestedHeading: "Requirements matrix",
    role:
      "Present the mapped requirements as statuses with cited evidence. In narrative mode use a compact numbered list; in tabular mode use one markdown table. Do not write a second narrative of the same points later.",
    headingPatterns: [/\brequirements matrix\b/i, /\bmatrix\b/i],
  },
  key_findings: {
    id: "key_findings",
    suggestedHeading: "Key findings",
    role:
      "The substantive analysis: key provisions or findings grounded in the assessments. This is where evidence and legal reasoning live.",
    headingPatterns: [
      /\bkey findings\b/i,
      /\bkey provisions\b/i,
      /\brequirements\b/i,
      /\bfinding/i,
    ],
  },
  requirements_detail: {
    id: "requirements_detail",
    suggestedHeading: "Requirements detail",
    role:
      "The substantive analysis: requirement-by-requirement or theme-by-theme findings grounded in the assessments. This is where evidence and legal reasoning live.",
    headingPatterns: [
      /\brequirements detail\b/i,
      /\bdetailed analysis\b/i,
      /\bfinding/i,
      /\bassessment\b/i,
    ],
  },
  material_gaps: {
    id: "material_gaps",
    suggestedHeading: "Material gaps",
    role:
      "Only the positive gaps: missing or partial obligations in the reviewed text. Do not restate cannot_determine items as legal gaps.",
    headingPatterns: [/\bmaterial (gaps|issues)\b/i, /\bgaps\b/i],
  },
  risk_summary: {
    id: "risk_summary",
    suggestedHeading: "Risk summary",
    role: "Summarize user-facing material risks only. Do not reprint the full analysis.",
    headingPatterns: [/\brisk summary\b/i, /\brisks?\b/i],
  },
  qualifications: {
    id: "qualifications",
    suggestedHeading: "Qualifications",
    role:
      "Caveats that materially affect reliance on the analysis: annex/SOW dependencies, incomplete extraction, cross-references, and limits of the supplied materials. Do not repeat skill/package coverage limitations already in the appendix.",
    headingPatterns: [/\bqualifications\b/i, /\bcaveats\b/i, /\blimitations\b/i],
  },
  limitations: {
    id: "limitations",
    suggestedHeading: "Limitations",
    role:
      "Caveats that materially affect reliance on the analysis: annex/SOW dependencies, incomplete extraction, cross-references, and limits of the supplied materials. Do not repeat skill/package coverage limitations already in the appendix.",
    headingPatterns: [/\blimitations\b/i, /\bqualifications\b/i, /\bcaveats\b/i],
  },
  recommendations: {
    id: "recommendations",
    suggestedHeading: "Recommendations",
    role:
      "Prioritized, actionable next steps tied to identified gaps. Each recommendation must follow from a finding above. Never recommend amending the agreement from cannot_determine or truncated evidence.",
    headingPatterns: [/\brecommendations\b/i],
  },
  missing_materials: {
    id: "missing_materials",
    suggestedHeading: "Missing materials",
    role:
      "Documents or annexes referenced in the agreement but not supplied for review, when their absence limits verification.",
    headingPatterns: [/\bmissing materials\b/i, /\bdocuments not provided\b/i],
  },
  evidence: {
    id: "evidence",
    suggestedHeading: "Evidence",
    role:
      "Cite the operative quotes that support the answer. Do not introduce new legal conclusions here.",
    headingPatterns: [/\bevidence\b/i],
  },
};

/** All known report section ids — derived from REPORT_SECTION_DEFINITIONS. */
export const ALL_REPORT_SECTION_IDS = Object.keys(
  REPORT_SECTION_DEFINITIONS
) as ReportSectionId[];

/**
 * Canonical user-facing section order. Conclusion is always last among report
 * roles (References / appendices may follow in rendered markdown).
 */
export const CANONICAL_REPORT_SECTION_ORDER: ReportSectionId[] = [
  "executive_summary",
  "scope",
  "evidence",
  "chapeau_particulars",
  "requirements_matrix",
  "key_findings",
  "requirements_detail",
  "material_gaps",
  "risk_summary",
  "limitations",
  "qualifications",
  "recommendations",
  "missing_materials",
  "conclusion",
];

const SECTION_RANK = new Map(
  CANONICAL_REPORT_SECTION_ORDER.map((id, index) => [id, index])
);

const OPENING_IDS: ReportSectionId[] = ["executive_summary", "scope"];
const CAVEAT_IDS: ReportSectionId[] = ["limitations", "qualifications"];
const ANALYSIS_IDS: ReportSectionId[] = [
  "chapeau_particulars",
  "requirements_matrix",
  "key_findings",
  "requirements_detail",
];

export function isOpeningSectionId(id: ReportSectionId): boolean {
  return OPENING_IDS.includes(id);
}

export function isCaveatSectionId(id: ReportSectionId): boolean {
  return CAVEAT_IDS.includes(id);
}

export function isAnalysisSectionId(id: ReportSectionId): boolean {
  return ANALYSIS_IDS.includes(id);
}

export function equivalentSectionIds(id: ReportSectionId): ReportSectionId[] {
  if (isOpeningSectionId(id)) return [...OPENING_IDS];
  if (isCaveatSectionId(id)) return [...CAVEAT_IDS];
  return [id];
}

export function collapseAliasSections(sections: ReportSectionId[]): ReportSectionId[] {
  const set = new Set(sections);
  if (set.has("executive_summary") && set.has("scope")) set.delete("scope");
  if (set.has("limitations") && set.has("qualifications")) set.delete("qualifications");
  return [...set];
}

/**
 * Expand deprecated combined section and enforce canonical order so Conclusion
 * never lands immediately after Scope when analysis sections follow.
 */
export function normalizeReportSections(sections: ReportSectionId[]): ReportSectionId[] {
  const expanded: ReportSectionId[] = [];
  for (const section of sections) {
    if (section === "scope_and_conclusion") {
      expanded.push("scope", "conclusion");
      continue;
    }
    expanded.push(section);
  }
  const unique = collapseAliasSections(
    [...new Set(expanded)].filter((id) => id !== "scope_and_conclusion")
  );
  return unique.sort((a, b) => (SECTION_RANK.get(a) ?? 99) - (SECTION_RANK.get(b) ?? 99));
}

export function sectionDefinition(section: ReportSectionId): ReportSectionDefinition {
  return REPORT_SECTION_DEFINITIONS[section];
}

export function suggestedHeading(section: ReportSectionId): string {
  return REPORT_SECTION_DEFINITIONS[section].suggestedHeading;
}

/** LLM-facing block: section order + rhetorical roles (not a content template). */
export function buildSectionGuidanceBlock(sections: ReportSectionId[]): string {
  const normalized = normalizeReportSections(sections);
  const lines = normalized.map((id, index) => {
    const def = REPORT_SECTION_DEFINITIONS[id];
    return [
      `${index + 1}. ${def.suggestedHeading} (section role — adapt heading wording to the user's request if natural)`,
      `   Role: ${def.role}`,
    ].join("\n");
  });

  const hasScope = normalized.some((id) => isOpeningSectionId(id));
  const hasConclusion = normalized.includes("conclusion");
  const hasAnalysis = normalized.some((id) => isAnalysisSectionId(id));

  const arc: string[] = [
    "SECTION ARCHITECTURE",
    "Each numbered item is a distinct rhetorical role. Use the suggested heading or a clear natural equivalent.",
    "Never merge roles: scope frames the review; analysis sections carry evidence and reasoning; conclusion synthesizes at the end.",
    "HARD ORDERING RULE (applies to every user ask and every document type): if a Conclusion / Bottom Line section is included, it must be the last substantive report section — after analysis, qualifications, recommendations, and missing materials. Only References may follow it.",
  ];

  if (hasScope && hasConclusion && hasAnalysis) {
    arc.push(
      "For this report: open with scope only, build the case in the analysis sections, then end with the bottom-line conclusion."
    );
  } else if (hasConclusion && !hasAnalysis) {
    arc.push(
      "For this brief report: keep scope minimal if present, and place the conclusion after any framing — never before remaining analysis sections if they are present."
    );
  } else if (hasConclusion) {
    arc.push("Place the Conclusion section last among the report sections listed below.");
  }

  return [...arc, "", LEGAL_MEMO_MARKDOWN_CRAFT, "", ...lines].join("\n");
}

/** Narrative arc hint based on report shape — lets the LLM adapt tone without hard-coded templates. */
export function narrativeArcGuidance(
  reportType: ReportType,
  depth: ReportDepth,
  sections: ReportSectionId[]
): string {
  const normalized = normalizeReportSections(sections);
  const hasAnalysis = normalized.some((id) => isAnalysisSectionId(id));

  if (reportType === "qa_answer") {
    return hasAnalysis
      ? "Answer the user's question directly. Use scope to frame what you reviewed, then give the answer."
      : "Answer the user's question directly and concisely in the conclusion section.";
  }

  if (depth === "narrow" || !hasAnalysis) {
    return "Keep the report concise. Scope frames the ask; the conclusion states the answer with only the most material supporting points inline.";
  }

  if (reportType === "regime_compliance_memo" || reportType === "risk_audit") {
    return [
      "Form the overall legal position from the assessments before writing.",
      "Do not front-load the verdict in the opening section.",
      "Let the reader follow the analysis before the conclusion synthesizes the bottom line.",
    ].join(" ");
  }

  return "Write in the declared section order. If a Conclusion section is included, place it last among substantive sections (only References may follow), for any user ask or document type.";
}

export function reportOutputContainsSection(output: string, section: ReportSectionId): boolean {
  const ids = equivalentSectionIds(section);
  return ids.some((id) => {
    const def = REPORT_SECTION_DEFINITIONS[id];
    if (!def) return false;
    const normalized = output.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes(def.suggestedHeading.toLowerCase())) return true;
    return def.headingPatterns.some((pattern) => pattern.test(output));
  });
}

export function reportSectionPosition(output: string, section: ReportSectionId): number {
  let earliest = -1;
  for (const id of equivalentSectionIds(section)) {
    const def = REPORT_SECTION_DEFINITIONS[id];
    if (!def) continue;
    const lower = output.toLowerCase();
    const preferred = lower.indexOf(def.suggestedHeading.toLowerCase());
    if (preferred >= 0 && (earliest < 0 || preferred < earliest)) earliest = preferred;
    for (const pattern of def.headingPatterns) {
      const match = output.match(pattern);
      if (match?.index !== undefined && (earliest < 0 || match.index < earliest)) {
        earliest = match.index;
      }
    }
  }
  return earliest;
}

export function reportSectionsInOrder(output: string, sections: ReportSectionId[]): boolean {
  const normalized = normalizeReportSections(sections);
  const positions = normalized
    .map((section) => reportSectionPosition(output, section))
    .filter((position) => position >= 0);
  return positions.every(
    (position, index) => index === 0 || position > positions[index - 1]!
  );
}

interface MarkdownH2Block {
  headingLine: string;
  body: string;
}

function isConclusionHeading(headingLine: string): boolean {
  // Match the section label itself — not incidental phrases inside analysis headings.
  const text = headingLine
    .replace(/^##\s+/, "")
    .replace(/^\d+[\.\)]\s*/, "")
    .trim();
  return /^(conclusion|bottom line|overall assessment|overall position|overall finding|summary conclusion)\.?$/i.test(
    text
  );
}

/** Sections that must remain after the bottom-line conclusion. */
function isPostConclusionTrailingHeading(headingLine: string): boolean {
  const text = headingLine
    .replace(/^##\s+/, "")
    .replace(/^\d+[\.\)]\s*/, "")
    .trim();
  return /^(references|coverage limitations)\.?$/i.test(text);
}

function splitMarkdownH2Blocks(markdown: string): {
  preamble: string;
  blocks: MarkdownH2Block[];
} {
  const lines = markdown.split("\n");
  const preamble: string[] = [];
  const blocks: MarkdownH2Block[] = [];
  let current: MarkdownH2Block | null = null;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) blocks.push(current);
      current = { headingLine: line, body: "" };
      continue;
    }
    if (current) {
      current.body += (current.body.length > 0 ? "\n" : "") + line;
    } else {
      preamble.push(line);
    }
  }
  if (current) blocks.push(current);

  return {
    preamble: preamble.join("\n"),
    blocks,
  };
}

function joinMarkdownH2Blocks(preamble: string, blocks: MarkdownH2Block[]): string {
  const parts: string[] = [];
  if (preamble.trim().length > 0) {
    parts.push(preamble.replace(/\n+$/, ""));
  }
  for (const block of blocks) {
    const body = block.body.replace(/\n+$/, "");
    parts.push(body.length > 0 ? `${block.headingLine}\n${body}` : block.headingLine);
  }
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Deterministic safety net for every user ask and document type: move any
 * Conclusion / Bottom Line ## section after analysis sections and immediately
 * before trailing appendix sections (Coverage limitations, References).
 * Prompt guidance alone is not enough — models often front-load the verdict.
 */
export function enforceConclusionSectionLast(markdown: string): string {
  if (!markdown.trim()) return markdown;
  const { preamble, blocks } = splitMarkdownH2Blocks(markdown);
  if (blocks.length === 0) return markdown;

  const conclusionBlocks = blocks.filter((block) => isConclusionHeading(block.headingLine));
  if (conclusionBlocks.length === 0) return markdown;

  const nonConclusion = blocks.filter((block) => !isConclusionHeading(block.headingLine));
  const insertAt = nonConclusion.findIndex((block) =>
    isPostConclusionTrailingHeading(block.headingLine)
  );
  const reordered =
    insertAt >= 0
      ? [
          ...nonConclusion.slice(0, insertAt),
          ...conclusionBlocks,
          ...nonConclusion.slice(insertAt),
        ]
      : [...nonConclusion, ...conclusionBlocks];

  // No-op when already correctly placed.
  if (
    reordered.length === blocks.length &&
    reordered.every(
      (block, index) =>
        block.headingLine === blocks[index]!.headingLine &&
        block.body === blocks[index]!.body
    )
  ) {
    return markdown;
  }

  return joinMarkdownH2Blocks(preamble, reordered);
}

export function roleForSectionId(id: ReportSectionId): ReportSectionRole {
  switch (id) {
    case "executive_summary":
      return "executive_summary";
    case "scope":
    case "scope_and_conclusion":
      return "scope";
    case "requirements_matrix":
      return "requirements_matrix";
    case "key_findings":
      return "key_findings";
    case "chapeau_particulars":
      return "chapeau_particulars";
    case "material_gaps":
      return "material_gaps";
    case "risk_summary":
      return "risk_summary";
    case "limitations":
      return "limitations";
    case "qualifications":
      return "qualifications";
    case "recommendations":
      return "recommendations";
    case "missing_materials":
      return "missing_materials";
    case "evidence":
      return "evidence";
    case "conclusion":
      return "conclusion";
    case "requirements_detail":
    default:
      return "analysis";
  }
}

export function sectionIdForRole(role: ReportSectionRole): ReportSectionId {
  switch (role) {
    case "executive_summary":
      return "executive_summary";
    case "scope":
      return "scope";
    case "requirements_matrix":
      return "requirements_matrix";
    case "key_findings":
      return "key_findings";
    case "chapeau_particulars":
      return "chapeau_particulars";
    case "material_gaps":
      return "material_gaps";
    case "risk_summary":
      return "risk_summary";
    case "limitations":
      return "limitations";
    case "qualifications":
      return "qualifications";
    case "recommendations":
      return "recommendations";
    case "missing_materials":
      return "missing_materials";
    case "evidence":
      return "evidence";
    case "conclusion":
      return "conclusion";
    case "analysis":
    default:
      return "key_findings";
  }
}

export function outlineItemSectionId(item: ReportOutlineItem): ReportSectionId {
  return item.sectionId ?? sectionIdForRole(item.role);
}

export const ANALYSIS_OUTLINE_ROLES: ReadonlySet<ReportSectionRole> = new Set([
  "analysis",
  "chapeau_particulars",
  "requirements_matrix",
  "key_findings",
]);

export function isAnalysisOutlineRole(role: ReportSectionRole): boolean {
  return ANALYSIS_OUTLINE_ROLES.has(role);
}
