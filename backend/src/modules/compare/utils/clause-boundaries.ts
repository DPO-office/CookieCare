/**
 * clause-boundaries.ts
 *
 * Deterministic clause segmentation via regex and heuristics.
 * No LLM involvement — this is pure structural parsing.
 *
 * Strategy (applied in order, first match wins per line):
 *
 * 1. Numbered clauses:   "1.", "1.1", "1.1.1", "Article 1", "Section 1",
 *                        "CLAUSE 1", "(a)", "(i)"
 * 2. Lettered recital paragraphs: "A.", "B.", "C." (single/double uppercase
 *    letter followed by dot and space, at line start)
 * 3. All-caps headings:  "INDEMNIFICATION", "LIMITATION OF LIABILITY"
 * 4. Bold-markdown:      "**Confidentiality**"
 * 5. Blank-line delimited paragraphs (fallback for unstructured documents)
 *
 * Returns an array of raw segment objects that Step 2 (structure-extract)
 * will convert into ExtractedClause instances.
 */

export interface RawSegment {
  /** Detected heading text; empty string if no heading was found */
  heading: string;
  /** Full body text of the segment (heading + paragraph text) */
  text: string;
  /** Character offset of the segment start in the source text */
  position: number;
  /** Ordered ancestor labels, e.g. ["3", "3.2"] */
  sectionPath: string[];
}

// ─── Heading detection regexes (ordered by specificity) ──────────────────────

/**
 * Numeric: 1.  /  1.1  /  1.1.1  /  1.1.1.1
 *
 * The inline title is optional and may be separated from the numeric label
 * by zero or more spaces — PDFs sometimes emit "1.3.3.it becomes aware…"
 * with no whitespace between the separator dot and the body text.
 *
 * Capture groups:
 *   m[1] — the numeric label,    e.g. "1.3.3"
 *   m[2] — the inline title text (trimmed by caller), e.g. "it becomes aware…"
 *           absent when the heading is a bare "1.3.3." with nothing after it.
 */
const NUMERIC_HEADING = /^(\d+(?:\.\d+)*)\s*[.)](\s+(.+)|\S.*)?$/;

/** Article / Section / Clause / Schedule keywords */
const KEYWORD_HEADING =
  /^(article|section|clause|schedule|exhibit|annex|appendix)\s+(\d+[a-z]?|\w+)\b[.:]?\s*(.*)/i;

/**
 * Lettered recital paragraph: "A.", "B.", "C.", "AA.", "BB.", etc.
 *
 * Matches a line that begins with one or two uppercase ASCII letters
 * immediately followed by a period and at least one space, then substantive
 * text.  This covers the standard legal preamble / whereas-clause convention:
 *
 *   A. This Data Protection Annex forms part of the Agreement…
 *   B. The Supplier has been engaged…
 *
 * The constraint "one or two uppercase letters only" prevents false matches
 * on all-caps heading continuations, acronyms inside sentences, or table
 * cells.  The requirement for text after the period+space means a bare "A."
 * on its own line (which might be a list artefact) does NOT match.
 *
 * This is intentionally placed AFTER NUMERIC_HEADING so that numeric labels
 * like "1.", "1.1." are handled first and do not fall through to this rule.
 */
const LETTERED_PARA_HEADING = /^([A-Z]{1,2})\.\s+(.+)/;

/** All-caps heading (at least 4 chars, may contain spaces) */
const ALL_CAPS_HEADING = /^([A-Z][A-Z\s\-]{3,})$/;

/** Bold markdown heading: **Heading Text** */
const BOLD_HEADING = /^\*\*([^*]+)\*\*\s*$/;

/**
 * Sub-clause: (a)  (b)  (i)  (ii)  (iii)  (iv)  (xiv) …
 *
 * Intentionally NOT case-insensitive (no `i` flag).
 *
 * Legal sub-clause labels are always written in lowercase: (a), (b), (i), (ii).
 * Uppercase-in-parens like (EU), (UK), (EEA), (GDPR) are acronyms embedded
 * in sentence text.  When PDF reflow places one at line start, it must NOT
 * trigger a segment boundary.  Removing the `i` flag is the minimal safe fix:
 * lowercase (a)–(z) and (i)–(xiv) still match; uppercase acronyms do not.
 */
