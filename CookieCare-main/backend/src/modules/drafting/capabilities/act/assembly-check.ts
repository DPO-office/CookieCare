import type { DraftState } from "../../models/draft-state.js";

export interface AssemblyCheckResult {
  ok: boolean;
  issues: string[];
}

/**
 * Deterministic assembly QA — no LLM.
 * Verifies title, preamble, unique headings, numbering, unresolved anchors, exhibits.
 */
export function runAssemblyCheck(state: DraftState): AssemblyCheckResult {
  const issues: string[] = [];
  const doc = state.draft?.formattedDocument ?? "";

  if (!doc.trim()) {
    return { ok: false, issues: ["empty document"] };
  }

  const titleMatches = doc.match(/^#\s+.+/gm) || [];
  if (titleMatches.length === 0) {
    issues.push("missing title");
  }

  const preambleMatches = doc.match(
    /This (?:Data Processing )?(?:Agreement|Addendum) is entered into/gi
  );
  if (!preambleMatches || preambleMatches.length === 0) {
    issues.push("missing preamble");
  } else if (preambleMatches.length > 1) {
    issues.push(`multiple preambles (${preambleMatches.length})`);
  }

  const numberedHeadings = [
    ...doc.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm),
  ].map((m) => ({ num: Number(m[1]), title: m[2].trim() }));

  const headingKeys = new Map<string, number>();
  for (const h of numberedHeadings) {
    const key = h.title.toLowerCase();
    headingKeys.set(key, (headingKeys.get(key) || 0) + 1);
  }
  for (const [title, count] of headingKeys) {
    if (count > 1) issues.push(`duplicate heading: ${title}`);
  }

  for (let i = 0; i < numberedHeadings.length; i++) {
    if (numberedHeadings[i].num !== i + 1) {
      issues.push(
        `non-monotonic numbering at index ${i}: expected ${i + 1}, got ${numberedHeadings[i].num}`
      );
      break;
    }
  }

  if (/\[\[SEC:[^\]]+\]\]/.test(doc)) {
    issues.push("unresolved [[SEC:...]] anchors");
  }

  if (/\[\s*●[^\]]*\]/.test(doc)) {
    issues.push("placeholder tokens remain");
  }

  const expectedExhibits = state.draftingContext?.exhibitSpecs ?? [];
  for (const spec of expectedExhibits) {
    const letter = spec.letter;
    const present =
      (state.exhibits ?? []).some((e) => e.workUnitId === spec.id) ||
      (letter
        ? doc.includes(`Schedule ${letter}`)
        : doc.toLowerCase().includes(spec.title.toLowerCase()));
    if (!present) {
      issues.push(`missing exhibit: ${spec.id}`);
    }
  }

  if (!/By:\s*_{3,}/i.test(doc)) {
    issues.push("missing signature block");
  }

  return { ok: issues.length === 0, issues };
}
