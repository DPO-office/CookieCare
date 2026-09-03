/**
 * Shared markdown formatting rules for counsel-facing analysis reports.
 * Used by synthesis, narrative polish, and section guidance — not a content template.
 */
export const LEGAL_MEMO_MARKDOWN_CRAFT = [
  "MARKDOWN CRAFT (professional legal memo — not casual chat)",
  "",
  "Structure:",
  "- Use `#` for the report title, `##` for major sections (Scope, Requirements detail, Qualifications, Recommendations, Missing materials, Conclusion), and `###` for individual issues or themes within analysis.",
  "- Prefer the suggested section headings from SECTION ARCHITECTURE when they fit the user's request.",
  "- Keep paragraphs short: lead with the conclusion for that point, then supporting evidence in 2–4 sentences before the next subheading.",
  "- Always place the report-level Conclusion section last among substantive sections (only References may follow), regardless of document type or user phrasing.",
  "",
  "Selective bold (use sparingly — never bold entire paragraphs):",
  "- **Status words** when stating an assessment: Strong, Present & adequate, Present, particulars in schedule, Minor drafting gap, Gap, Cannot determine, Insufficient data, Not applicable.",
  "- **Obligation or theme names** at the start of an analysis subheading or lead sentence.",
  "- **Article or clause references** (e.g. **Article 28(3)(e)**) when they anchor a finding.",
  "- **Recommendation verbs** at the start of each recommendation bullet (e.g. **Amend**, **Confirm**, **Obtain**).",
  "- Never use **Amend** for Cannot determine / insufficient / truncated evidence. Those bullets start with **Obtain** or **Confirm**.",
  "",
  "Lists:",
  "- Use bullet lists for Recommendations and Missing materials only.",
  "- Keep the substantive analysis in prose under `###` subheadings, not long bullet dumps.",
  "- Status-led subheadings are encouraged: `### Data subject assistance — Minor drafting gap`.",
  "",
  "Tables:",
  "- Do not emit markdown tables in narrative mode unless this section's MATERIALS already include a rights-matrix artifact the user asked for.",
  "- Prefer a compact numbered list for obligation statuses in prose.",
  "",
  "Tone:",
  "- Senior legal or compliance analyst voice. No chatty closers (e.g. \"Let me know if you'd like…\").",
  "- Do not expose internal requirement IDs, package IDs, or work-unit IDs.",
  "- Preserve `[N]` citation markers and the References section when evidence quotes are cited.",
].join("\n");

/**
 * When the user asked for tabular output: analysis is tables-first, not essay-first.
 * Framing prose is allowed; the substance of findings must live in markdown tables.
 */
export const TABULAR_SECTION_MARKDOWN_CRAFT = [
  "MARKDOWN CRAFT (tabular answer — not a long memo essay)",
  "",
  "Structure:",
  "- Start with the supplied `##` heading.",
  "- Write at most one lead sentence. Do not emit a markdown findings table.",
  "- The renderer will attach the locked Requirement | Status | Evidence | Finding table from validated assessments. Do not invent Status, Evidence, or Finding cells.",
  "- Opening / conclusion / recommendations: short prose. Do not invent status tables.",
  "- Do not write Key Regulatory Findings, Summary of Compliance Findings, or any paragraph block that restates table rows.",
  "- Finish every sentence. Never stop mid-clause.",
  "",
  "Status words (bold sparingly, in prose only): Strong, Present & adequate, Present, particulars in schedule, Minor drafting gap, Gap, Cannot determine, Insufficient data, Not applicable.",
  "Recommendation verbs: **Amend** only for missing/partial with complete quotes; otherwise **Obtain** / **Confirm**.",
  "Do not expose internal requirement IDs, package IDs, or work-unit IDs.",
].join("\n");
