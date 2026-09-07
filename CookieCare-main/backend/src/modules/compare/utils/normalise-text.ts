/**
 * normalise-text.ts
 *
 * Lightweight deterministic text-cleaning utilities shared across pipeline steps.
 * No LLM involvement — pure string transforms.
 */

/**
 * Returns true when a line looks like a clause/heading boundary that the
 * segmenter needs to detect. Matching these patterns here prevents the
 * line-rejoin pass below from merging a heading line into the preceding body.
 *
 * Mirrors the regexes in clause-boundaries.ts exactly — any change there
 * must be reflected here.
 */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // NUMERIC_HEADING:  "1.", "1.1", "1.1.1" followed by text (with or without
  // whitespace between the separator and the body — PDFs sometimes emit
  // "1.3.3.it becomes…" with no space after the dot).
  if (/^(\d+(?:\.\d+)*)\s*[.)](\s+\S|\S)/.test(t)) return true;
  // KEYWORD_HEADING:  "Article 3", "Section 4", "Clause 2", etc.
  if (/^(article|section|clause|schedule|exhibit|annex|appendix)\s+(\d+[a-z]?|\w+)\b/i.test(t)) return true;
  // ALL_CAPS_HEADING: "INDEMNIFICATION", "DATA PROTECTION ANNEX"
  if (/^[A-Z][A-Z\s\-]{3,}$/.test(t)) return true;
  // BOLD_HEADING: **Heading**
  if (/^\*\*[^*]+\*\*\s*$/.test(t)) return true;
  // SUBCLAUSE_HEADING: "(a) text", "(i) text" — lowercase only (no i flag).
  // Uppercase acronyms like (EU), (UK), (EEA) must NOT be treated as headings.
  if (/^\(([a-z]{1,4}|[ivxlc]+)\)\s+\S/.test(t)) return true;
  return false;
}

/**
 * Strip null bytes, normalise line endings, collapse runs of more than two
 * consecutive blank lines to a single blank line, trim leading/trailing
 * whitespace, and rejoin visual PDF line-wraps inside body paragraphs.
 *
 * The reflow pass is conservative:
 *   A `\n` is replaced with a single space ONLY when ALL of the following hold:
 *     1. Neither the current line nor the next line is empty (blank lines are
 *        real paragraph separators — never touched).
 *     2. Neither the current line nor the next line looks like a heading
 *        boundary (so heading detection in the segmenter is not disrupted).
 *     3. The current line does NOT end with a sentence-terminating character
 *        (`.`, `?`, `!`, `:`, `;`) — those are paragraph/sentence endings.
 *     4. The next line does NOT start with an uppercase letter immediately
 *        followed by a lowercase letter, which is a strong indicator of a new
 *        sentence rather than a continuation.
 *
 * NOTE: Rule 1b (bare numeric marker + next-line merge) has been intentionally
 * removed. After the two-pass structure-aware extraction in extractText.ts,
 * clause markers arrive with their correct body text immediately following them.
 * A standalone marker line must remain standalone so the segmenter can detect
 * it as a proper heading boundary. Merging it forward produced malformed
 * headings such as "3.6. suspects that a Data Security Breach..." when the
 * extraction placed a body fragment after the marker due to PDF re-saving.
 */
export function normaliseExtractedText(raw: string): string {
  const stage1 = raw
    .replace(/\0/g, "")           // null bytes (common in PDF extraction)
    .replace(/\r\n/g, "\n")       // CRLF → LF
    .replace(/\r/g, "\n")         // standalone CR → LF
    .replace(/\n{3,}/g, "\n\n")   // collapse excessive blank lines
    .trim();

  // ── Reflow pass: rejoin visual PDF line-wraps inside body paragraphs ──────
  const lines = stage1.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1]; // may be undefined at end of array

    // Always push the current line first
    out.push(cur);

    // If there is no next line, nothing to decide
    if (next === undefined) break;

    // Rule 1: blank lines are always real separators — keep as-is
    if (cur.trim() === "" || next.trim() === "") continue;

    // Rule 2: if either line looks like a heading boundary, preserve the break
    if (looksLikeHeading(cur) || looksLikeHeading(next)) continue;

    // Rule 3: if the current line ends with sentence-terminal punctuation,
    // it is the end of a sentence — preserve the break
    if (/[.?!;:]$/.test(cur.trimEnd())) continue;

    // Rule 4: if the next line starts with an uppercase letter followed by
    // a lowercase letter (e.g. "The Supplier shall…"), it is likely a new
    // sentence
    if (/^[A-Z][a-z]/.test(next.trimStart())) continue;

    // All guards passed — this looks like a visual word-wrap.
    // Merge the next line into the current by emitting a space instead of \n.
    out.pop();
    out.push(cur + " " + next.trimStart());
    i += 1; // skip next line — it has been consumed
  }

  return out.join("\n");
}

/**
 * Count words in a string using a simple whitespace-split heuristic.
 * Used to populate DocumentMeta.wordCount.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Detect the dominant natural language from a text sample.
 *
 * This is a deliberate minimal implementation: it checks for a small set of
 * high-frequency English stop words and falls back to "unknown".  It is
 * intentionally not a full language-detection library — the only purpose is
 * to flag clearly non-English documents in DocumentMeta so the UI can surface
 * a warning.  The LLM handles multilingual text natively; this is metadata only.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000).toLowerCase();
  const englishMarkers = ["the ", "and ", "of ", "to ", "in ", "that ", "this "];
  const matchCount = englishMarkers.filter((w) => sample.includes(w)).length;
  if (matchCount >= 4) return "en";

  // French markers
  const frenchMarkers = ["le ", "la ", "les ", "de ", "du ", "et ", "que "];
  const frCount = frenchMarkers.filter((w) => sample.includes(w)).length;
  if (frCount >= 4) return "fr";

  // German markers
  const germanMarkers = ["der ", "die ", "das ", "und ", "ist ", "von ", "zu "];
  const deCount = germanMarkers.filter((w) => sample.includes(w)).length;
  if (deCount >= 4) return "de";

  return "unknown";
}