const SUBCLAUSE_HEADING = /^\(([a-z]{1,4}|[ivxlc]+)\)\s+(.+)/;

// ─── Section path helpers ─────────────────────────────────────────────────────

/**
 * Given a numeric label such as "3.2.1" produce the path ["3", "3.2", "3.2.1"].
 */
function numericPath(label: string): string[] {
  const parts = label.split(".");
  return parts.map((_, i) => parts.slice(0, i + 1).join("."));
}

/**
 * Detect whether a line is a clause heading and, if so, return the heading text
 * and section path.  Returns null when the line is body text.
 *
 * The `parentNumericLabel` parameter is the most-recently-seen top-level
 * numeric label (e.g. "1", "1.2").  Sub-clause headings use it to build a
 * composite sectionPath such as ["1", "(a)"] rather than the bare ["(a)"].
 * This gives the deterministic matcher enough context to distinguish `(A)`
 * under section 1 from `(A)` under section 2.
 */
function detectHeading(
  line: string,
  parentNumericLabel: string | null
): { heading: string; sectionPath: string[]; isNumeric: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let m: RegExpMatchArray | null;

  m = trimmed.match(NUMERIC_HEADING);
  if (m) {
    const label = m[1];
    const title = (m[2] ?? "").trim();  // title may be absent on standalone heading lines
    return {
      heading: title ? `${label}. ${title}` : `${label}.`,
      sectionPath: numericPath(label),
      isNumeric: true,
    };
  }

  m = trimmed.match(KEYWORD_HEADING);
  if (m) {
    const keyword = m[1].toLowerCase();
    const number  = m[2];
    const rest    = m[3].trim();

    // ── Fix 2: Reject body text masquerading as a keyword heading ────────────
    //
    // PDF reflow can produce lines like:
    //   "Clause 7 (Docking clause) shall not apply;a."
    // where a body sentence referencing a clause number appears at line start.
    // Real clause headings never contain a semicolon in their title text.
    // A semicolon in `rest` is a reliable signal that this is body text, not
    // a structural heading boundary.
    if (rest.includes(";")) return null;

    // ── Fix 3: Normalised Annex sectionPath ───────────────────────────────────
    //
    // PDF re-saving can change the presentation of Annex sub-identifiers:
    //   "Annex I.B (Description of Transfer)..."  →  sectionPath ["annex i b"]
    //   "Annex I B (Description of Transfer)..."  →  sectionPath ["annex i b"]
    //
    // By stripping internal dots from the identifier and collapsing whitespace
    // to a single space (all lowercase), both forms produce an identical
    // sectionPath.  This lets the deterministic matcher (Tier 4 normalised title)
    // match them without LLM involvement.
    //
    // Crucially, "Annex I.B" and "Annex I.C" remain distinct because their
    // full normalised keys differ ("annex i b …" vs "annex i c …").
    //
    // Scope: only applies to annex/schedule/appendix/exhibit — numeric-labelled
    // keywords (article/section/clause) are left unchanged.
    const annexKeywords = new Set(["annex", "schedule", "appendix", "exhibit"]);
    if (annexKeywords.has(keyword)) {
      // Build a normalised short key: keyword + number + first sub-letter if present
      // e.g. "Annex I.B ..." → "annex i.b..." → normalise → "annex ib"
      //      "Annex I B ..."                   → normalise → "annex ib"
      //      "Annex II ..."  → "annex ii"
      const rawKey   = `${keyword} ${number} ${rest}`;
      // Remove dots, collapse whitespace, lowercase — this is the path key
      const normKey  = rawKey
        .replace(/\./g, " ")   // dots → spaces (I.B → I B)
        .replace(/\s+/g, " ")  // collapse multiple spaces
        .toLowerCase()
        .trim();
      // Keep only the first 40 chars to avoid pathologically long sectionPaths
      // while still distinguishing I.B from I.C from II etc.
      const pathKey  = normKey.slice(0, 40).trim();

      const heading  = rest ? `${keyword} ${number} ${rest}` : `${keyword} ${number}`;
      return {
        heading: heading.trim(),
        sectionPath: [pathKey],
        isNumeric: false,
      };
    }

    // Non-annex keyword headings: existing behaviour unchanged
    const heading = rest ? `${keyword} ${number} ${rest}` : `${keyword} ${number}`;
    return { heading: heading.trim(), sectionPath: [heading.trim()], isNumeric: false };
  }

  // Lettered recital paragraph (A., B., C., AA., BB. …)
  // Must be checked BEFORE ALL_CAPS_HEADING so that "A. This Annex…" is
  // detected as a lettered paragraph, not an all-caps heading artefact.
  m = trimmed.match(LETTERED_PARA_HEADING);
  if (m) {
    const letter = m[1];
    const body = m[2].trim();

    // Roman list markers introducing an Annex/Schedule are annex headings,
    // not recitals.  "IV. Annex II (…)" must share a path with "annex II (…)"
    if (
      /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/.test(letter) &&
      /^(annex|schedule|appendix|exhibit)\b/i.test(body)
    ) {
      const annex = body.match(/^(annex|schedule|appendix|exhibit)\s+(\d+[a-z]?|\w+)\b[.:]?\s*(.*)/i);
      if (annex) {
        const keyword = annex[1].toLowerCase();
        const number = annex[2];
        const rest = (annex[3] ?? "").trim();
        const rawKey = `${keyword} ${number} ${rest}`;
        const pathKey = rawKey
          .replace(/\./g, " ")
          .replace(/\s+/g, " ")
          .toLowerCase()
          .trim()
          .slice(0, 40)
          .trim();
        const heading = rest ? `${keyword} ${number} ${rest}` : `${keyword} ${number}`;
        return { heading: heading.trim(), sectionPath: [pathKey], isNumeric: false };
      }
    }

    const heading = `${letter}. ${body}`;
    return { heading, sectionPath: [letter], isNumeric: false };
  }

  m = trimmed.match(ALL_CAPS_HEADING);
  if (m) {
    return { heading: m[1].trim(), sectionPath: [m[1].trim()], isNumeric: false };
  }

  m = trimmed.match(BOLD_HEADING);
  if (m) {
    return { heading: m[1].trim(), sectionPath: [m[1].trim()], isNumeric: false };
  }

  m = trimmed.match(SUBCLAUSE_HEADING);
  if (m) {
    const letter = m[1].toLowerCase();
    const label = `(${letter})`;
    const heading = `${label} ${m[2].trim()}`;
    // If we have a numeric parent, build the composite path: ["1", "(a)"].
    // Otherwise fall back to the bare label as before.
    const sectionPath = parentNumericLabel
      ? [parentNumericLabel, label]
      : [label];
    return { heading, sectionPath, isNumeric: false };
  }

  return null;
}

