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

/**
 * Findings are grounded against stored document text, which may still contain
 * Markdown emphasis (e.g. `**6. Unilateral Modifications** …`). The viewer
 * renders that Markdown to HTML (`<strong>` / headings), so highlight matching
 * must also try a decorator-stripped variant against visible text.
 */
function stripMarkdownDecorators(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

function highlightMatchCandidates(original: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [original, stripMarkdownDecorators(original)]) {
    const key = normaliseWhitespace(candidate).toLowerCase();
    if (key.length < 10 || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function tryInjectHighlight(
  html: string,
  original: string,
  spanHtml: string
): string | null {
  return (
    tryExactMatch(html, original, spanHtml) ??
    tryNormalisedMatch(html, original, spanHtml) ??
    tryPositionMapMatch(html, original, spanHtml)
  );
}

/**
 * Returns true if the position `idx` in `html` is inside an existing
 * negotiate-clause-highlight span.
 *
 * The old approach counted all </span> tags, which is wrong — bold/em/strong
 * elements all produce </span> in rendered HTML. The correct approach is to
 * walk backwards from `idx` looking for the nearest preceding
 * `negotiate-clause-highlight` open tag, then check that its paired </span>
 * hasn't appeared between that open tag and `idx`.
 */
function isInsideHighlightSpan(html: string, idx: number): boolean {
  const before = html.slice(0, idx);
  // Find the last negotiate-clause-highlight open tag before idx
  const lastOpen = before.lastIndexOf("negotiate-clause-highlight");
  if (lastOpen === -1) return false;
  // Count how many </span> appear between that last open tag and idx.
  // The highlight span has TWO nested spans (outer wrapper + inner line-through),
  // so it produces two </span> closing tags when fully closed.
  // If we find 2 or more </span> after the last open tag, the highlight is closed.
  const afterOpen = before.slice(lastOpen);
  const closeCount = (afterOpen.match(/<\/span>/g) ?? []).length;
  return closeCount < 2;
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
  const matchIdx = html.search(regex);
  if (matchIdx !== -1 && isInsideHighlightSpan(html, matchIdx)) return null;
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
    // Normalise Unicode smart quotes/dashes so they match plain-text originals
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    // Strip zero-width spaces — the backend locateInDocument pass 3 skips
    // \u200B entirely, but this function previously left them in, causing a
    // mismatch where a finding was groundable on the backend but unhighlightable
    // on the frontend (the normalised plain text had a ZWS the original didn't).
    .replace(/\u200B/g, "")
    // Align with backend typoNorm: soft hyphen removed, narrow/thin spaces
    // collapsed to regular space. These appear in PDF-extracted documents and
    // the backend's locateInDocument pass 3 handles them; without this the
    // frontend strategies fail to locate findings from those documents.
    .replace(/\u00AD/g, "")       // soft hyphen → remove
    .replace(/[\u202F\u2009]/g, " ") // narrow no-break / thin space → space
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
  // normTarget must apply the same smart-quote substitution that
  // stripTagsForMatch applies to normPlain — otherwise an original containing
  // U+2019 (right curly quote, common in DOCX/LLM output) won't match the
  // normPlain which has already been converted to a straight apostrophe.
  const normTarget = normaliseWhitespace(
    original
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
  );
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

  // Use the fixed guard
  if (isInsideHighlightSpan(html, htmlStart)) return null;

  return html.slice(0, htmlStart) + spanReplacement + html.slice(htmlEnd);
}

/**
 * Strategy 3: for clauses that span paragraph boundaries, the rendered HTML
 * has </p><p> between sentences which Strategy 2's walker skips as tag chars,
 * but the stripped normPlain collapses them to spaces. This creates a position
 * mismatch where the walker ends up pointing at the wrong raw HTML offset.
 *
 * Instead: build a full parallel map of (visible-char-index → raw-html-index)
 * by walking the HTML once, then use indexOf on the normalised plain text to
 * find start/end visible indices, and map both back through the position map.
 * This is equivalent to Strategy 2 but uses an explicit posMap instead of
 * counting on the fly, ensuring the start/end raw positions are always exact.
 */
function tryPositionMapMatch(
  html: string,
  original: string,
  spanReplacement: string
): string | null {
  // Normalise original — collapse all whitespace, normalise Unicode punctuation
  const normTarget = original
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    // Align with backend typoNorm (same set as stripTagsForMatch)
    .replace(/\u00AD/g, "")
    .replace(/[\u202F\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (normTarget.length < 10) return null;

  // Build posMap: posMap[visibleIdx] = htmlIdx of that visible char's START in html
  const visibleChars: string[] = [];
  const posMap: number[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) { i++; continue; }
      i = tagEnd + 1;
      continue;
    }
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 8) {
        const entity = html.slice(i, semi + 1);
        const decoded = entity
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
        visibleChars.push(decoded);
        posMap.push(i);
        i = semi + 1;
        continue;
      }
    }
    visibleChars.push(html[i]);
    posMap.push(i);
    i++;
  }

  const normVisible = visibleChars.join("")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // align with normTarget3 smart-quote substitution
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // same for double curly quotes
    .replace(/\u00AD/g, "")
    .replace(/[\u202F\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const matchIdx = normVisible.indexOf(normTarget);
  if (matchIdx === -1) return null;

  const htmlStart = posMap[matchIdx];
  const endVisibleIdx = matchIdx + normTarget.length - 1;
  if (endVisibleIdx >= posMap.length) return null;
  // htmlEnd should point to the character AFTER the last matched visible char
  const lastCharStart = posMap[endVisibleIdx];
  // Advance past that character (or entity) in raw html
  let htmlEnd = lastCharStart;
  if (html[htmlEnd] === "&") {
    const semi = html.indexOf(";", htmlEnd);
    if (semi !== -1 && semi - htmlEnd <= 8) htmlEnd = semi + 1;
    else htmlEnd++;
  } else {
    htmlEnd++;
  }

  if (isInsideHighlightSpan(html, htmlStart)) return null;

  return html.slice(0, htmlStart) + spanReplacement + html.slice(htmlEnd);
}

/**
 * When a finding's original text is fully contained within an already-highlighted
 * span (overlap/subset case), we can't inject a new span. Instead, register the
 * finding's clauseId as a secondary attribute on the existing highlight span so
 * the document viewer can still scroll to it.
 *
 * Returns updated html if the original text appears inside an existing highlight
 * span, null otherwise.
 */
function tryRegisterOnExistingSpan(
  html: string,
  original: string,
  clauseId: string
): string | null {
  const normTarget = normaliseWhitespace(original).toLowerCase();
  if (normTarget.length < 10) return null;

  const plainText = stripTagsForMatch(html);
  const normPlain = normaliseWhitespace(plainText).toLowerCase();
  if (normPlain.indexOf(normTarget) === -1) return null;

  // Find the nearest negotiate-clause-highlight span that contains this text
  const spanRegex = /data-clause-id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = spanRegex.exec(html)) !== null) {
    const spanStart = match.index;
    // Find the end of this span (look for the closing </span></span> pair)
    const spanClose = html.indexOf("</span></span>", spanStart);
    if (spanClose === -1) continue;
    const spanHtml = html.slice(spanStart, spanClose + "</span></span>".length);
    const spanPlain = normaliseWhitespace(stripTagsForMatch(spanHtml)).toLowerCase();
    if (spanPlain.includes(normTarget)) {
      // Add this clauseId as a secondary data attribute on the existing span
      const existingClauseId = match[1];
      if (existingClauseId === clauseId) return null; // already registered
      const updated = html.replace(
        `data-clause-id="${existingClauseId}"`,
        `data-clause-id="${existingClauseId}" data-secondary-clause-ids="${clauseId}"`
      );
      // Only accept if something actually changed
      return updated !== html ? updated : null;
    }
  }
  return null;
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

  // Plain-text documents (DOCX/PDF extracted via extractText → htmlToStructuredText)
  // are stored with single \n as the paragraph/heading separator. markdown-it
  // runs with breaks:false, so a single \n is treated as whitespace and the
  // entire document collapses into one run-on paragraph block.
  //
  // Fix: before passing to markdownToHtml, normalise single-\n boundaries to
  // \n\n so markdown-it produces a separate <p> for every paragraph, matching
  // how the document looks in the original file.
  //
  // Guard: only apply when the content is plain text (not HTML, not Markdown).
  // A Markdown document already uses \n\n for paragraph breaks and #/*/_ markers
  // for structure — touching those would corrupt heading/list rendering.
  function looksLikePlainText(s: string): boolean {
    // Has no HTML tags and no common Markdown markers at line starts
    if (/<[a-z][\s\S]*>/i.test(s)) return false;
    const lines = s.split("\n");
    const markdownLines = lines.filter(l => /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^>\s|^```/.test(l));
    // If more than 5% of lines look like Markdown syntax, treat as Markdown
    return markdownLines.length / Math.max(lines.length, 1) < 0.05;
  }

  let processedContent = content;
  if (!isHtml && looksLikePlainText(content)) {
    // Convert isolated single \n to \n\n so each paragraph gets its own <p>.
    // \n\n (already double) is left alone. \n preceded/followed by another \n
    // is already a blank-line separator — also left alone.
    processedContent = content.replace(/\n(?!\n)/g, "\n\n");
  }

  // Render to HTML first — highlights are injected post-render only
  let html = isHtml ? content : markdownToHtml(processedContent);

  // ── AI finding highlights ─────────────────────────────────────────────────
  // Sort by: risk level (RED first), then original length descending so longer
  // clauses are injected before shorter overlapping ones — this ensures that
  // when finding A's text fully contains finding B's text, A gets its own span
  // and B is registered as a secondary data attribute on A's span rather than
  // being silently dropped.
  const sorted = [...agentMarkups]
    .filter((m) => m.original && m.original.trim().length > 10)
    .sort((a, b) => {
      const riskOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
      const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (riskDiff !== 0) return riskDiff;
      // Within same risk level, longer originals first
      return b.original.length - a.original.length;
    });

  for (const m of sorted) {
    const riskColor = RISK_CONFIG[m.riskLevel].clauseHighlight;
    const isActive = m.clauseId === selectedMarkupId;
    const candidates = highlightMatchCandidates(m.original);
    let injected = false;

    // Strategies 1–3 against the raw original, then a Markdown-stripped
    // variant so headings like `**5. Sole and Exclusive Remedy** …` can match
    // the rendered `<strong>` / heading HTML.
    for (const candidate of candidates) {
      const spanHtml = buildHighlightSpan(m.clauseId, riskColor, isActive, candidate);
      const after = tryInjectHighlight(html, candidate, spanHtml);
      if (after !== null) {
        html = after;
        injected = true;
        break;
      }
    }
    if (injected) continue;

    // Strategy 4: overlap/subset registration — when the text is already inside
    // a larger highlighted span, register this clauseId as a secondary attribute
    // so the document viewer can still scroll to it when navigating to this finding
    for (const candidate of candidates) {
      const after4 = tryRegisterOnExistingSpan(html, candidate, m.clauseId);
      if (after4 !== null) {
        html = after4;
        injected = true;
        break;
      }
    }
    if (injected) continue;

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
