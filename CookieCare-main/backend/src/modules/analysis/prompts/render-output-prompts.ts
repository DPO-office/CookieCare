import { LEGAL_MEMO_MARKDOWN_CRAFT } from "./memo-markdown-craft.js";

export const BOTTOM_LINE_SYSTEM_PROMPT =
  "Write polished senior-associate legal-memo prose from verified findings. Synthesize meaningfully, but introduce no new claim — reorganize and rephrase only.";

export const NARRATIVE_REPORT_SYSTEM_PROMPT = [
  "You are a senior-associate document-analysis writer. Produce cohesive legal-memo prose, not a raw finding dump.",
  "Stay faithful to the supplied findings; no new claims. Never advise whether to sign or litigate.",
  "",
  "Use markdown headings and short paragraphs. You may bold the overall verdict phrase once in the opening bottom-line sentence (e.g. **Partial compliance**).",
  "Use bullets only where they materially improve readability (recommendations, missing materials).",
].join("\n");

export const NARRATIVE_REPORT_SYSTEM_PROMPT_WITH_CRAFT = [
  NARRATIVE_REPORT_SYSTEM_PROMPT,
  "",
  LEGAL_MEMO_MARKDOWN_CRAFT,
].join("\n");

export function buildBottomLineUserPrompt(sections: string): string {
  return [
    "Write one short bottom-line paragraph in the voice of a senior associate advising a controller-side lawyer.",
    "Synthesize related findings into flowing prose with clear connective reasoning; never bullet-dump or mechanically repeat findings.",
    "Collapse overlapping requirements into one conclusion. Do not list internal requirement names as if they were separate legal tests.",
    "Reorganize and rephrase ONLY claims already present in the structured sections below.",
    "Do not invent rights, timeframes, citations, or any new claim not traceable to a listed finding.",
    "Do not advise whether to sign or litigate.",
    "Prefer \"not identified in the reviewed materials\" over \"the agreement does not contain…\" unless the relevant section was reviewed in full.",
    "EVIDENCE COMPLETENESS IS BINDING: if any structured row is Cannot determine, Insufficient data, or Present with particulars in a referenced schedule/annex/SOW, the bottom line must state that limitation and must not say the review is complete, fully documented/verified/compliant, has no residual items, or is ready to finalize.",
    "",
    sections,
  ].join("\n");
}

export function buildNarrativeReportUserPrompt(
  structured: string,
  schemaId: string
): string {
  const form = schemaId === "qa_thread" ? "Q&A answer" : "legal analysis memo";
  return [
    `Write a professional ${form} from the verified findings below.`,
    "Write in the voice of a senior associate. Synthesize related findings into flowing paragraphs grouped by theme; never bullet-dump raw findings.",
    "Internal requirement labels are analysis scaffolding, not report headings. Collapse duplicates and overlapping tests into one user-facing assessment.",
    "Reorganize and rephrase only. Do not invent clauses, parties, risks, or claims not listed.",
    "Keep Tier B / Tier P / Tier C sections visually separate — never blend into one compliance table.",
    "Preserve every supplied [N] citation marker and the References section. Cite quoted evidence where provided.",
    "Use markdown headings and paragraphs; use bullets only where they materially improve readability.",
    "Lead with a bottom line. Recommendations must follow from identified gaps, not generic checklists.",
    "Do not advise whether to sign or litigate.",
    "",
    structured,
  ].join("\n");
}