// ─── Blank-line sub-splitting ─────────────────────────────────────────────────

/**
 * Minimum character length for a blank-line-split sub-paragraph to be kept
 * as a standalone segment rather than merged back with the previous content.
 *
 * This prevents single-word fragments, page numbers, or short artefacts from
 * becoming their own clauses.  40 chars is the same as MIN_CLAUSE_CHARS in
 * structure-extract.ts — sub-paragraphs shorter than this are never useful
 * comparison units.
 */
const MIN_SUBPARA_CHARS = 40;

/** Sentence complete (not a list intro). */
const SENTENCE_END_RE = /[.!?]$/;
/** Parent clause introducing a numbered list. */
const LIST_INTRO_RE = /[:;]$/;

function looksLikeClauseOpeningText(s: string): boolean {
  return /^(The|This|If|Each|Where|When|For|In|Any|No|Not|Subject|Notwithstanding|A|An)\b/.test(
    s.trim()
  );
}

/**
 * Pattern A — a numeric marker at line start is not a heading when it sits
 * inside an incomplete sentence (PDF wrap / displaced marker).
 *
 * Not applied when the previous line ends with ":" / ";" (genuine nested
 * list) or ".!?" (genuine next clause).
 */
function previousAllowsNewNumericHeading(previousLine: string): boolean {
  const prev = previousLine.trim();
  if (!prev) return true;
  if (LIST_INTRO_RE.test(prev)) return true;
  if (SENTENCE_END_RE.test(prev)) return true;
  const body = prev.replace(/^\d+(?:\.\d+)*\s*[.)]\s*/, "").trim();
  if (!/[A-Za-z]{3,}/.test(body)) return true;
  const words = body.split(/\s+/).filter(Boolean);
  const hasFiniteVerb =
    /\b(shall|must|will|may|agrees|ensures|means|includes)\b/i.test(body);
  // Short noun-phrase titles ("Compliance monitoring and audit") can start a
  // numbered section; they are not incomplete sentences.
  if (words.length <= 8 && !hasFiniteVerb) return true;
  if (/\b(the|a|an|that|which|of|to|and|or|for|with|by|as)\s*$/i.test(body)) {
    return false;
  }
  return !hasFiniteVerb;
}

function isWrapLeftoverTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (looksLikeClauseOpeningText(t)) return false;
  if (/[.!?]$/.test(t) && !LIST_INTRO_RE.test(t)) return false;
  const head = t.split(/[.!?]/)[0] ?? t;
  if (!head.includes(",")) return false;
  return head.split(/\s+/).filter(Boolean).length > 3;
}

function isContinuationNumericHeading(
  line: string,
  previousLine: string
): boolean {
  const prev = previousLine.trim();
  if (LIST_INTRO_RE.test(prev)) return false;

  const m = line.trim().match(NUMERIC_HEADING);
  if (!m) return false;
  const title = (m[2] ?? "").trim();
  if (isWrapLeftoverTitle(title)) return true;
  if (/^[a-z]/.test(title)) return true;
  if (previousAllowsNewNumericHeading(previousLine)) return false;
  if (!title) return true;
  if (/^[A-Z][A-Za-z'’]*,/.test(title)) return true;
  if (looksLikeClauseOpeningText(title)) return false;
  // Incomplete previous line + title that is not a clause opener = wrap/bleed,
  // even when the title is short ("Randstad Digital's behalf…").
  return true;
}

/**
 * Pattern B — standalone numeric fragments such as "4.", "11.", "[5]"
 * with no real body. Not used for short-but-real clauses that have a title.
 */
function isNumericStubSegment(seg: RawSegment): boolean {
  const heading = (seg.heading || "").trim();
  const full = seg.text.trim();
  if (/^\[\d{1,4}\]$/.test(full) || /^\d{1,4}\.?$/.test(full)) return true;

  // Only bare numeric labels ("4.", "11.") — never titled clauses ("3.9. Notices…").
  if (!/^\d+(?:\.\d+)*\.$/.test(heading)) return false;

  let body = full;
  if (body.startsWith(heading)) body = body.slice(heading.length).trim();
  if (body.length === 0) return true;
  const compact = body.replace(/\s+/g, "");
  return compact.length < 12 && /^\[?\d{1,4}\]?\.?$/.test(compact);
}

function dropNumericStubs(segments: RawSegment[]): RawSegment[] {
  return segments.filter((s) => !isNumericStubSegment(s));
}

function numericLabelOf(seg: RawSegment): string | null {
  const last = seg.sectionPath[seg.sectionPath.length - 1];
  if (last && /^\d+(?:\.\d+)*$/.test(last)) return last;
  const m = (seg.heading || "").match(/^(\d+(?:\.\d+)*)[.)]/);
  return m ? m[1] : null;
}

function labelNumbers(label: string): number[] | null {
  if (!/^\d+(?:\.\d+)*$/.test(label)) return null;
  return label.split(".").map((n) => Number(n));
}

function isSequentialSuccessor(current: string, found: string): boolean {
  const a = labelNumbers(current);
  const b = labelNumbers(found);
  if (!a || !b) return false;
  if (b.length === a.length) {
    return a.slice(0, -1).every((n, i) => n === b[i]) && b[b.length - 1] > a[a.length - 1];
  }
  if (b.length === a.length + 1) {
    return a.every((n, i) => n === b[i]);
  }
  return false;
}

function nextSiblingLabel(label: string): string | null {
  const a = labelNumbers(label);
  if (!a || a.length === 0) return null;
  const next = [...a];
  next[next.length - 1] += 1;
  return next.join(".");
}

function peelOperativeTail(seg: RawSegment, newLabel: string): RawSegment[] | null {
  const split = firstSentenceSplit(seg.text);
  if (!split) return null;

  const re = /(?:^|\n)(?=(?:If|Where|When|Each|The)\b)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(split.tail))) {
    // Zero-width lookahead matches do not advance lastIndex; force progress.
    if (m.index === re.lastIndex) re.lastIndex += 1;
    const fromOpening = split.tail.slice(m.index).trim();
    if (!isOperativeOpening(fromOpening)) continue;
    const before = split.tail.slice(0, m.index).trim();
    const head = (split.head + (before ? `\n${before}` : "")).trim();
    if (head.length < 40) continue;
    return [
      { ...seg, text: head },
      makeNumericSegment(newLabel, fromOpening, seg.position + head.length + 1),
    ];
  }
  return null;
}

