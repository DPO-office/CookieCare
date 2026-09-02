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
 * Status keyword → CSS colour variant mapping.
 *
 * The patterns below are matched case-insensitively against the full trimmed
 * text content of a table cell.  Order matters — more-specific phrases must
 * come before shorter ones (e.g. "substantially compliant" before "compliant").
 */
const STATUS_PATTERNS: Array<{ pattern: RegExp; variant: string }> = [
  // ── Green ──────────────────────────────────────────────────────────────
  { pattern: /\bsubstantially\s+(adequate|compliant)\b/i,   variant: "green" },
  { pattern: /\bpresent\s+[&and]+\s+adequate\b/i,           variant: "green" },
  { pattern: /\badequate[,\s]+subject\b/i,                  variant: "green" },
  { pattern: /\b(fully\s+)?compliant\b/i,                   variant: "green" },
  { pattern: /\bpresent\s+&\s+adequate\b/i,                 variant: "green" },
  { pattern: /\b(strong|adequate|sufficient|satisf|met)\b/i, variant: "green" },

  // ── Yellow — conditional / partial ─────────────────────────────────────
  { pattern: /\bconditionally\s+(compliant|adequate)\b/i,   variant: "yellow" },
  { pattern: /\bpartially?\s+adequate\b/i,                  variant: "yellow" },
  { pattern: /\bminor\s+(gap|drafting)\b/i,                 variant: "yellow" },
  { pattern: /\b(conditional|partial|incomplete)\b/i,       variant: "yellow" },

  // ── Orange — needs attention ────────────────────────────────────────────
  { pattern: /\bgap\s*[/\/]\s*not\s+fully\s+specified\b/i,  variant: "orange" },
  { pattern: /\bneeds?\s+(clarification|verification|review)\b/i, variant: "orange" },
  { pattern: /\bnot\s+(fully\s+)?(verifiable|specified)\b/i, variant: "orange" },
  { pattern: /\b(gap|unclear|needs\s+improvement)\b/i,      variant: "orange" },

  // ── Red — non-compliant / missing ───────────────────────────────────────
  { pattern: /\bcannot\s+determine\b/i,                     variant: "red" },
  { pattern: /\bnot\s+(adequately\s+)?specified\b/i,        variant: "red" },
  { pattern: /\b(non[\s-]?compliant|missing|absent|failed?)\b/i, variant: "red" },
];

/**
 * Given the plain-text content of a table cell, return the CSS variant name
 * if it matches a known status pattern, otherwise null.
 */
function detectStatusVariant(plainText: string): string | null {
  const t = plainText.trim();
  // Heuristic: status cells are short (≤ 80 chars) and don't start a sentence
  // with common prose words — avoids false-positives in evidence columns.
  if (t.length > 80) return null;

  for (const { pattern, variant } of STATUS_PATTERNS) {
    if (pattern.test(t)) return variant;
  }
  return null;
}

/** Strip HTML tags from a string to get plain text for pattern matching. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/**
 * Post-process rendered HTML to inject status badge classes into matching
 * table data cells.
 *
 * Strategy: replace `<td>…</td>` where the inner plain text matches a status
 * pattern with `<td><span class="md-status md-status-{variant}">…</span></td>`.
 */
function injectStatusBadges(html: string): string {
  return html.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, inner) => {
    const plain = stripTags(inner);
    const variant = detectStatusVariant(plain);
    if (!variant) return match;
    // Preserve inner HTML (may have <strong> etc.) but wrap in badge span
    return `<td${attrs}><span class="md-status md-status-${variant}">${inner.trim()}</span></td>`;
  });
}

/** Column indices (0-based) that receive a 3-line clamp + "Show more" toggle. */
const CLAMP_COLUMN_INDICES = new Set([2, 3, 4]);

function wrapCellWithClamp(tdOpen: string, inner: string, minChars = 120): string {
  const plainLen = stripTags(inner).length;
  if (plainLen <= minChars) return tdOpen + inner.trim() + "</td>";
  return (
    tdOpen +
    '<span class="md-clause-text">' +
    inner.trim() +
    "</span>" +
    '<button class="md-clause-toggle" type="button">Show more</button>' +
    "</td>"
  );
}

