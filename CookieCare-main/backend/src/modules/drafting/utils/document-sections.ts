import { DraftSection } from "../models/draft-state";

/**
 * Deterministic markdown <-> section-list conversion.
 *
 * We do NOT ask the LLM to emit structured JSON sections (that would risk prose
 * quality and add latency). Instead we split the model's markdown output on its
 * top-level headings. Each section keeps its full markdown block (including the
 * heading line) in `body`, so the ordered list of bodies re-renders to the exact
 * original document.
 *
 * This is the backbone of surgical refinement: we can regenerate a single
 * `DraftSection.id` and splice it back without touching the rest of the document.
 */

/** Heading lines that start a new major section: markdown H1/H2 (e.g. "# ...", "## ..."). */
const HEADING_REGEX = /^(#{1,2})\s+(.*\S)\s*$/;

function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Split a markdown document into ordered sections.
 * Content before the first heading (title/preamble) becomes the first section
 * with an empty heading.
 */
export function parseSections(markdown: string): DraftSection[] {
  const text = (markdown || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const sections: DraftSection[] = [];

  let currentHeading: string | null = null;
  let currentBodyLines: string[] = [];

  const flush = () => {
    // Skip a purely empty leading preamble (no heading, no content)
    const bodyJoined = currentBodyLines.join("\n");
    const isEmptyPreamble = currentHeading === null && !bodyJoined.trim();
    if (currentHeading === null && currentBodyLines.length === 0) return;
    if (isEmptyPreamble) return;

    const headingText = currentHeading ?? "";
    sections.push({
      id: `${slugify(headingText) || "section"}-${sections.length}`,
      heading: headingText,
      body: bodyJoined,
    });
  };

  let started = false;
  for (const line of lines) {
    const match = line.match(HEADING_REGEX);
    if (match) {
      // Close the previous section (preamble or prior heading) before opening a new one
      if (started) flush();
      currentHeading = match[2].trim();
      currentBodyLines = [line];
      started = true;
    } else {
      if (!started) {
        // Accumulate preamble lines before the first heading
        currentHeading = null;
        currentBodyLines.push(line);
        started = true;
      } else {
        currentBodyLines.push(line);
      }
    }
  }
  if (started) flush();

  return sections;
}

/**
 * Reconstruct the full markdown document from an ordered section list.
 * Round-trips `parseSections` (bodies already contain their own heading lines).
 */
export function renderSections(sections: DraftSection[]): string {
  if (!sections || sections.length === 0) return "";
  return sections
    .map((s) => s.body)
    .join("\n")
    .trim();
}

/** Find the section whose body contains the given text snippet (case-insensitive). */
export function findSectionContaining(
  sections: DraftSection[],
  snippet: string
): DraftSection | undefined {
  const needle = (snippet || "").trim().toLowerCase();
  if (!needle) return undefined;
  // Try a reasonably distinctive slice to avoid matching on tiny common fragments
  const probe = needle.length > 120 ? needle.slice(0, 120) : needle;
  return sections.find((s) => s.body.toLowerCase().includes(probe));
}

/**
 * Resolve a validation targetSection / heading label to an actual section id.
 * Matches when either string contains the other (handles ALL-CAPS headers and
 * partial skeleton labels like "Indemnification and Limitation of Liability").
 */
export function findSectionByHeading(
  sections: DraftSection[],
  headingLabel: string
): DraftSection | undefined {
  const label = (headingLabel || "").trim().toLowerCase();
  if (!label) return undefined;
  return sections.find((s) => {
    const h = s.heading.toLowerCase();
    return h.length > 0 && (h.includes(label) || label.includes(h));
  });
}