function fullyPeelSuccessors(seg: RawSegment): RawSegment[] {
  const out: RawSegment[] = [];
  let cur = seg;
  const seen = new Set<string>();
  while (true) {
    const label = numericLabelOf(cur);
    // Only dotted labels (6.1 → 6.2). Top-level "6" / "14" must not emit
    // phantom 7 / 15 from later obligation sentences in the same article.
    const expected =
      label && label.includes(".") ? nextSiblingLabel(label) : null;
    if (!label || !expected || seen.has(expected)) {
      out.push(cur);
      break;
    }
    seen.add(expected);
    const peeled = peelOperativeTail(cur, expected);
    if (!peeled) {
      out.push(cur);
      break;
    }
    out.push(peeled[0]);
    cur = peeled[1];
  }
  return out;
}

function splitInternalSuccessors(seg: RawSegment): RawSegment[] {
  const label = numericLabelOf(seg);
  if (!label) return [seg];
  const text = seg.text;
  const re = /(?:^|\n)(\d+(?:\.\d+)*)\s*[.)]\s+/g;
  const cuts: { index: number; label: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index === 0) continue;
    const found = m[1];
    if (!isSequentialSuccessor(label, found)) continue;
    const lineStart = text[m.index] === "\n" ? m.index + 1 : m.index;
    const line = text.slice(lineStart).split("\n")[0] ?? "";
    const before = text.slice(0, lineStart);
    const prevLine = before.split("\n").filter((l) => l.trim()).pop() ?? "";
    if (isContinuationNumericHeading(line, prevLine)) continue;
    cuts.push({ index: lineStart, label: found });
  }
  if (cuts.length === 0) return fullyPeelSuccessors(seg);

  const parts: RawSegment[] = [];
  let prevIdx = 0;
  let prevLabel = label;
  for (const cut of cuts) {
    const chunk = text.slice(prevIdx, cut.index).trim();
    if (chunk) {
      const piece =
        prevIdx === 0
          ? { ...seg, text: chunk }
          : makeNumericSegment(prevLabel, chunk, seg.position + prevIdx);
      parts.push(...fullyPeelSuccessors(piece));
    }
    prevIdx = cut.index;
    prevLabel = cut.label;
  }
  const lastChunk = text.slice(prevIdx).trim();
  if (lastChunk) {
    parts.push(
      ...fullyPeelSuccessors(
        makeNumericSegment(prevLabel, lastChunk, seg.position + prevIdx)
      )
    );
  }
  return parts.length > 0 ? parts : [seg];
}

function resegmentAbsorbedNumericClauses(segments: RawSegment[]): RawSegment[] {
  return segments.flatMap(splitInternalSuccessors);
}

