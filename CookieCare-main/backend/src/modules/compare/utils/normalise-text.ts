/**
 * normalise-text.ts
 *
 * Lightweight deterministic text-cleaning utilities shared across pipeline steps.
 * No LLM involvement — pure string transforms.
 */

/**
 * Strip null bytes, normalise line endings, collapse runs of more than two
 * consecutive blank lines to a single blank line, and trim leading/trailing
 * whitespace.
 *
 * This is the minimum hygiene pass applied to every extracted text before any
 * further processing.
 */
export function normaliseExtractedText(raw: string): string {
  return raw
    .replace(/\0/g, "")                     // null bytes (common in PDF extraction)
    .replace(/\r\n/g, "\n")                 // CRLF → LF
    .replace(/\r/g, "\n")                   // standalone CR → LF
    .replace(/\n{3,}/g, "\n\n")             // collapse excessive blank lines
    .trim();
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
