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
  html: true,        // Allow citation badges and styled markup
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
/** Drop uploaded file titles such as "DPA - 1.pdf —" from locators and scope lines. */
function stripDocumentTitles(raw: string): string {
  return raw
    .replace(/(?:^|[\s;])[^\n;|]*?\.(?:pdf|docx?|txt|rtf)\s*[—–-]\s*/gi, (match) =>
      match.startsWith(" ") || match.startsWith(";") ? match[0] : ""
    )
    .replace(/\bReviewed documents?:\s*[^\n.;]*?(?:\.(?:pdf|docx?|txt|rtf))?\.?/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

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
  { pattern: /\bpartial(?:ly)?\s+(adequate|covered)\b/i,    variant: "yellow" },
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
  const headers = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
    (match) => stripTags(match[1]).toLowerCase()
  );
  const statusColumn = headers.findIndex((header) =>
    /^(status|assessment|outcome|result)$/.test(header)
  );
  if (statusColumn < 0) return html;

  return html.replace(
    /(<tbody\b[^>]*>)([\s\S]*?)(<\/tbody>)/gi,
    (_match, open, body, close) => {
      const processedBody = body.replace(
        /(<tr\b[^>]*>)([\s\S]*?)(<\/tr>)/gi,
        (_rowMatch: string, rowOpen: string, cells: string, rowClose: string) => {
          const parts = cells.split("</td>");
          const rebuilt = parts.map((part, index) => {
            if (index === parts.length - 1 || index !== statusColumn) {
              return index === parts.length - 1 ? part : part + "</td>";
            }
            const cellMatch = part.match(/^(\s*<td\b)([^>]*)>([\s\S]*)$/i);
            if (!cellMatch) return part + "</td>";
            const [, tdOpen, attrs, inner] = cellMatch;
            const variant = detectStatusVariant(stripTags(inner));
            if (!variant) return part + "</td>";
            return `${tdOpen}${attrs}><span class="md-status md-status-${variant}">${inner.trim()}</span></td>`;
          });
          return rowOpen + rebuilt.join("") + rowClose;
        }
      );
      return open + processedBody + close;
    }
  );
}

/** Column indices (0-based) whose long content participates in row expansion. */
const CLAMP_COLUMN_INDICES = new Set([2, 3, 4]);

function clampThresholdForColumn(index: number): number {
  return index === 0 ? 70 : 120;
}

function wrapCellWithClamp(
  tdOpen: string,
  inner: string,
  minChars = 120,
  extraClass = ""
): string {
  const plainLen = stripTags(inner).length;
  if (plainLen <= minChars) return tdOpen + inner.trim() + "</td>";
  const cls = extraClass ? `md-clause-text ${extraClass}` : "md-clause-text";
  return (
    tdOpen +
    `<span class="${cls}" role="button" tabindex="0" aria-label="Expand row" aria-expanded="false" title="Click to expand row">` +
    inner.trim() +
    "</span>" +
    "</td>"
  );
}

/**
 * Clamps every long prose cell in a row. The clamped text itself is the row
 * expansion control, so the native visible ellipsis does not need a separate
 * button beneath it.
 *
 * Standard 4-col table: Evidence (index 2), Finding (index 3).
 * Requirements table: Evidence (2), Finding (3), Action (4).
 */
function injectClauseToggles(
  tableHtml: string,
  clampIndices: Set<number> = CLAMP_COLUMN_INDICES,
  minChars?: number,
  extraClass = ""
): string {
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

            const cellMatch = part.match(/^(\s*<td\b[^>]*>)([\s\S]*)$/i);
            if (!cellMatch) return part + "</td>";

            const [, tdOpen, inner] = cellMatch;
            return wrapCellWithClamp(
              tdOpen,
              inner,
              minChars ?? clampThresholdForColumn(idx),
              extraClass
            );
          });

          return trOpen + rebuilt.join("") + trClose;
        }
      );
      return open + processedBody + close;
    }
  );
}

const COMPLIANCE_STATUS: Array<{ pattern: RegExp; mark: string }> = [
  { pattern: /^verification incomplete$/i, mark: "🔍" },
  { pattern: /^cannot determine$/i, mark: "❓" },
  { pattern: /^not applicable$/i, mark: "○" },
  { pattern: /^judgment required$/i, mark: "⚖️" },
  { pattern: /^conflicting$/i, mark: "⚡" },
  { pattern: /^partial$/i, mark: "⚠️" },
  { pattern: /^gap$/i, mark: "⚠️" },
  { pattern: /^present$/i, mark: "✅" },
];

function statusMarkHtml(plain: string): string | null {
  const text = plain.replace(/[✅⚠️🔍❓○⚡⚖️—-]/g, "").replace(/\s+/g, " ").trim();
  const match = COMPLIANCE_STATUS.find((item) => item.pattern.test(text));
  if (!match) return null;
  return `<span class="md-status-mark">${match.mark} <strong>${text}</strong></span>`;
}

