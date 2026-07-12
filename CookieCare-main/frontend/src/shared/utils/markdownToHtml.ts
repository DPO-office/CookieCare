/**
 * Shared Markdown → HTML conversion utility.
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
  breaks: false,     // Respect blank lines for paragraphs (GFM-style single \n → <br> is off)
});

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
  return md.render(cleaned);
}
