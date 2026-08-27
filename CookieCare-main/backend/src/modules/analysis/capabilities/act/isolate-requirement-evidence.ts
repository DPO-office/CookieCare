import type { SharedEvidenceItem } from "../../models/evidence-package.js";

export interface RequirementEvidenceProfile {
  hypothesis?: string;
  evidenceHints?: string[];
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "shall",
  "must",
  "under",
  "into",
  "such",
  "other",
  "their",
  "them",
  "than",
  "then",
  "when",
  "where",
  "which",
  "while",
  "also",
  "only",
  "each",
  "both",
  "over",
  "after",
  "before",
  "between",
  "personal",
  "data",
  "processing",
  "processor",
  "controller",
  "agreement",
  "contract",
  "clause",
  "requirement",
  "obligation",
]);

export function tokenizeForEvidence(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Generic hint list for one requirement: authored hints, hypothesis tokens,
 * and package extraction targets that overlap the requirement id.
 */
export function hintsForRequirement(
  requirementId: string,
  extractionTargets: string[],
  profile?: RequirementEvidenceProfile
): string[] {
  const authored = (profile?.evidenceHints ?? []).flatMap((hint) =>
    tokenizeForEvidence(hint).length > 0 ? [hint.toLowerCase(), ...tokenizeForEvidence(hint)] : []
  );
  const hypothesisTokens = tokenizeForEvidence(profile?.hypothesis ?? "");
  const idNorm = requirementId.toLowerCase().replace(/[._-]+/g, " ");
  const idTokens = tokenizeForEvidence(idNorm);
  const fromTargets = extractionTargets.filter((target) => {
    const targetNorm = target.toLowerCase().replace(/[._-]+/g, " ");
    if (idNorm.includes(targetNorm) || targetNorm.includes(idNorm)) return true;
    return tokenizeForEvidence(target).some((token) => idNorm.includes(token));
  });
  return unique([...authored, ...hypothesisTokens, ...fromTargets, ...idTokens]);
}

const GENERIC_HINT_TOKENS = new Set(["process", "terms", "under", "such", "including"]);

function tokenMatchesHay(needle: string, hay: string, tokens: Set<string>): boolean {
  if (needle.includes(" ")) return hay.includes(needle);
  if (STOPWORDS.has(needle) || GENERIC_HINT_TOKENS.has(needle)) return false;
  if (tokens.has(needle)) return true;
  if (needle.length >= 6) {
    for (const token of tokens) {
      if (token.startsWith(needle) || (needle.startsWith(token) && token.length >= 6)) {
        return true;
      }
    }
  }
  return false;
}

export function scoreEvidenceItem(item: SharedEvidenceItem, hints: string[]): number {
  const hay = `${item.clauseType} ${item.quotedText} ${item.matchReason ?? ""}`.toLowerCase();
  const tokens = new Set(
    hay.split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
  );
  let score = 0;
  for (const hint of hints) {
    const needle = hint.toLowerCase().trim();
    if (needle.length < 4) continue;
    if (tokenMatchesHay(needle, hay, tokens)) {
      score += Math.min(needle.length, 16);
    }
  }
  return score;
}

/**
 * Assign a candidate subset of package evidence to each requirement.
 * An extract may be a candidate for more than one requirement when it
 * scores on both hypotheses.
 */
export function candidateRefsByRequirement(
  requirementIds: string[],
  items: SharedEvidenceItem[],
  extractionTargets: string[],
  profiles: Record<string, RequirementEvidenceProfile | undefined> = {}
): Record<string, string[]> {
  const hintsByReq: Record<string, string[]> = {};
  for (const requirementId of requirementIds) {
    hintsByReq[requirementId] = hintsForRequirement(
      requirementId,
      extractionTargets,
      profiles[requirementId]
    );
  }

  const scores: Record<string, Record<string, number>> = {};
  for (const requirementId of requirementIds) {
    scores[requirementId] = {};
    for (const item of items) {
      scores[requirementId][item.ref] = scoreEvidenceItem(item, hintsByReq[requirementId]);
    }
  }

  const assigned: Record<string, string[]> = {};
  for (const requirementId of requirementIds) {
    const ranked = items
      .map((item) => ({
        ref: item.ref,
        score: scores[requirementId][item.ref] ?? 0,
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((row) => row.ref);
    assigned[requirementId] = ranked;
  }
  return assigned;
}

/**
 * Drop cites that are unknown or that fail a keyword overlap with the
 * requirement's hints. A cite that scores on this hypothesis is kept even if
 * a sibling requirement also scored higher on the same extract.
 */
export function validateEvidenceRefs(
  refs: string[],
  items: SharedEvidenceItem[],
  _candidates: string[] | undefined,
  hints: string[]
): string[] {
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const out: string[] = [];
  for (const ref of refs) {
    const item = byRef.get(ref);
    if (!item) continue;
    const score = hints.length > 0 ? scoreEvidenceItem(item, hints) : 1;
    if (score <= 0) continue;
    out.push(ref);
  }
  return out;
}

/**
 * Prefer the model's cites when they overlap this requirement. If isolation
 * emptied the cite list, recover any package extracts that still score on
 * this requirement's hints.
 */
export function resolveEvidenceRefsForRequirement(
  cited: string[],
  items: SharedEvidenceItem[],
  candidates: string[] | undefined,
  hints: string[]
): string[] {
  const validated = unique(
    validateEvidenceRefs(cited, items, candidates, hints)
  );
  if (validated.length > 0) return validated;
  return items
    .filter((item) => scoreEvidenceItem(item, hints) > 0)
    .sort(
      (a, b) => scoreEvidenceItem(b, hints) - scoreEvidenceItem(a, hints)
    )
    .slice(0, 5)
    .map((item) => item.ref);
}

export function coverageShouldBePreserved(result: {
  compliance?: string;
  status?: string;
}): boolean {
  const compliance = result.compliance;
  const status = result.status;
  if (
    compliance === "present" ||
    compliance === "partial" ||
    compliance === "not_applicable"
  ) {
    return true;
  }
  if (
    status === "strong" ||
    status === "adequate" ||
    status === "covered" ||
    status === "conditional" ||
    status === "partial"
  ) {
    return true;
  }
  return false;
}