/** Request-adaptive compliance overview: 3-6 approved columns including Requirement and Status. */
function isComplianceOverviewTable(tableHtml: string): boolean {
  const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]).trim().toLowerCase()
  );
  if (headers.length < 3 || headers.length > 6 || new Set(headers).size !== headers.length) return false;
  const names = new Set(headers);
  const allowed = new Set([
    "requirement", "status", "contract provision", "assessment", "gap or qualification",
    "recommended action", "parties and roles", "transfer mechanism", "destination", "legal basis", "timing",
  ]);
  return names.has("requirement") && names.has("status") && headers.every(header => allowed.has(header));
}

function complianceColumnIndexes(tableHtml: string): { status: number; clamp: Set<number> } {
  const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]).trim().toLowerCase()
  );
  const status = headers.indexOf("status");
  const clamp = new Set(headers.map((_, index) => index).filter((index) => index !== status));
  return { status, clamp };
}

const COMPLIANCE_COL_CLASS: Record<string, string> = {
  requirement: "md-col-requirement",
  status: "md-col-status",
  "contract provision": "md-col-provision",
  assessment: "md-col-assessment",
  "gap or qualification": "md-col-assessment",
  "recommended action": "md-col-action",
  "parties and roles": "md-col-specialized",
  "transfer mechanism": "md-col-specialized",
  destination: "md-col-specialized",
  "legal basis": "md-col-specialized",
  timing: "md-col-specialized",
};

function annotateComplianceColumns(tableHtml: string): string {
  const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]).trim().toLowerCase()
  );
  const withClass = (tag: "th" | "td", html: string) => {
    let index = 0;
    return html.replace(new RegExp(`<${tag}\\b([^>]*)>`, "gi"), (open, attrs: string) => {
      const name = headers[index % Math.max(headers.length, 1)] ?? "";
      index += 1;
      const col = COMPLIANCE_COL_CLASS[name];
      if (!col || /class="/i.test(attrs)) return `<${tag}${attrs}>`;
      return `<${tag}${attrs} class="${col}">`;
    });
  };
  return tableHtml
    .replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/i, (thead) => withClass("th", thead))
    .replace(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/i, (tbody) => withClass("td", tbody));
}

