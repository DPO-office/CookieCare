import type { ReportDepth, ReportSectionId, ReportType } from "../models/intent.js";

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
    headingPatterns: [/\bscope\b/i, /\breview scope\b/i, /\bdocuments reviewed\b/i],
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
    suggestedHeading: "Chapeau particulars",
    role:
      "Assess the Article 28(3) chapeau particulars: subject matter, duration, nature and purpose, data categories, data subjects, and controller obligations.",
    headingPatterns: [/\bchapeau particulars\b/i, /\bprocessing particulars\b/i],
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
  qualifications: {
    id: "qualifications",
    suggestedHeading: "Qualifications",
    role:
      "Caveats that materially affect reliance on the analysis: annex/SOW dependencies, incomplete extraction, cross-references, and limits of the supplied materials.",
    headingPatterns: [/\bqualifications\b/i, /\bcaveats\b/i, /\blimitations\b/i],
  },
  recommendations: {
    id: "recommendations",
    suggestedHeading: "Recommendations",
    role:
      "Prioritized, actionable next steps tied to identified gaps. Each recommendation must follow from a finding above.",
    headingPatterns: [/\brecommendations\b/i],
  },
  missing_materials: {
    id: "missing_materials",
    suggestedHeading: "Missing materials",
    role:
      "Documents or annexes referenced in the agreement but not supplied for review, when their absence limits verification.",
    headingPatterns: [/\bmissing materials\b/i, /\bdocuments not provided\b/i],
  },
};

/** Expand deprecated combined section for downstream validators. */
export function normalizeReportSections(sections: ReportSectionId[]): ReportSectionId[] {
  const out: ReportSectionId[] = [];
  for (const section of sections) {
    if (section === "scope_and_conclusion") {
      out.push("scope", "conclusion");
      continue;
    }
    out.push(section);
  }
  return out;
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

  const hasScope = normalized.includes("scope");
  const hasConclusion = normalized.includes("conclusion");
  const hasAnalysis = normalized.some((id) =>
    ["requirements_detail", "chapeau_particulars"].includes(id)
  );

  const arc: string[] = [
    "SECTION ARCHITECTURE",
    "Each numbered item is a distinct rhetorical role. Use the suggested heading or a clear natural equivalent.",
    "Never merge roles: scope frames the review; analysis sections carry evidence and reasoning; conclusion synthesizes at the end.",
  ];

  if (hasScope && hasConclusion && hasAnalysis) {
    arc.push(
      "For this report: open with scope only, build the case in the analysis sections, then end with the bottom-line conclusion."
    );
  } else if (hasConclusion && !hasAnalysis) {
    arc.push(
      "For this brief report: keep scope minimal if present, and let the conclusion carry the direct answer with only essential supporting detail."
    );
  }

  return [...arc, "", ...lines].join("\n");
}

/** Narrative arc hint based on report shape — lets the LLM adapt tone without hard-coded templates. */
export function narrativeArcGuidance(
  reportType: ReportType,
  depth: ReportDepth,
  sections: ReportSectionId[]
): string {
  const normalized = normalizeReportSections(sections);
  const hasAnalysis = normalized.includes("requirements_detail");

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
      "Do not front-load the verdict in the scope section.",
      "Let the reader follow the analysis before the conclusion synthesizes the bottom line.",
    ].join(" ");
  }

  return "Write in the order declared. Match depth to the user's request without repeating the same point in multiple sections.";
}

export function reportOutputContainsSection(output: string, section: ReportSectionId): boolean {
  const normalized = output.replace(/\s+/g, " ").trim().toLowerCase();
  const def = REPORT_SECTION_DEFINITIONS[section];
  if (normalized.includes(def.suggestedHeading.toLowerCase())) return true;
  return def.headingPatterns.some((pattern) => pattern.test(output));
}

export function reportSectionPosition(output: string, section: ReportSectionId): number {
  const def = REPORT_SECTION_DEFINITIONS[section];
  const lower = output.toLowerCase();
  const preferred = lower.indexOf(def.suggestedHeading.toLowerCase());
  if (preferred >= 0) return preferred;
  let earliest = -1;
  for (const pattern of def.headingPatterns) {
    const match = output.match(pattern);
    if (match?.index !== undefined && (earliest < 0 || match.index < earliest)) {
      earliest = match.index;
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
