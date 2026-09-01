import { AgentMarkup } from "./types";
import { RISK_CONFIG } from "./constants";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";

// ─── Highlight span builder ───────────────────────────────────────────────────

function buildHighlightSpan(
  clauseId: string,
  riskColor: string,
  isActive: boolean,
  innerText: string
): string {
  const activeRing = isActive ? "ring-2 ring-offset-1 ring-[#18181B]" : "";
  return (
    `<span ` +
    `data-clause-id="${clauseId}" ` +
    `class="negotiate-clause-highlight inline cursor-pointer rounded px-1 py-0.5 border transition-all ${riskColor} ${activeRing}" ` +
    `title="Click to review AI suggestion">` +
    `<span class="line-through text-red-600 text-[0.8125rem]">${innerText}</span>` +
    `</span>`
  );
}

// ─── Text normalisation helper ────────────────────────────────────────────────

function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ─── Strategy 1: exact regex match on rendered HTML ──────────────────────────

function tryExactMatch(
  html: string,
  original: string,
  replacement: string
): string | null {
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped);
  if (!regex.test(html)) return null;
  return html.replace(regex, replacement);
}

// ─── Strategy 2: normalised-whitespace match on rendered HTML ─────────────────

function stripTagsForMatch(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches `original` against the visible text of `html` using normalised
 * whitespace, then splices the span into the raw HTML at the found position.
 * Handles cases where Markdown→HTML wrapping altered spacing or added entities.
 */
function tryNormalisedMatch(
  html: string,
  original: string,
  spanReplacement: string
): string | null {
  const normTarget = normaliseWhitespace(original);
  if (normTarget.length < 10) return null;

  const plainText = stripTagsForMatch(html);
  const normPlain = normaliseWhitespace(plainText);

  const matchIdx = normPlain.toLowerCase().indexOf(normTarget.toLowerCase());
  if (matchIdx === -1) return null;

  // Walk the raw HTML char-by-char, skipping tags, counting visible chars
  // until we bracket [matchIdx, matchIdx + normTarget.length).
  let visibleCount = 0;
  let htmlStart = -1;
  let htmlEnd = -1;
  const targetLen = normTarget.length;
  let i = 0;

  while (i < html.length) {
    if (html[i] === "<") {
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) break;
      i = tagEnd + 1;
      continue;
    }

    if (visibleCount === matchIdx && htmlStart === -1) {
      htmlStart = i;
    }

    if (htmlStart !== -1 && visibleCount === matchIdx + targetLen) {
      htmlEnd = i;
      break;
    }

    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 8) {
        visibleCount++;
        i = semi + 1;
        continue;
      }
    }

    visibleCount++;
    i++;
  }

  if (htmlStart !== -1 && htmlEnd === -1) htmlEnd = html.length;
  if (htmlStart === -1 || htmlEnd === -1 || htmlEnd <= htmlStart) return null;

  return html.slice(0, htmlStart) + spanReplacement + html.slice(htmlEnd);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Builds the rendered HTML for the negotiate document viewer.
 *
 * Highlight injection is performed entirely on the already-rendered HTML using
 * a two-strategy cascade:
 *
 *   1. Exact regex match on rendered HTML   (fast; works for most clauses)
 *   2. Normalised-whitespace match on HTML  (handles smart-quotes, entity encoding,
 *                                            extra whitespace from Markdown rendering)
 *
 * NOTE: Strategy 3 (charOffset pre-injection into plain text) was removed because
 * injecting raw HTML spans before markdownToHtml caused angle brackets to be
 * escaped, rendering the span markup as visible text. Strategies 1 and 2 are
 * sufficient for post-render matching. charOffset is preserved on AgentMarkup
 * for future use (e.g. accurate accept/replace splice).
 *
 * If both strategies fail for a markup, it stays in the panel list but is not
 * highlighted — better than crashing or showing escaped markup.
 */