function decorateComplianceStatus(tableHtml: string, statusColumn: number): string {
  if (statusColumn < 0) return tableHtml;
  return tableHtml.replace(
    /(<tbody\b[^>]*>)([\s\S]*?)(<\/tbody>)/gi,
    (_match, open, body, close) => {
      const processedBody = body.replace(
        /(<tr\b[^>]*>)([\s\S]*?)(<\/tr>)/gi,
        (_rowMatch: string, rowOpen: string, cells: string, rowClose: string) => {
          const parts = cells.split("</td>");
          const rebuilt = parts.map((part, index) => {
            if (index === parts.length - 1 || index !== statusColumn) {
              return index === parts.length - 1 ? part : part + "</td>";
            }
            const cellMatch = part.match(/^(\s*<td\b)([^>]*)>([\s\S]*)$/i);
            if (!cellMatch) return part + "</td>";
            const marked = statusMarkHtml(stripTags(cellMatch[3]));
            if (!marked) return part + "</td>";
            return `${cellMatch[1]}${cellMatch[2]}>${marked}</td>`;
          });
          return rowOpen + rebuilt.join("") + rowClose;
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
    const compliance = !requirements && isComplianceOverviewTable(table);
    const manyColsClass =
      !requirements && !compliance && headerCols >= 5 ? " md-table-many-cols" : "";
    const requirementsClass = requirements ? " md-table-requirements" : "";
    const complianceClass = compliance ? ` md-table-compliance${headerCols >= 5 ? " md-table-compliance-wide" : ""}` : "";

    const tableClass = [requirementsClass.trim(), complianceClass.trim(), manyColsClass.trim()]
      .filter(Boolean)
      .join(" ");

    let processed = compliance ? table : injectStatusBadges(table);
    if (compliance) {
      const columns = complianceColumnIndexes(processed);
      processed = annotateComplianceColumns(processed);
      processed = decorateComplianceStatus(processed, columns.status);
      processed = injectClauseToggles(processed, columns.clamp, 280, "md-clause-text--roomy");
    } else {
      processed = injectClauseToggles(
        processed,
        requirements ? new Set([0, 2, 3, 4]) : new Set([2, 3])
      );
    }

    if (tableClass) {
      processed = processed.replace(/<table\b/, `<table class="${tableClass}"`);
    }

    const wrapClass = [
      "md-table-wrap",
      indexed ? "md-table-indexed" : "",
      requirements ? "md-table-requirements-wrap" : "",
      compliance ? "md-table-compliance-wrap" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${wrapClass}">${processed}</div>`;
  });
}

/**
 * Give deterministic compound-analysis markdown a real visual hierarchy.
 * The backend reserves H1 for the report and H2 for independently analyzed
 * workstreams; branch-internal headings are H3+. Keeping this transformation
 * here means copy/print still receive ordinary, portable Markdown.
 */
function wrapCompoundAnalysis(html: string): string {
  if (!/<h1>\s*Analysis report\s*<\/h1>/i.test(html)) return html;
  const firstWorkstream = html.search(/<h2>/i);
  if (firstWorkstream < 0) return html;

  const overview = html.slice(0, firstWorkstream)
    .replace(/<h1>/i, '<h1 class="md-analysis-title">');
  const workstreamHtml = html.slice(firstWorkstream).replace(/<hr>\s*/gi, "");
  const workstreams = workstreamHtml.match(/<h2>[\s\S]*?(?=<h2>|$)/gi) ?? [];
  if (workstreams.length < 2) return html;

  return [
    `<section class="md-analysis-overview">${overview}</section>`,
    ...workstreams.map(
      (section) => `<section class="md-analysis-workstream">${section}</section>`
    ),
  ].join("\n");
}

/** Clause text is already shown with each finding. Drop a trailing Sources dump. */
function omitSources(html: string): string {
  return html.replace(/<h2>\s*Sources\s*<\/h2>[\s\S]*$/i, "");
}

function joinOverviewNames(names: string[]): string {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  const list = shown.length <= 1 ? shown[0] ?? ""
    : shown.length === 2 ? `${shown[0]} and ${shown[1]}`
    : `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${list}, and ${rest} more` : list;
}

/** Replace a canned Answer block with a short summary taken from the overview table. */
function summarizeAnswer(html: string): string {
  if (!/<h2>\s*(?:Answer|Executive summary)\s*<\/h2>/i.test(html)) return html;
  const table = html.match(/<table\b[^>]*class="[^"]*md-table-compliance[^"]*"[\s\S]*?<\/table>/i)?.[0]
    ?? html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) return html;
  const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => stripTags(m[1]).toLowerCase());
  const requirementCol = headers.indexOf("requirement");
  const statusCol = headers.indexOf("status");
  if (requirementCol < 0 || statusCol < 0) return html;
  const groups = new Map<string, string[]>();
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
    if (cells.length <= Math.max(requirementCol, statusCol)) continue;
    const name = cells[requirementCol].replace(/\s*\([^)]*\)\s*$/u, "").trim();
    const status = cells[statusCol].replace(/[✅⚠️🔍❓○⚡⚖️]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!name || !status) continue;
    groups.set(status, [...(groups.get(status) ?? []), name]);
  }
  const total = [...groups.values()].reduce((sum, names) => sum + names.length, 0);
  if (!total) return html;
  const line = (status: string, singular: string, plural: string) => {
    const names = groups.get(status) ?? [];
    if (!names.length) return "";
    return `${names.length} ${names.length === 1 ? singular : plural}, including ${joinOverviewNames(names)}.`;
  };
  const summary = [
    `This review checked ${total} requirement${total === 1 ? "" : "s"}.`,
    line("present", "is present", "are present"),
    line("partial", "is only partial", "are only partial"),
    line("gap", "was not found", "were not found"),
    line("verification incomplete", "could not be fully verified", "could not be fully verified"),
  ].filter(Boolean).join(" ");
  return html.replace(
    /(<h2>\s*(?:Answer|Executive summary)\s*<\/h2>)([\s\S]*?)(?=<h2>|$)/i,
    `$1<p>${summary}</p>`
  );
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

/**
 * Selectively bolds key metrics, notice periods, deadlines, legal citations,
 * and core legal terms in prose paragraphs so executive readers can easily scan.
 * Uses replaceTextInHtml to guarantee HTML tags & attributes are never mutated.
 */
function autoBoldKeyTerms(html: string): string {
  return replaceTextInHtml(html, (text, tag) => {
    // Skip bolding inside headings, table headers, superscript badges, and existing strong tags
    if (
      tag.startsWith("h") ||
      tag === "th" ||
      tag === "sup" ||
      tag === "strong"
    ) {
      return text;
    }

    let bolded = text;

    // 1. Timeframes, deadlines, notice periods (e.g. "10 days", "5 business days", "90 days")
    bolded = bolded.replace(
      /\b(\d+\s+(?:calendar\s+|business\s+)?(?:days?|weeks?|months?|years?|hours?))\b(?![^<]*<\/strong>)/gi,
      "<strong>$1</strong>"
    );

    // 2. Articles and GDPR citations (e.g. "Article 28(1)", "Article 28(3)(a)")
    bolded = bolded.replace(
      /\b(Article\s+\d+(?:\(\d+\))?(?:\([a-z0-9]+\))?)\b(?![^<]*<\/strong>)/gi,
      "<strong>$1</strong>"
    );

    // 3. Core legal terms & obligations
    bolded = bolded.replace(
      /\b(prior written authorization|written authorization|advance notice|written agreement|documented instructions|technical and organizational measures|confidentiality obligations|data protection impact assessment|sub-processor engagement|data subject rights)\b(?![^<]*<\/strong>)/gi,
      "<strong>$1</strong>"
    );

    return bolded;
  });
}