function isOperativeOpening(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (
    /^(In addition|Furthermore|Moreover|For the avoidance|On request|Where applicable|If applicable|To the extent)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (/^(If|Where|When|Each)\b/.test(t)) return true;
  return (
    /^The\b/.test(t) &&
    /\b(shall|will|must|may|agrees|is entitled)\b/i.test(t.slice(0, 140))
  );
}

function firstSentenceSplit(text: string): { head: string; tail: string } | null {
  const m = text.match(/[.!?](?:[ \t]+|\n+)(?=[A-Z(])/);
  if (!m || m.index === undefined) return null;
  const cut = m.index + 1;
  const head = text.slice(0, cut).trim();
  const tail = text.slice(cut).trim();
  if (!head || !tail) return null;
  return { head, tail };
}

function makeNumericSegment(
  label: string,
  text: string,
  position: number
): RawSegment {
  const first = text.split("\n")[0]?.trim() ?? text;
  const heading = first.length > 0 ? first : `${label}.`;
  return {
    heading,
    text: text.trim(),
    position,
    sectionPath: numericPath(label),
  };
}

/**
 * Split the accumulated body text of a non-numeric, non-lettered heading
 * segment into sub-paragraphs on blank lines (`\n\n`).
 *
 * Purpose: when an unstructured preamble block (e.g. DATA PROTECTION ANNEX
 * body) contains a standalone inserted paragraph — such as a test sentence
 * that exists only in the Modified document — splitting on blank lines lets
 * that paragraph become its own segment.  The diff engine can then classify
 * it as ADDED rather than swallowing it inside a large preamble diff.
 *
 * This function is ONLY called for segments under ALL_CAPS or non-numeric,
 * non-lettered headings (i.e. the preamble / recital section).  It is NOT
 * applied to numbered or lettered-paragraph bodies because those have their
 * own structural heading boundaries and splitting them would fragment clauses.
 *
 * Conservative rules applied to each candidate sub-paragraph:
 *   - Must be at least MIN_SUBPARA_CHARS characters (skip noise fragments).
 *   - If it looks like a heading itself (detectHeading fires on its first
 *     line), it will be caught by the main segmenter on the next pass and
 *     should not be emitted here — skip it.
 *   - At most one level of splitting (no recursive sub-splitting).
 *
 * Returns the body split into sub-paragraphs, each as a plain string.
 * If the body has no blank-line boundaries or all sub-paras are too short,
 * returns an array containing the single original body string.
 */
function splitBodyOnBlankLines(body: string): string[] {
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length >= MIN_SUBPARA_CHARS);
  if (paras.length <= 1) return [body]; // nothing to split
  return paras;
}

// ─── Main segmentation function ───────────────────────────────────────────────

/**
 * Split a normalised document text into raw segments.
 *
 * @param text  Clean document text (already passed through normaliseExtractedText)
 */
export function segmentIntoRawClauses(text: string): RawSegment[] {
  // ── Pre-split: insert \n before mid-line numeric headings ─────────────────
  //
  // PDF extraction sometimes concatenates the last line of one clause body
  // directly with the start of the next numbered heading, especially across
  // page breaks or column joins. For example:
  //
  //   "...limitation the GDPR. 1.2. The Supplier shall only Process..."
  //
  // Without this pass, detectHeading never sees "1.2." at line-start so the
  // clause is swallowed into the previous segment.
  //
  // Strategy: insert \n before a digit-dot sequence ONLY when it is preceded
  // by sentence-ending punctuation (. ; : ! ?). This avoids false splits on:
  //   - body references: "Article 32.1. The applicable..." (no punct before "32")
  //   - version numbers: "Version 1.2. The document..."   (no punct before "1")
  const splitText = text
    .replace(
      /([.;:!?])(\s+)(\d+(?:\.\d+)*\s*[.)]\s*\S)/g,
      (_match, punct: string, _space: string, heading: string) => `${punct}\n${heading}`
    )
    .replace(
      /(?<!\b(?:clause|article|section|paragraph|schedule|annex|art)\s)(?<=\s)(\d+(?:\.\d+)*\s*[.)]\s+)(The|This|If|Each|Where)\b/gi,
      "\n$1$2"
    );

  const lines = splitText.split("\n");

  const segments: RawSegment[] = [];

  let currentHeading = "";
  let currentSectionPath: string[] = [];
  let currentLines: string[] = [];
  let currentPosition = 0;
  let charOffset = 0;

  /**
   * Track whether the current open segment is a preamble/all-caps section
   * (DATA PROTECTION ANNEX, SCHEDULE, etc.) whose body should be sub-split
   * on blank lines.  Lettered, numeric, and sub-clause segments are NOT
   * sub-split — they accumulate naturally up to the next heading line.
   */
  let currentIsAllCaps = false;

  /**
   * The deepest numeric label seen so far, e.g. "1" or "1.2".
   * Used to qualify lettered sub-clause paths: (A) under 1. → ["1", "(a)"].
   * Reset to null when a non-numeric top-level heading is encountered
   * (ALL_CAPS, KEYWORD, BOLD) so sub-clauses that genuinely have no numeric
   * parent don't inherit an unrelated parent label.
   */
  let currentNumericParent: string | null = null;

  const flush = () => {
    // Build body from lines AFTER the heading line (currentLines[0] is the raw
    // heading line itself; the normalised heading is stored in currentHeading).
    const bodyLines = currentLines.slice(1);
    const body = bodyLines.join("\n").trim();

    if (body.length > 0 || currentHeading) {
      const segBody = body.length > 0 ? body : "";

      if (currentIsAllCaps && segBody.length > 0) {
        // Sub-split the preamble body on blank lines so standalone inserted
        // paragraphs (e.g. a cat sentence) can become independent segments.
        const subParas = splitBodyOnBlankLines(segBody);

        if (subParas.length > 1) {
          // First sub-paragraph is emitted under the all-caps heading.
          segments.push({
            heading: currentHeading,
            text: currentHeading ? `${currentHeading}\n${subParas[0]}` : subParas[0],
            position: currentPosition,
            sectionPath: [...currentSectionPath],
          });
          // Remaining sub-paragraphs become headless segments (sectionPath []).
          // structure-extract gives them a "Clause N" title, making them
          // individually alignable so an ADDED paragraph can be detected.
          let subOffset = currentPosition + subParas[0].length + 2; // approx
          for (let si = 1; si < subParas.length; si++) {
            segments.push({
              heading: "",
              text: subParas[si],
              position: subOffset,
              sectionPath: [],
            });
            subOffset += subParas[si].length + 2;
          }
          return; // already pushed
        }
      }

      // Standard (numeric / lettered / keyword / bold / sub-clause) segment
      segments.push({
        heading: currentHeading,
        text: currentHeading
          ? (segBody ? `${currentHeading}\n${segBody}` : currentHeading)
          : segBody,
        position: currentPosition,
        sectionPath: [...currentSectionPath],
      });
    }
  };

  for (const line of lines) {
    const lineLength = line.length + 1; // +1 for the \n
    const detected = detectHeading(line, currentNumericParent);

    if (detected) {
      const prevNonEmpty =
        [...currentLines].reverse().find((l) => l.trim().length > 0) ?? "";
      if (
        detected.isNumeric &&
        isContinuationNumericHeading(line, prevNonEmpty)
      ) {
        currentLines.push(line);
        charOffset += lineLength;
        continue;
      }

      // Save the current accumulation before starting a new segment
      flush();
      currentHeading = detected.heading;
      currentSectionPath = detected.sectionPath;
      currentLines = [line];
      currentPosition = charOffset;

      // Track whether the new segment is an all-caps structural heading.
      // Lettered paragraphs (A., B.) use isNumeric=false but should NOT be
      // sub-split — only pure ALL_CAPS headings get the blank-line treatment.
      const isAllCapsHeading = ALL_CAPS_HEADING.test(line.trim());
      currentIsAllCaps = isAllCapsHeading;

      if (detected.isNumeric) {
        currentNumericParent = detected.sectionPath[detected.sectionPath.length - 1];
        currentIsAllCaps = false;
      } else if (LETTERED_PARA_HEADING.test(line.trim())) {
        // Lettered paragraph: inherit numeric parent for sub-clause context,
        // but do not reset it (sibling lettered paras share context).
        // Do NOT sub-split lettered paragraph bodies.
        currentIsAllCaps = false;
      } else if (!SUBCLAUSE_HEADING.test(line.trim())) {
        // Non-numeric, non-lettered, non-subclause heading: reset parent
        currentNumericParent = null;
      }
      // Sub-clause: currentNumericParent stays as-is (shared across siblings)
    } else {
      currentLines.push(line);
    }

    charOffset += lineLength;
  }

  // Flush the last accumulated segment
  flush();

  return dropNumericStubs(resegmentAbsorbedNumericClauses(segments));
}

/**
 * Fallback: when the structured segmentation yields fewer than 2 segments
 * (unstructured wall-of-text documents), fall back to fixed-size chunking.
 *
 * Produces numbered positional segments with no heading.
 */
export function chunkByParagraphs(text: string, maxChunkChars = 1200): RawSegment[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 20);
  const segments: RawSegment[] = [];
  let charOffset = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    segments.push({
      heading: "",
      text: para,
      position: charOffset,
      sectionPath: [],
    });
    charOffset += para.length + 2; // approximate for the \n\n
  }

  return segments;
}
