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
 * 2. All-caps headings:  "INDEMNIFICATION", "LIMITATION OF LIABILITY"
 * 3. Bold-markdown:      "**Confidentiality**"
 * 4. Blank-line delimited paragraphs (fallback for unstructured documents)
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

/** Numeric: 1.  /  1.1  /  1.1.1  /  1.1.1.1 */
const NUMERIC_HEADING = /^(\d+(?:\.\d+)*)\s*[.)]\s+(.+)/;

/** Article / Section / Clause / Schedule keywords */
const KEYWORD_HEADING =
  /^(article|section|clause|schedule|exhibit|annex|appendix)\s+(\d+[a-z]?|\w+)\b[.:]?\s*(.*)/i;

/** All-caps heading (at least 4 chars, may contain spaces) */
const ALL_CAPS_HEADING = /^([A-Z][A-Z\s\-]{3,})$/;

/** Bold markdown heading: **Heading Text** */
const BOLD_HEADING = /^\*\*([^*]+)\*\*\s*$/;

/** Sub-clause: (a)  (i)  (ii) */
const SUBCLAUSE_HEADING = /^\(([a-z]{1,4}|[ivxlc]+)\)\s+(.+)/i;

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
 */
function detectHeading(
  line: string
): { heading: string; sectionPath: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let m: RegExpMatchArray | null;

  m = trimmed.match(NUMERIC_HEADING);
  if (m) {
    const label = m[1];
    const title = m[2].trim();
    return { heading: `${label}. ${title}`, sectionPath: numericPath(label) };
  }

  m = trimmed.match(KEYWORD_HEADING);
  if (m) {
    const keyword = m[1];
    const number = m[2];
    const rest = m[3].trim();
    const heading = rest ? `${keyword} ${number} ${rest}` : `${keyword} ${number}`;
    return { heading: heading.trim(), sectionPath: [heading.trim()] };
  }

  m = trimmed.match(ALL_CAPS_HEADING);
  if (m) {
    return { heading: m[1].trim(), sectionPath: [m[1].trim()] };
  }

  m = trimmed.match(BOLD_HEADING);
  if (m) {
    return { heading: m[1].trim(), sectionPath: [m[1].trim()] };
  }

  m = trimmed.match(SUBCLAUSE_HEADING);
  if (m) {
    const label = `(${m[1]})`;
    return { heading: `${label} ${m[2].trim()}`, sectionPath: [label] };
  }

  return null;
}

// ─── Main segmentation function ───────────────────────────────────────────────

/**
 * Split a normalised document text into raw segments.
 *
 * @param text  Clean document text (already passed through normaliseExtractedText)
 */
export function segmentIntoRawClauses(text: string): RawSegment[] {
  const lines = text.split("\n");
  const segments: RawSegment[] = [];

  let currentHeading = "";
  let currentSectionPath: string[] = [];
  let currentLines: string[] = [];
  let currentPosition = 0;
  let charOffset = 0;

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (body.length > 0) {
      segments.push({
        heading: currentHeading,
        text: currentHeading
          ? `${currentHeading}\n${body}`
          : body,
        position: currentPosition,
        sectionPath: [...currentSectionPath],
      });
    }
  };

  for (const line of lines) {
    const lineLength = line.length + 1; // +1 for the \n
    const detected = detectHeading(line);

    if (detected) {
      // Save the current accumulation before starting a new segment
      flush();
      currentHeading = detected.heading;
      currentSectionPath = detected.sectionPath;
      currentLines = [line];
      currentPosition = charOffset;
    } else {
      currentLines.push(line);
    }

    charOffset += lineLength;
  }

  // Flush the last accumulated segment
  flush();

  return segments;
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