/**
 * Safely performs regex text replacements on HTML, operating strictly on text
 * content outside HTML tags and attributes to prevent attribute corruption.
 */
function replaceTextInHtml(
  html: string,
  replacer: (textToken: string, currentTag: string, currentClass: string) => string
): string {
  const parts = html.split(/(<[^>]+>)/g);
  let currentTag = "";
  let currentClass = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const tagMatch = parts[i].match(/<(\/?[\w-]+)([^>]*)>/);
      if (tagMatch) {
        currentTag = tagMatch[1].toLowerCase();
        const classMatch = tagMatch[2].match(/class=["']([^"']*)["']/i);
        currentClass = classMatch ? classMatch[1].toLowerCase() : "";
      }
    } else {
      if (parts[i]) {
        parts[i] = replacer(parts[i], currentTag, currentClass);
      }
    }
  }
  return parts.join("");
}

/**
 * Transforms clause pointers into interactive citation badges with popover tooltips.
 * Embeds full quoted text in the popover data-quote attribute so hovering over
 * badge [1], [2], etc. shows the exact clause excerpt without bloating inline text.
 * BADGES ARE CREATED ONLY WHERE ACTUAL QUOTES EXIST (table cells & supporting clause items).
 */
function injectCitationBadges(html: string): string {
  let badgeId = 1;

  // Pass 1: Supporting Clauses where `<p>...See Clause X...</p>`
  // MUST be a SINGLE <p> tag containing `See `, immediately followed by `<blockquote>“Quote...”</blockquote>`.
  // Use `(?:(?!<\/p>)[\s\S])*?` to ensure match NEVER crosses <p> paragraph boundaries!
  let processed = html.replace(
    /(<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?\bSee\s+([A-Za-z0-9\s._\-()§#;·]+)\s*<\/p>)\s*<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (fullMatch, pTag, pointer, blockquoteContent) => {
      const p = pointer.trim();
      let q = blockquoteContent
        ? blockquoteContent
            .replace(/<[^>]+>/g, " ")
            .replace(/^["“]|["”]$/g, "")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      if (!q) {
        return fullMatch;
      }
      const num = badgeId++;
      const badge = `<sup class="md-citation-badge" data-doc="Reviewed Document" data-pointer="${escapeAttr(p)}" data-quote="${escapeAttr(q)}">${num}</sup>`;
      // Safely append badge right before </p> tag end of THIS single <p> tag. Blockquote is removed!
      return pTag.replace(/<\/p>$/i, ` ${badge}</p>`);
    }
  );

  // Pass 2: Inline table & references quotes like `See Clause 1.1, which says: “Quote...”` or `Clause 9, which says: “Quote...”`
  // Cleanly replace `, which says: “Quote...”` with the citation badge. The quote text is stored in data-quote for hover popovers.
  processed = replaceTextInHtml(processed, (text) => {
    return text.replace(
      /(See\s+)?([A-Za-z0-9\s._\-()§#;·]+?),\s*which says:\s*(?:“|"|&ldquo;|&#8220;)([\s\S]*?)(?:”|"|&rdquo;|&#8221;)(?=[;,.*<]|\s*[\n$])/g,
      (_, seePrefix, pointer, quote) => {
        const p = pointer.trim();
        const q = quote.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const num = badgeId++;
        const prefix = seePrefix || "";
        return `${prefix}${p} <sup class="md-citation-badge" data-doc="Reviewed Document" data-pointer="${escapeAttr(p)}" data-quote="${escapeAttr(q)}">${num}</sup>`;
      }
    );
  });

  return processed;
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

  const cleaned = stripDocumentTitles(stripOuterCodeFences(markdown));
  // Compliance prose has already passed the locked-finding report validator.
  // Keep its reader-facing executive summary instead of replacing it with table counts.
  const html = autoBoldKeyTerms(injectCitationBadges(omitSources(wrapCompoundAnalysis(wrapTables(md.render(cleaned))))));

  if (markdownHtmlCache.size >= MARKDOWN_CACHE_MAX) {
    const oldest = markdownHtmlCache.keys().next().value;
    if (oldest !== undefined) markdownHtmlCache.delete(oldest);
  }
  markdownHtmlCache.set(markdown, html);
  return html;
}
