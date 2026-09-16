/**
 * Candidate merge / dedup (V2 Stage 2/4). Pure.
 *
 * Clusters structural + spotting candidates so the SAME negotiation point is one
 * finding. Precedence:
 *   1. same ruleId → merge (structural-structural on the same rule)
 *   2. share a clauseRef AND different source → merge (structural frames the
 *      spotting finding on that clause — e.g. "objection has no teeth" + "5-day
 *      window")
 *   3. share a clauseRef AND same source AND issue similar (tag/semantic) → merge
 * Evidence is unioned; the structural member (if any) provides the headline
 * framing; severity-positive factors are OR-ed, market-standard/out-of-scope are
 * only kept when EVERY member agrees.
 */
import { Candidate, SeverityFactors, EvidenceSpan, emptyFactors } from "./types.js";

export interface MergedCandidate extends Candidate {
  members: Candidate[];
  duplicateOfRefs: string[];
}

function tagTokens(tag: string): Set<string> {
  return new Set(tag.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((t) => t.length > 2));
}
export function tagSimilar(a: string, b: string): boolean {
  if (a && b && a.toLowerCase() === b.toLowerCase()) return true;
  const ta = tagTokens(a), tb = tagTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.5;
}
function shareClauseRef(a: Candidate, b: Candidate): boolean {
  const s = new Set(a.clauseRefs);
  return b.clauseRefs.some((r) => r !== "doc-level" && r !== "unmatched" && s.has(r));
}

export type SimilarityFn = (a: Candidate, b: Candidate) => number; // 0..1; optional embeddings

function normTag(t: string): string { return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

// Generic topics are too broad to merge across locations on topic alone.
const GENERIC_TOPICS = new Set(["data_protection", "other", "definitions"]);

export function sameIssue(a: Candidate, b: Candidate, sim?: SimilarityFn): boolean {
  // Two structural findings about the same SPECIFIC clause topic are the same
  // negotiation point even under different ruleIds / locations (e.g. a regimeRule
  // + an expectedClause both covering sub-processors, one in the body, one in an annex).
  if (a.source === "structural" && b.source === "structural" && a.topic && a.topic === b.topic && !GENERIC_TOPICS.has(a.topic)) {
    return true;
  }
  if (a.ruleId && b.ruleId) return a.ruleId === b.ruleId;
  if (shareClauseRef(a, b)) {
    if (a.source !== b.source) return true; // structural frames spotting on the same clause
    return tagSimilar(a.issueTag, b.issueTag) || (sim ? sim(a, b) >= 0.85 : false);
  }
  // Cross-location (no shared clause): same issue expressed in 2 places (body +
  // annex). Merge only on a strong signal — identical issueTag or high embedding
  // similarity — so distinct clauses are not over-merged.
  const exactTag = !!a.issueTag && normTag(a.issueTag) === normTag(b.issueTag);
  return exactTag || (sim ? sim(a, b) >= 0.85 : false);
}

// ── Union-Find ───────────────────────────────────────────────────────────────
class UF {
  p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x: number): number { return this.p[x] === x ? x : (this.p[x] = this.find(this.p[x])); }
  union(a: number, b: number) { this.p[this.find(a)] = this.find(b); }
}

function mergeFactors(members: Candidate[]): SeverityFactors {
  const f = emptyFactors();
  // Risk-positive factors: OR across members.
  const orKeys: (keyof SeverityFactors)[] = [
    "regulatoryMandatedTerm", "uncappedOrBroadExposure", "unilateralOrOneSidedRight",
    "internationalTransferRisk", "specialCategoryData", "absenceOfRequiredTerm", "irreversibleOrHardToRemedy",
  ];
  for (const k of orKeys) f[k] = members.some((m) => m.factors[k]);
  // De-prioritising factors: only if EVERY member agrees (a merged issue with any
  // non-standard member is not market-standard).
  const andKeys: (keyof SeverityFactors)[] = ["marketStandardLanguage", "outOfScopeForDocType", "purelyCosmetic"];
  for (const k of andKeys) f[k] = members.every((m) => m.factors[k]);
  return f;
}

function unionEvidence(members: Candidate[]): EvidenceSpan[] {
  const seen = new Set<string>();
  const out: EvidenceSpan[] = [];
  for (const m of members) for (const e of m.evidence) {
    const key = e.quote.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);
    if (e.quote && !seen.has(key)) { seen.add(key); out.push(e); }
  }
  return out;
}

export function mergeCandidates(candidates: Candidate[], sim?: SimilarityFn): MergedCandidate[] {
  const n = candidates.length;
  const uf = new UF(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (sameIssue(candidates[i], candidates[j], sim)) uf.union(i, j);
  }
  const clusters = new Map<number, Candidate[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(candidates[i]);
  }

  const out: MergedCandidate[] = [];
  for (const members of clusters.values()) {
    // Headline: prefer a structural member (framing); else the highest-vote spotting.
    const structural = members.find((m) => m.source === "structural");
    const headline = structural ??
      [...members].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];

    const evidence = unionEvidence(members);
    const allRefs = new Set<string>();
    for (const m of members) for (const r of m.clauseRefs) if (r !== "doc-level" && r !== "unmatched") allRefs.add(r);
    const headlineRef = headline.clauseRefs[0];
    const duplicateOfRefs = [...allRefs].filter((r) => r !== headlineRef);

    out.push({
      source: structural ? "structural" : "spotting",
      issueTag: headline.issueTag,
      ruleId: members.find((m) => m.ruleId)?.ruleId,
      isAbsence: headline.isAbsence,
      clauseRefs: headline.clauseRefs,
      evidence,
      reasoning: headline.reasoning,
      factors: mergeFactors(members),
      votes: Math.max(...members.map((m) => m.votes ?? 0)),
      ofRuns: Math.max(...members.map((m) => m.ofRuns ?? 0)),
      provisional: members.every((m) => m.provisional),
      mustCatchRule: members.some((m) => m.mustCatchRule),
      members,
      duplicateOfRefs,
    });
  }
  return out;
}