export function buildRenderedDocumentHtml(
  content: string,
  agentMarkups: AgentMarkup[],
  selectedMarkupId: string | null,
  options?: {
    appliedClause?: { id: string; text: string; spliceStart: number } | null;
  }
): string {
  if (!content) return "";

  const appliedClause = options?.appliedClause ?? null;
  const isHtml = /<[a-z][\s\S]*>/i.test(content.trim());

  // Render to HTML first — highlights are injected post-render only
  let html = isHtml ? content : markdownToHtml(content);

  // ── AI finding highlights ─────────────────────────────────────────────────
  // Sort RED → YELLOW → GREEN so higher-risk highlights win on overlap
  const sorted = [...agentMarkups]
    .filter((m) => m.original && m.original.trim().length > 10)
    .sort((a, b) => {
      const order: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
      return order[a.riskLevel] - order[b.riskLevel];
    });

  for (const m of sorted) {
    const riskColor = RISK_CONFIG[m.riskLevel].clauseHighlight;
    const isActive = m.clauseId === selectedMarkupId;
    const spanHtml = buildHighlightSpan(m.clauseId, riskColor, isActive, m.original);

    // Strategy 1: exact match
    const after1 = tryExactMatch(html, m.original, spanHtml);
    if (after1 !== null) {
      html = after1;
      continue;
    }

    // Strategy 2: normalised-whitespace match
    const after2 = tryNormalisedMatch(html, m.original, spanHtml);
    if (after2 !== null) {
      html = after2;
      continue;
    }

    console.warn(
      `[negotiate/highlight] Could not locate clause "${m.clauseId}" in rendered HTML. ` +
        `Original preview: "${m.original.slice(0, 60)}..."`
    );
  }

  // ── Applied clause highlight (post-accept green flash) ───────────────────
  // Instead of a naive first-occurrence regex, we use the occurrence index
  // derived from spliceStart to wrap the exact instance that was modified.
  if (appliedClause?.text && appliedClause.text.trim().length > 2) {
    const escaped = appliedClause.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const singleMatch = new RegExp(escaped);

    // Count how many times the replacement text appears in the raw content
    // BEFORE the splice position. This gives us the occurrence index (0-based)
    // of the inserted text within the raw content.
    const rawText = appliedClause.text;
    const rawOccurrenceIndex = (() => {
      let count = 0;
      let searchFrom = 0;
      while (searchFrom < appliedClause.spliceStart) {
        const idx = content.indexOf(rawText, searchFrom);
        if (idx === -1 || idx >= appliedClause.spliceStart) break;
        count++;
        searchFrom = idx + rawText.length;
      }
      return count;
    })();

    // Now find the same occurrence (rawOccurrenceIndex) in the rendered HTML
    // using a global regex to iterate matches.
    const globalRegex = new RegExp(escaped, "g");
    let match: RegExpExecArray | null;
    let matchCount = 0;
    let targetMatch: RegExpExecArray | null = null;
    while ((match = globalRegex.exec(html)) !== null) {
      if (matchCount === rawOccurrenceIndex) {
        targetMatch = match;
        break;
      }
      matchCount++;
    }

    if (targetMatch !== null) {
      // Replace only this single occurrence by splicing the HTML string.
      const before = html.slice(0, targetMatch.index);
      const after  = html.slice(targetMatch.index + targetMatch[0].length);
      const spanWrapped = `<span data-clause-id="${appliedClause.id}" class="negotiate-clause-applied">${targetMatch[0]}</span>`;
      html = before + spanWrapped + after;
    } else if (singleMatch.test(html)) {
      // Fallback: occurrence index exceeds matches in HTML (e.g. earlier
      // occurrences were already wrapped as AI findings). Use last match
      // rather than silently skipping the flash.
      html = html.replace(
        singleMatch,
        `<span data-clause-id="${appliedClause.id}" class="negotiate-clause-applied">${appliedClause.text}</span>`,
      );
    }
  }

  return html;
}
