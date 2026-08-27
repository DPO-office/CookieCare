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

/**
 * Injects a 3-line clamp + "Show more" toggle into the Evidence/clause column.
 *
 * The 3rd <td> in every <tbody> row (column index 2, zero-based) is the
 * Evidence / Referenced Clause column. Actual column order from the LLM:
 * Category(0) → Status(1) → Clause(2) → Finding(3)
 * <span class="md-clause-text"> (CSS clamps to 3 lines) and append a
 * <button class="md-clause-toggle"> immediately after it inside the cell.
 *
 * Cells with plain text ≤ 120 chars are left untouched — no clamp needed.
 *
 * NOTE: We rebuild the <tr> string by splitting on </td> boundaries rather
 * than using nested String.replace(), which avoids $ special-character bugs
 * in replacement strings when cell content contains HTML.
 */
function injectClauseToggles(tableHtml: string): string {
  return tableHtml.replace(
    /(<tbody\b[^>]*>)([\s\S]*?)(<\/tbody>)/gi,
    (_match, open, body, close) => {
      // Split body into individual <tr>…</tr> blocks
      const processedBody = body.replace(
        /(<tr\b[^>]*>)([\s\S]*?)(<\/tr>)/gi,
        (_trMatch: string, trOpen: string, cells: string, trClose: string) => {
          // Split cells by </td> — each segment except the last starts with <td…>content
          const parts = cells.split("</td>");
          // Last split is trailing whitespace/newline after the last </td> — keep it
          const rebuilt = parts.map((part, idx) => {
            // Not a real cell segment (trailing fragment after last </td>)
            if (idx === parts.length - 1) return part;

            // Only process column index 2 (3rd column — Evidence/Clause)
            // Actual column order: Category(0) → Status(1) → Clause(2) → Finding(3)
            if (idx !== 2) return part + "</td>";

            // Extract <td attrs> and inner content
            const cellMatch = part.match(/^(<td\b[^>]*>)([\s\S]*)$/i);
            if (!cellMatch) return part + "</td>";

            const [, tdOpen, inner] = cellMatch;
            const plainLen = stripTags(inner).length;

            // Skip short cells — no clamp needed
            if (plainLen <= 120) return part + "</td>";

            // Wrap and append toggle — use a raw string concatenation so no
            // $ substitution magic from String.replace applies here
            return (
              tdOpen +
              '<span class="md-clause-text">' +
              inner.trim() +
              "</span>" +
              '<button class="md-clause-toggle" type="button">Show more</button>' +
              "</td>"
            );
          });

          return trOpen + rebuilt.join("") + trClose;
        }
      );
      return open + processedBody + close;
    }
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

    // Count columns from the first header row
    const headerCols = (table.match(/<th\b/gi) || []).length;
    const manyColsClass = headerCols >= 5 ? " md-table-many-cols" : "";

    // Build table class string
    const tableClass = [
      manyColsClass.trim(),
    ].filter(Boolean).join(" ");

    // Inject status badges, then clause toggles
    let processed = injectStatusBadges(table);
    processed = injectClauseToggles(processed);

    // Add class to <table> element if needed
    if (tableClass) {
      processed = processed.replace(/<table\b/, `<table class="${tableClass}"`);
    }

    const wrapClass = indexed ? "md-table-wrap md-table-indexed" : "md-table-wrap";
    return `<div class="${wrapClass}">${processed}</div>`;
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
