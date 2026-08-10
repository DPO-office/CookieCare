/**
 * Shared Markdown · HTML conversion utility.
 *
 * Uses markdown-it (already a project dependency) to parse Markdown and
 * produce clean HTML ready for insertion into TipTap or any HTML consumer.
 *
 * Reuse this wherever Markdown needs to be rendered — do NOT duplicate the
 * parsing logic.
 */
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,       // Do not pass raw HTML through — keep it safe
  linkify: true,     // Auto-convert URLs to links
  typographer: true, // Smart quotes, dashes, etc.
  breaks: false,     // Respect blank lines for paragraphs (GFM-style single \n · <br> is off)
});

// Legal documents rely on literal "(c)", "(r)", "(tm)" as subsection letters and
// abbreviations. markdown-it's `replacements` rule (part of typographer) rewrites
// "(c)" -> "©", "(tm)" -> "™", etc., which corrupts clause numbering like "(c)".
// Disable only that rule; keep smart quotes (`smartquotes`) intact.
md.disable(["replacements"]);

/**
 * Strips Markdown code fences that wrap the entire response.
 *
 * The LLM sometimes wraps the entire document in:
 *   ```markdown
 *   ... content ...
 *   ```
 * or just:
 *   ```
 *   ... content ...
 *   ```
 *
 * Strip those outer wrappers before parsing so they never appear in the output.
 */
function stripOuterCodeFences(raw: string): string {
  const trimmed = raw.trim();
  // Match an optional language specifier after the opening fence
  const fenceMatch = trimmed.match(/^```[a-z]*\n([\s\S]*?)```\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/** Matches a leading row-number header such as "#", "No.", "S. No." */
const INDEX_HEADER = /^(#|no\.?|s\.?\s*no\.?|sr\.?\s*no\.?)$/i;

/**
 * Wrap markdown-it tables so wide analysis reports can scroll horizontally
 * instead of crushing every column into a few characters.
 *
 * Tables whose first column is a row counter get `md-table-indexed` so the
 * stylesheet can narrow that column. Without the flag every table would be
 * narrowed, which squeezes text first columns like "Clause / Protection".
 */
function wrapTables(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const firstHeader = table
      .match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1]
      .replace(/<[^>]*>/g, "")
      .trim();
    const indexed = firstHeader !== undefined && INDEX_HEADER.test(firstHeader);
    const className = indexed ? "md-table-wrap md-table-indexed" : "md-table-wrap";
    return `<div class="${className}">${table}</div>`;
  });
}

/**
 * Converts a Markdown string into an HTML string suitable for TipTap's
 * `setContent()` or `normalizeHtml()`.
 *
 * @param markdown - Raw Markdown text from the LLM
 * @returns Rendered HTML string
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return "<p></p>";
  }
  const cleaned = stripOuterCodeFences(markdown);
  return wrapTables(md.render(cleaned));
}