/**
 * Injects a 3-line clamp + "Show more" toggle into long prose columns.
 *
 * Standard 4-col table: Evidence (index 2), Finding (index 3).
 * Requirements table: Evidence (2), Finding (3), Action (4).
 */
function injectClauseToggles(tableHtml: string, clampIndices: Set<number> = CLAMP_COLUMN_INDICES): string {
  return tableHtml.replace(
    /(<tbody\b[^>]*>)([\s\S]*?)(<\/tbody>)/gi,
    (_match, open, body, close) => {
      const processedBody = body.replace(
        /(<tr\b[^>]*>)([\s\S]*?)(<\/tr>)/gi,
        (_trMatch: string, trOpen: string, cells: string, trClose: string) => {
          const parts = cells.split("</td>");
          const rebuilt = parts.map((part, idx) => {
            if (idx === parts.length - 1) return part;
            if (!clampIndices.has(idx)) return part + "</td>";

            const cellMatch = part.match(/^(<td\b[^>]*>)([\s\S]*)$/i);
            if (!cellMatch) return part + "</td>";

            const [, tdOpen, inner] = cellMatch;
            return wrapCellWithClamp(tdOpen, inner);
          });

          return trOpen + rebuilt.join("") + trClose;
        }
      );
      return open + processedBody + close;
    }
  );
}

/** True when the table is the locked 5-column requirements matrix. */
function isRequirementsTable(tableHtml: string): boolean {
  const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]).trim().toLowerCase()
  );
  if (headers.length !== 5) return false;
  return (
    headers[0] === "requirement" &&
    headers[1] === "status" &&
    headers[2] === "evidence" &&
    headers[3] === "finding" &&
    headers[4] === "action"
  );
}

/**
 * Wrap markdown-it tables in a styled container and apply column enhancements.
 *
 * Tables whose first column is a row counter get `md-table-indexed` so the
 * stylesheet can narrow that column.
 *
 * Tables with 5+ columns get `md-table-many-cols` so the stylesheet can revert
 * to auto layout (percentage widths only make sense for the standard 4-column
 * compliance table).
 */
function wrapTables(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const firstHeader = table
      .match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1]
      .replace(/<[^>]*>/g, "")
      .trim();
    const indexed = firstHeader !== undefined && INDEX_HEADER.test(firstHeader);

    const headerCols = (table.match(/<th\b/gi) || []).length;
    const requirements = isRequirementsTable(table);
    const manyColsClass =
      !requirements && headerCols >= 5 ? " md-table-many-cols" : "";
    const requirementsClass = requirements ? " md-table-requirements" : "";

    const tableClass = [requirementsClass.trim(), manyColsClass.trim()]
      .filter(Boolean)
      .join(" ");

    let processed = injectStatusBadges(table);
    processed = injectClauseToggles(
      processed,
      requirements ? new Set([2, 3, 4]) : new Set([2, 3])
    );

    if (tableClass) {
      processed = processed.replace(/<table\b/, `<table class="${tableClass}"`);
    }

    const wrapClass = [
      "md-table-wrap",
      indexed ? "md-table-indexed" : "",
      requirements ? "md-table-requirements-wrap" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${wrapClass}">${processed}</div>`;
  });
}

const MARKDOWN_CACHE_MAX = 24;
const markdownHtmlCache = new Map<string, string>();

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
  const cached = markdownHtmlCache.get(markdown);
  if (cached !== undefined) return cached;

  const cleaned = stripOuterCodeFences(markdown);
  const html = wrapTables(md.render(cleaned));

  if (markdownHtmlCache.size >= MARKDOWN_CACHE_MAX) {
    const oldest = markdownHtmlCache.keys().next().value;
    if (oldest !== undefined) markdownHtmlCache.delete(oldest);
  }
  markdownHtmlCache.set(markdown, html);
  return html;
}
