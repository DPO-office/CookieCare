/**
 * Shared markdown formatting rules for counsel-facing analysis reports.
 * Used by synthesis, narrative polish, and section guidance — not a content template.
 */
export const LEGAL_MEMO_MARKDOWN_CRAFT = [
  "MARKDOWN CRAFT (professional legal memo — not casual chat)",
  "",
  "Structure:",
  "- Use `#` for the report title, `##` for major sections (Scope, Requirements detail, Qualifications, Recommendations, Conclusion), and `###` for individual issues or themes within analysis.",
  "- Prefer the suggested section headings from SECTION ARCHITECTURE when they fit the user's request.",
  "- Keep paragraphs short: lead with the conclusion for that point, then supporting evidence in 2–4 sentences before the next subheading.",
  "",
  "Selective bold (use sparingly — never bold entire paragraphs):",
  "- **Status words** when stating an assessment: Covered, Partial, Gap, Missing, Cannot determine, Not applicable.",
  "- **Obligation or theme names** at the start of an analysis subheading or lead sentence.",
  "- **Article or clause references** (e.g. **Article 28(3)(e)**) when they anchor a finding.",
  "- **Recommendation verbs** at the start of each recommendation bullet (e.g. **Amend**, **Confirm**, **Obtain**).",
  "",
  "Lists:",
  "- Use bullet lists for Recommendations and Missing materials only.",
  "- Keep the substantive analysis in prose under `###` subheadings, not long bullet dumps.",
  "- Status-led subheadings are encouraged: `### Data subject assistance — Partial`.",
  "",
  "Tables:",
  "- Use markdown tables only when they materially improve comparison (e.g. rights matrix, side-by-side statuses).",
  "",
  "Tone:",
  "- Senior legal or compliance analyst voice. No chatty closers (e.g. \"Let me know if you'd like…\").",
  "- Do not expose internal requirement IDs, package IDs, or work-unit IDs.",
  "- Preserve `[N]` citation markers and the References section when evidence quotes are cited.",
].join("\n");
