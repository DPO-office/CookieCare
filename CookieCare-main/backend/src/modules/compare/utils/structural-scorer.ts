/**
 * structural-scorer.ts
 *
 * Structure-first residual alignment. Scores candidate A/B pairs with a
 * weighted signal mix, then assigns a global 1:1 spine. Numeric section
 * numbers are never sufficient on their own.
 *
 * No LLM. Callers send only AMBIGUOUS survivors to AI verification.
 */

import type { AlignedPair, ExtractedClause } from "../models/compare-state.js";
import {
  AMBIGUOUS_MATCH_FLOOR,
  CONFIDENT_MATCH_THRESHOLD,
  CONDENSATION_RATIO,
  NUMERIC_TITLE_GUARD,
  buildAlignedPair,
  type AlignmentRelationship,
} from "./alignment-contract.js";

export interface ScoredCandidate {
  clauseA: ExtractedClause;
  clauseB: ExtractedClause;
  indexA: number;
  indexB: number;
  score: number;
  contentSim: number;
  titleJaccard: number;
  reasons: string[];
  crossesSpine: boolean;
  sameModule: boolean | null;
}

export interface StructuralAssignResult {
  confident: AlignedPair[];
  ambiguous: ScoredCandidate[];
  leftoverA: ExtractedClause[];
  leftoverB: ExtractedClause[];
}

export interface UnmatchedClassifyResult {
  pairs: AlignedPair[];
  leftoverA: ExtractedClause[];
  leftoverB: ExtractedClause[];
}

const LEGAL_TERMS = [
  "subprocessor",
  "sub-processor",
  "indemnif",
  "hold harmless",
  "audit",
  "inspect",
  "insurance",
  "liability",
  "terminat",
  "breach",
  "notification",
  "encryption",
  "aes-256",
  "tls",
  "penetration",
  "zero trust",
  "portal",
  "erasure",
  "retention",
  "profil",
  "transfer",
  "adequacy",
  "dlp",
  "mfa",
  "multi-factor",
  "confidential",
  "intellectual property",
  "governing law",
  "personal data",
  "data subject",
  "processor",
  "controller",
  "security",
];

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip test/redline annotations so "3.2 NEW - Zero Trust" still keys on Zero Trust. */
function canonicalTitle(title: string): string {
  return normalise(title)
    .replace(
      /\b(new|revised|modified|elevated priority|for reference|expanded|test version for comparison platform)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heading core: number prefix and parentheticals removed, then cut at the
 * first sentence boundary. "3.10. Liability. The Parties agree that:" → "liability".
 */
function headingCore(title: string): string {
  let s = title.replace(/\([^)]*\)/g, " ");
  s = s.replace(/^\s*(?:\d+[.\s]*)+/, " ");
  const cut = s.search(/\.\s+/);
  if (cut >= 0) s = s.slice(0, cut);
  return canonicalTitle(s).replace(/\.+$/, "").trim();
}

function titleTokens(heading: string): Set<string> {
  return new Set(
    headingCore(heading)
      .split(" ")
      .filter((w) => w.length > 1 && !/^\d+$/.test(w))
  );
}

function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function titleJaccard(headingA: string, headingB: string): number {
  const a = titleTokens(headingA);
  const b = titleTokens(headingB);
  const raw = tokenJaccard(a, b);
  const [shorter, longer] = a.size <= b.size ? [a, b] : [b, a];
  if (shorter.size === 0) return raw;
  let contained = true;
  for (const w of shorter) {
    if (!longer.has(w)) {
      contained = false;
      break;
    }
  }
  // Shorter heading core contained in the longer one is strong title evidence
  // even when a body-sentence tail would dilute raw Jaccard.
  if (contained) return Math.max(raw, 0.75);
  return raw;
}

/** Changelog / redline-appendix titles are insertions, not consolidations of body clauses. */
export function isChangelogTitle(title: string): boolean {
  return /\bremoved provisions\b|\bfor reference\b|\bsummary of changes\b/i.test(title);
}

function stemToken(w: string): string {
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function looksLikeSentenceHeading(core: string): boolean {
  const tokens = core.split(" ").filter((w) => w.length > 1);
  if (tokens.length >= 8) return true;
  return /^(it|the|this|supplier|party|each|where|if|has|have|agrees|shall)\b/.test(core);
}

/**
 * Named instrument / schedule heading, inherited by later clauses in document
 * order. sectionPath is numeric-only, so this is recovered from titles.
 * Generic role/annex language only — no document-specific section numbers.
 * Body-as-title clauses that mention an appendix in the first sentence must
 * not retag the rest of the instrument.
 */
export function instrumentKey(title: string): string | null {
  const core = headingCore(title);
  const coreN = normalise(core);
  // Match only the heading core — a trailing body sentence must not retag the module.
  if (!looksLikeSentenceHeading(core)) {
    const role = coreN.match(/\b(controller|processor)\s+to\s+(controller|processor)\b/);
    if (role) return `${role[1]}-to-${role[2]}`;
  }
  // Annex/schedule only as a heading, not a citation ("Annex 1 of the Agreement...").
  const part = coreN.match(
    /^(annex|schedule|appendix|exhibit)\s+([ivxlcdm]+|\d+[a-z]?|[a-z])\b(?:\s+(.*))?$/
  );
  if (part) {
    const rest = (part[3] ?? "").trim();
    if (/^of\b/.test(rest)) return null;
    return `${part[1]}-${part[2]}`;
  }
  return null;
}

function instrumentKeyFromClause(clause: ExtractedClause): string | null {
  return (
    instrumentKey(clause.title) ??
    instrumentKey(clause.sectionPath[0] ?? "") ??
    null
  );
}

/** Last named instrument heading at or before each clause (document order). */
export function moduleKeysById(clauses: ExtractedClause[]): Map<string, string> {
  const ordered = [...clauses].sort((x, y) => x.position - y.position || x.id.localeCompare(y.id));
  const map = new Map<string, string>();
  let current = "";
  for (const c of ordered) {
    const inst = instrumentKeyFromClause(c);
    if (inst) current = inst;
    if (current) map.set(c.id, current);
  }
  return map;
}

/** Heading-core tokens, or legal-topic tokens when the "title" is a body sentence. */
function subjectTokens(clause: ExtractedClause): Set<string> {
  const core = headingCore(clause.title);
  const heading = new Set([...titleTokens(clause.title)].map(stemToken));
  if (!looksLikeSentenceHeading(core)) return heading;
  const hay = `${clause.title} ${clause.text.slice(0, 500)}`.toLowerCase();
  const topic = new Set<string>();
  for (const w of heading) topic.add(w);
  for (const term of LEGAL_TERMS) {
    if (!hay.includes(term)) continue;
    for (const w of term.split(/[\s-]+/)) {
      if (w.length > 2) topic.add(stemToken(w));
    }
  }
  return topic.size > 0 ? topic : heading;
}

function isStructuralHeading(clause: ExtractedClause): boolean {
  return !looksLikeSentenceHeading(headingCore(clause.title));
}

function isChildOfHeading(child: ExtractedClause, heading: ExtractedClause): boolean {
  if (child.id === heading.id) return false;
  if (!isStructuralHeading(heading)) return false;
  const hp = heading.sectionPath;
  const cp = child.sectionPath;
  if (hp.length > 0 && cp.length > hp.length && hp.every((p, i) => cp[i] === p)) {
    return true;
  }
  const hLabel =
    extractNumericLabel(heading.title) ?? extractNumericLabel(hp.at(-1) ?? "");
  const cLabel =
    extractNumericLabel(child.title) ?? extractNumericLabel(cp.at(-1) ?? "");
  return Boolean(hLabel && cLabel && cLabel !== hLabel && cLabel.startsWith(`${hLabel}.`));
}

const HEADING_STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "with",
  "for",
  "to",
  "a",
  "an",
  "or",
  "in",
  "this",
  "section",
  "requirements",
  "requirement",
]);

/**
 * How much of a short heading is evidenced in a body-as-title counterpart.
 * Restricted to short headings and sentence-title evidence so a long
 * structural title cannot inflate similarity against unrelated body text.
 */
function headingTokenRecall(headingClause: ExtractedClause, evidenceClause: ExtractedClause): number {
  if (!isStructuralHeading(headingClause)) return 0;
  if (!looksLikeSentenceHeading(headingCore(evidenceClause.title))) return 0;
  const heading = [...titleTokens(headingClause.title)]
    .map(stemToken)
    .filter((w) => w && !HEADING_STOPWORDS.has(w));
  if (heading.length === 0 || heading.length > 4) return 0;
  const hay = `${evidenceClause.title} ${evidenceClause.text.slice(0, 800)}`.toLowerCase();
  const evidence = subjectTokens(evidenceClause);
  let hits = 0;
  for (const w of heading) {
    if (evidence.has(w) || hay.includes(w)) hits++;
  }
  let recall = hits / heading.length;
  const headingSet = new Set(heading);
  const rivalSubjects = [
    "audit",
    "indemnif",
    "liability",
    "portal",
    "terminat",
    "subprocessor",
    "transfer",
    "insurance",
  ];
  const rivalNotInHeading = [...titleTokens(evidenceClause.title)]
    .map(stemToken)
    .filter(
      (w) =>
        rivalSubjects.some((s) => w.startsWith(s) || s.startsWith(w)) &&
        ![...headingSet].some((h) => w.startsWith(h) || h.startsWith(w))
    );
  if (rivalNotInHeading.length > 0) {
    recall *= 0.4;
  }
  return recall;
}

function clauseTitleSimilarity(a: ExtractedClause, b: ExtractedClause): number {
  const raw = titleJaccard(a.title, b.title);
  const recall = Math.max(headingTokenRecall(a, b), headingTokenRecall(b, a));
  return Math.max(raw, recall);
}

const CROSS_MODULE_CONTENT_FLOOR = 0.55;
const SAME_MODULE_BONUS = 0.18;

export function extractNumericLabel(heading: string): string | null {
  const trimmed = heading.trim();
  const m = trimmed.match(/^(\d+(?:[.\s]+\d+)*)/);
  if (!m) return null;
  const label = m[1]
    .trim()
    .replace(/\s+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return label.length > 0 ? label : null;
}

function headingType(clause: ExtractedClause): "numbered" | "lettered" | "appendix" | "bare" {
  const title = clause.title.trim();
  if (/^appendix\b/i.test(title) || clause.sectionPath.some((p) => /^appendix/i.test(p))) {
    return "appendix";
  }
  if (extractNumericLabel(title) || /^\d+(?:\.\d+)*/.test(clause.sectionPath.at(-1) ?? "")) {
    return "numbered";
  }
  if (/^[A-Z][.)]/.test(title) || /^[A-Z]$/.test(clause.sectionPath[0] ?? "")) {
    return "lettered";
  }
  return "bare";
}

function parentKey(clause: ExtractedClause): string {
  const path = clause.sectionPath;
  if (path.length >= 2) return normalise(path[path.length - 2]);
  if (path.length === 1) return normalise(path[0]);
  const label = extractNumericLabel(clause.title);
  if (label && label.includes(".")) return label.split(".").slice(0, -1).join(".");
  return "";
}

export function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  let intersection = 0;
  for (const [bg, countA] of bigramsA) {
    intersection += Math.min(countA, bigramsB.get(bg) ?? 0);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function distinctiveTermOverlap(textA: string, textB: string): number {
  const hayA = textA.toLowerCase();
  const hayB = textB.toLowerCase();
  const inA = LEGAL_TERMS.filter((t) => hayA.includes(t));
  const inB = LEGAL_TERMS.filter((t) => hayB.includes(t));
  if (inA.length === 0 && inB.length === 0) return 0;
  const setB = new Set(inB);
  const inter = inA.filter((t) => setB.has(t)).length;
  const union = new Set([...inA, ...inB]).size;
  return union === 0 ? 0 : inter / union;
}

function pathJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a.map(normalise));
  const sb = new Set(b.map(normalise));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export interface ScoreContext {
  indexA: number;
  indexB: number;
  lenA: number;
  lenB: number;
  prevA?: ExtractedClause;
  nextA?: ExtractedClause;
  prevB?: ExtractedClause;
  nextB?: ExtractedClause;
  moduleA?: string;
  moduleB?: string;
}

export function scoreClausePair(
  a: ExtractedClause,
  b: ExtractedClause,
  ctx: ScoreContext
): {
  score: number;
  reasons: string[];
  contentSim: number;
  titleJac: number;
  rejected: boolean;
  sameModule: boolean | null;
} {
  const reasons: string[] = [];
  const contentSim = charSimilarity(a.text.slice(0, 1500), b.text.slice(0, 1500));
  const moduleA = (ctx.moduleA ?? "").trim();
  const moduleB = (ctx.moduleB ?? "").trim();
  const modulesKnown = moduleA.length > 0 && moduleB.length > 0;
  const sameModule = modulesKnown ? moduleA === moduleB : null;
  const crossModule = sameModule === false;
  const aLabel =
    extractNumericLabel(a.title) ??
    extractNumericLabel(a.sectionPath.at(-1) ?? "") ??
    extractNumericLabel((a.sectionPath.at(-1) ?? "").replace(/\s+/g, ""));
  const bLabel =
    extractNumericLabel(b.title) ??
    extractNumericLabel(b.sectionPath.at(-1) ?? "") ??
    extractNumericLabel((b.sectionPath.at(-1) ?? "").replace(/\s+/g, ""));

  // Near-identical body text is correspondence even when numbering/title changed.
  if (contentSim >= 0.85) {
    const reasons = ["near-identical content"];
    const titleJac = clauseTitleSimilarity(a, b);
    if (titleJac >= 0.25) reasons.push("title overlap");
    if (aLabel && bLabel && aLabel !== bLabel) reasons.push("renumbered");
    if (sameModule) reasons.push("same document module");
    return {
      score: Math.max(0.82, 0.7 + 0.15 * contentSim),
      reasons,
      contentSim,
      titleJac,
      rejected: false,
      sameModule,
    };
  }

  let titleJac = clauseTitleSimilarity(a, b);
  const rawTitleJac = titleJac;
  if (crossModule && contentSim < CROSS_MODULE_CONTENT_FLOOR) {
    titleJac = Math.min(titleJac, 0.25);
  }

  // Invariant #2: shared number is never sufficient. A shared number with
  // unrelated titles is a collision — reject even if bodies share boilerplate.
  if (aLabel && bLabel && aLabel === bLabel) {
    if (rawTitleJac < NUMERIC_TITLE_GUARD) {
      return {
        score: 0,
        reasons: [
          `numeric collision on ${aLabel} with different subject (title Jaccard ${rawTitleJac.toFixed(2)}, content ${contentSim.toFixed(2)})`,
        ],
        contentSim,
        titleJac,
        rejected: true,
        sameModule,
      };
    }
    reasons.push(`shared section number ${aLabel}`);
  }

  let score = 0;

  if (aLabel && bLabel && aLabel === bLabel) score += 0.1;

  score += titleJac * 0.22;
  if (titleJac >= 0.45) reasons.push("strong title similarity");
  else if (titleJac >= 0.25) reasons.push("moderate title similarity");

  const parentA = parentKey(a);
  const parentB = parentKey(b);
  if (parentA && parentB && parentA === parentB) {
    score += 0.1;
    reasons.push("same parent section");
  }

  const pathScore = pathJaccard(a.sectionPath, b.sectionPath);
  score += pathScore * 0.08;
  if (pathScore >= 0.5) reasons.push("overlapping sectionPath");

  const typeA = headingType(a);
  const typeB = headingType(b);
  if (typeA === typeB) {
    score += 0.05;
    reasons.push(`same heading type (${typeA})`);
  }

  const depthDelta = Math.abs(a.sectionPath.length - b.sectionPath.length);
  score += depthDelta === 0 ? 0.05 : Math.max(0, 0.05 - 0.02 * depthDelta);

  const posA = ctx.lenA <= 1 ? 0.5 : ctx.indexA / (ctx.lenA - 1);
  const posB = ctx.lenB <= 1 ? 0.5 : ctx.indexB / (ctx.lenB - 1);
  const orderScore = 1 - Math.min(1, Math.abs(posA - posB));
  score += orderScore * 0.1;
  if (orderScore >= 0.85) reasons.push("order-consistent");

  let neighbor = 0;
  if (ctx.prevA && ctx.prevB) neighbor += titleJaccard(ctx.prevA.title, ctx.prevB.title);
  if (ctx.nextA && ctx.nextB) neighbor += titleJaccard(ctx.nextA.title, ctx.nextB.title);
  const neighborDiv = (ctx.prevA && ctx.prevB ? 1 : 0) + (ctx.nextA && ctx.nextB ? 1 : 0);
  if (neighborDiv > 0) {
    const nScore = neighbor / neighborDiv;
    score += nScore * 0.08;
    if (nScore >= 0.4) reasons.push("neighboring clause context");
  }

  score += contentSim * 0.15;
  if (contentSim >= 0.55) reasons.push("high content similarity");
  else if (contentSim >= 0.35) reasons.push("moderate content similarity");

  const terms = distinctiveTermOverlap(a.text + " " + a.title, b.text + " " + b.title);
  score += terms * 0.07;
  if (terms >= 0.5) reasons.push("shared distinctive legal terms");

  const coreA = headingCore(a.title);
  const coreB = headingCore(b.title);
  if (
    sameModule !== false &&
    !looksLikeSentenceHeading(coreA) &&
    !looksLikeSentenceHeading(coreB) &&
    titleJaccard(a.title, b.title) >= 0.5
  ) {
    score += 0.1;
    reasons.push("short heading-core match");
  }

  if (sameModule) {
    score += SAME_MODULE_BONUS;
    reasons.push("same document module");
  } else if (crossModule && contentSim < CROSS_MODULE_CONTENT_FLOOR) {
    reasons.push("different document module — title similarity not sufficient");
    score = Math.min(score, AMBIGUOUS_MATCH_FLOOR - 0.01);
  }

  return {
    score: Math.min(1, score),
    reasons,
    contentSim,
    titleJac,
    rejected: false,
    sameModule,
  };
}

function isConfident(s: {
  score: number;
  contentSim: number;
  titleJac?: number;
  titleJaccard?: number;
  sameModule?: boolean | null;
}): boolean {
  if (s.score < CONFIDENT_MATCH_THRESHOLD) return false;
  if (s.sameModule === false && s.contentSim < CROSS_MODULE_CONTENT_FLOOR) return false;
  const titleJac = s.titleJac ?? s.titleJaccard ?? 0;
  return s.contentSim >= 0.4 || (titleJac >= 0.5 && s.contentSim >= 0.32);
}

function pairCrosses(
  indexA: number,
  indexB: number,
  accepted: Array<{ indexA: number; indexB: number }>
): boolean {
  for (const p of accepted) {
    if (indexA === p.indexA || indexB === p.indexB) continue;
    if (indexA < p.indexA !== indexB < p.indexB) return true;
  }
  return false;
}

function neighborOf(
  list: ExtractedClause[],
  index: number,
  delta: -1 | 1
): ExtractedClause | undefined {
  return list[index + delta];
}

export function scoreAllCandidates(
  residualA: ExtractedClause[],
  residualB: ExtractedClause[],
  allA: ExtractedClause[],
  allB: ExtractedClause[]
): ScoredCandidate[] {
  const indexInA = new Map(allA.map((c, i) => [c.id, i]));
  const indexInB = new Map(allB.map((c, i) => [c.id, i]));
  const moduleA = moduleKeysById(allA);
  const moduleB = moduleKeysById(allB);
  const candidates: ScoredCandidate[] = [];

  for (const a of residualA) {
    const indexA = indexInA.get(a.id) ?? 0;
    if (isChangelogTitle(a.title)) continue;
    for (const b of residualB) {
      if (isChangelogTitle(b.title) || looksLikeNewSection(b)) continue;
      const indexB = indexInB.get(b.id) ?? 0;
      const scored = scoreClausePair(a, b, {
        indexA,
        indexB,
        lenA: allA.length,
        lenB: allB.length,
        prevA: neighborOf(allA, indexA, -1),
        nextA: neighborOf(allA, indexA, 1),
        prevB: neighborOf(allB, indexB, -1),
        nextB: neighborOf(allB, indexB, 1),
        moduleA: moduleA.get(a.id),
        moduleB: moduleB.get(b.id),
      });
      if (scored.rejected) continue;
      if (scored.score < AMBIGUOUS_MATCH_FLOOR && scored.titleJac < 0.35) continue;
      candidates.push({
        clauseA: a,
        clauseB: b,
        indexA,
        indexB,
        score: scored.score,
        contentSim: scored.contentSim,
        titleJaccard: scored.titleJac,
        reasons: scored.reasons,
        crossesSpine: false,
        sameModule: scored.sameModule,
      });
    }
  }

  return candidates;
}

/**
 * When a short structural heading and one of its numbered children both
 * compete for the same B, keep the heading if it already has strong
 * title/subject correspondence. Child body fragments must not outrank it.
 */
function preferHeadingOverChild(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const drop = new Set<string>();
  const byB = new Map<string, ScoredCandidate[]>();
  for (const cand of candidates) {
    const list = byB.get(cand.clauseB.id) ?? [];
    list.push(cand);
    byB.set(cand.clauseB.id, list);
  }
  for (const group of byB.values()) {
    const headings = group.filter(
      (c) =>
        isStructuralHeading(c.clauseA) &&
        (c.titleJaccard >= 0.5 || titleJaccard(c.clauseA.title, c.clauseB.title) >= 0.5)
    );
    for (const heading of headings) {
      for (const cand of group) {
        if (isChildOfHeading(cand.clauseA, heading.clauseA)) {
          drop.add(`${cand.clauseA.id}|${cand.clauseB.id}`);
        }
      }
    }
  }
  return candidates.filter((c) => !drop.has(`${c.clauseA.id}|${c.clauseB.id}`));
}

/**
 * Greedy 1:1 assignment of confident structural matches.
 * Order-crossing pairs are accepted only as MOVED when content/title are strong;
 * otherwise they stay ambiguous for AI rather than destroying the spine.
 */
export function assignStructuralMatches(
  residualA: ExtractedClause[],
  residualB: ExtractedClause[],
  allA: ExtractedClause[],
  allB: ExtractedClause[],
  nextId: () => string
): StructuralAssignResult {
  const candidates = preferHeadingOverChild(
    scoreAllCandidates(residualA, residualB, allA, allB)
  ).sort((x, y) => y.score - x.score || y.contentSim - x.contentSim);

  const claimedA = new Set<string>();
  const claimedB = new Set<string>();
  const acceptedIdx: Array<{ indexA: number; indexB: number }> = [];
  const confident: AlignedPair[] = [];

  for (const cand of candidates) {
    if (!isConfident(cand)) continue;
    if (claimedA.has(cand.clauseA.id) || claimedB.has(cand.clauseB.id)) continue;

    const crosses = pairCrosses(cand.indexA, cand.indexB, acceptedIdx);
    const strongMove = cand.contentSim >= 0.55 && cand.titleJaccard >= 0.35;
    if (crosses && !strongMove) continue;

    const rel: AlignmentRelationship = crosses ? "MOVED" : "MATCH";
    const reasons = [...cand.reasons];
    if (crosses) reasons.push("renumbered/reordered — classified MOVED");

    confident.push(
      buildAlignedPair(nextId, {
        clauseAId: cand.clauseA.id,
        clauseBId: cand.clauseB.id,
        relationshipType: rel,
        matchConfidence: cand.score,
        alignmentMethod: "structural",
        alignmentReasons: reasons,
      })
    );
    claimedA.add(cand.clauseA.id);
    claimedB.add(cand.clauseB.id);
    acceptedIdx.push({ indexA: cand.indexA, indexB: cand.indexB });
  }

  const leftoverA = residualA.filter((c) => !claimedA.has(c.id));
  const leftoverB = residualB.filter((c) => !claimedB.has(c.id));

  const leftoverAIds = new Set(leftoverA.map((c) => c.id));
  const leftoverBIds = new Set(leftoverB.map((c) => c.id));

  // B-centric: each leftover Modified clause → its best 1–2 credible Originals.
  // Explicit NEW / changelog leftover B never generate AI pairs.
  const bestByB = new Map<string, ScoredCandidate>();
  const secondByB = new Map<string, ScoredCandidate>();
  for (const cand of candidates) {
    if (!leftoverAIds.has(cand.clauseA.id) || !leftoverBIds.has(cand.clauseB.id)) continue;
    if (looksLikeNewSection(cand.clauseB) || isChangelogTitle(cand.clauseB.title)) continue;
    if (!hasMeaningfulAmbiguousEvidence(cand)) continue;
    const best = bestByB.get(cand.clauseB.id);
    if (!best || cand.score > best.score) {
      if (best) secondByB.set(cand.clauseB.id, best);
      bestByB.set(cand.clauseB.id, cand);
    } else {
      const second = secondByB.get(cand.clauseB.id);
      if (!second || cand.score > second.score) secondByB.set(cand.clauseB.id, cand);
    }
  }

  const ambiguous: ScoredCandidate[] = [];
  const seen = new Set<string>();
  const pushAmbiguous = (cand: ScoredCandidate) => {
    const key = `${cand.clauseA.id}|${cand.clauseB.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    cand.crossesSpine = pairCrosses(cand.indexA, cand.indexB, acceptedIdx);
    ambiguous.push(cand);
  };
  for (const cand of bestByB.values()) {
    pushAmbiguous(cand);
    const second = secondByB.get(cand.clauseB.id);
    if (
      second &&
      cand.score - second.score <= 0.06 &&
      hasMeaningfulAmbiguousEvidence(second)
    ) {
      pushAmbiguous(second);
    }
  }

  return { confident, ambiguous, leftoverA, leftoverB };
}

/**
 * Ambiguous AI pairs need title/content evidence, not same-module padding.
 */
function hasMeaningfulAmbiguousEvidence(c: ScoredCandidate): boolean {
  if (c.score < AMBIGUOUS_MATCH_FLOOR) return false;
  const core = titleJaccard(c.clauseA.title, c.clauseB.title);
  // Heading-core correspondence is enough; short structural titles often have little body.
  if (core >= 0.5) return true;
  if (c.titleJaccard >= 0.5 && c.contentSim >= 0.22) return true;
  if (core >= 0.4 && c.contentSim >= 0.28) return true;
  if (c.contentSim >= 0.48) return true;
  if (c.sameModule && c.titleJaccard >= 0.45 && c.contentSim >= 0.28) return true;
  if (c.sameModule && core >= 0.35 && c.contentSim >= 0.32) return true;
  return false;
}

function looksLikeNewSection(clause: ExtractedClause): boolean {
  return /\bNEW\b|\badded\b|\b(mandatory data subject|zero trust|prohibited processing)\b/i.test(
    clause.title
  );
}

/**
 * Convert unmatched residuals to confirmed ADDED/REMOVED only when structural
 * evidence supports it. Otherwise UNCERTAIN.
 *
 * Sandwich deletion: a single leftover A whose immediate A-neighbors are
 * matched to consecutive (or nearly consecutive) B clauses.
 *
 * Absent original module: if an entire Original instrument (C2C, regional
 * addendum, annex) has no Modified counterpart and none of its clauses were
 * aligned, leftover clauses in that module are confirmed REMOVED even when
 * the rewrite is condensed.
 *
 * Condensed rewrite: leftover Original clauses whose module still exists in B
 * stay UNCERTAIN rather than a mass REMOVED cascade.
 */
export function classifyUnmatchedResiduals(
  leftoverA: ExtractedClause[],
  leftoverB: ExtractedClause[],
  allA: ExtractedClause[],
  allB: ExtractedClause[],
  matched: AlignedPair[],
  nextId: () => string
): UnmatchedClassifyResult {
  const indexInA = new Map(allA.map((c, i) => [c.id, i]));
  const indexInB = new Map(allB.map((c, i) => [c.id, i]));
  const moduleAKeys = moduleKeysById(allA);
  const moduleBKeys = moduleKeysById(allB);
  const aToB = new Map<string, string>();
  const bToA = new Map<string, string>();
  for (const p of matched) {
    if (p.clauseAId && p.clauseBId && (p.relationshipType === "MATCH" || p.relationshipType === "MOVED" || p.relationshipType === "SPLIT" || p.relationshipType === "MERGED")) {
      aToB.set(p.clauseAId, p.clauseBId);
      bToA.set(p.clauseBId, p.clauseAId);
    }
  }

  const charA = allA.reduce((n, c) => n + c.text.length, 0);
  const charB = allB.reduce((n, c) => n + c.text.length, 0);
  const condensed =
    allA.length > 0 &&
    (allB.length / allA.length < CONDENSATION_RATIO || (charA > 0 && charB / charA < CONDENSATION_RATIO));

  const leftoverAIds = new Set(leftoverA.map((c) => c.id));
  const pairs: AlignedPair[] = [];
  const afterSandwich: ExtractedClause[] = [];
  const claimedB = new Set<string>();

  const matchedOriginalModules = new Set<string>();
  for (const p of matched) {
    if (
      p.clauseAId &&
      p.clauseBId &&
      (p.relationshipType === "MATCH" ||
        p.relationshipType === "MOVED" ||
        p.relationshipType === "SPLIT" ||
        p.relationshipType === "MERGED")
    ) {
      const m = moduleAKeys.get(p.clauseAId);
      if (m) matchedOriginalModules.add(m);
    }
  }
  const revisedModules = new Set(moduleBKeys.values());
  const absentOriginalModule = (clause: ExtractedClause): boolean => {
    const m = moduleAKeys.get(clause.id);
    if (!m) return false;
    if (revisedModules.has(m)) return false;
    if (matchedOriginalModules.has(m)) return false;
    return true;
  };

  const isSandwichRemoved = (clause: ExtractedClause): boolean => {
    const i = indexInA.get(clause.id);
    if (i === undefined) return false;
    let prevMatched: ExtractedClause | undefined;
    let nextMatched: ExtractedClause | undefined;
    let gap = 0;
    for (let k = i - 1; k >= 0; k--) {
      if (leftoverAIds.has(allA[k].id)) {
        gap += 1;
        if (gap > 1) return false;
        continue;
      }
      if (aToB.has(allA[k].id)) {
        prevMatched = allA[k];
        break;
      }
    }
    gap = 0;
    for (let k = i + 1; k < allA.length; k++) {
      if (leftoverAIds.has(allA[k].id)) {
        gap += 1;
        if (gap > 1) return false;
        continue;
      }
      if (aToB.has(allA[k].id)) {
        nextMatched = allA[k];
        break;
      }
    }
    if (!prevMatched || !nextMatched) return false;
    const bPrev = aToB.get(prevMatched.id);
    const bNext = aToB.get(nextMatched.id);
    if (!bPrev || !bNext) return false;
    const ibp = indexInB.get(bPrev);
    const ibn = indexInB.get(bNext);
    if (ibp === undefined || ibn === undefined) return false;
    // Neighbors map to consecutive (or one-apart) B clauses → this A was dropped in place.
    return Math.abs(ibn - ibp) <= 2;
  };

  for (const a of leftoverA) {
    if (isSandwichRemoved(a)) {
      pairs.push(
        buildAlignedPair(nextId, {
          clauseAId: a.id,
          clauseBId: null,
          relationshipType: "REMOVED",
          matchConfidence: 0.86,
          alignmentMethod: "structural",
          alignmentReasons: [
            "matched neighbors on both sides with no B counterpart in the gap",
            "confirmed in-place deletion",
          ],
        })
      );
    } else {
      afterSandwich.push(a);
    }
  }

  const uncertainA: ExtractedClause[] = [];
  for (const a of afterSandwich) {
    if (absentOriginalModule(a)) {
      pairs.push(
        buildAlignedPair(nextId, {
          clauseAId: a.id,
          clauseBId: null,
          relationshipType: "REMOVED",
          matchConfidence: 0.84,
          alignmentMethod: "structural",
          alignmentReasons: [
            "original module/instrument has no counterpart in the revised document",
            "confirmed removal of absent instrument",
          ],
        })
      );
    } else {
      uncertainA.push(a);
      pairs.push(
        buildAlignedPair(nextId, {
          clauseAId: a.id,
          clauseBId: null,
          relationshipType: "UNCERTAIN",
          matchConfidence: 0.2,
          alignmentMethod: "structural",
          alignmentReasons: condensed
            ? [
                "no counterpart established",
                "revised document is substantially shorter — correspondence not confirmed",
              ]
            : ["no counterpart established with sufficient structural evidence"],
        })
      );
    }
  }

  const stillB: ExtractedClause[] = [];
  for (const b of leftoverB) {
    if (claimedB.has(b.id)) continue;

    if (isChangelogTitle(b.title)) {
      pairs.push(
        buildAlignedPair(nextId, {
          clauseAId: null,
          clauseBId: b.id,
          relationshipType: "ADDED",
          matchConfidence: 0.9,
          alignmentMethod: "structural",
          alignmentReasons: [
            "changelog / removed-provisions appendix",
            "not a consolidation of an original body clause",
          ],
        })
      );
      claimedB.add(b.id);
      continue;
    }

    let bestAScore = 0;
    for (const a of leftoverA) {
      const ia = indexInA.get(a.id) ?? 0;
      const ib = indexInB.get(b.id) ?? 0;
      const s = scoreClausePair(a, b, {
        indexA: ia,
        indexB: ib,
        lenA: allA.length,
        lenB: allB.length,
        moduleA: moduleAKeys.get(a.id),
        moduleB: moduleBKeys.get(b.id),
      });
      if (s.score > bestAScore) bestAScore = s.score;
    }

    const distinctiveNew = looksLikeNewSection(b) && bestAScore < CONFIDENT_MATCH_THRESHOLD;
    const noPlausibleA = bestAScore < AMBIGUOUS_MATCH_FLOOR;

    if (distinctiveNew || noPlausibleA) {
      pairs.push(
        buildAlignedPair(nextId, {
          clauseAId: null,
          clauseBId: b.id,
          relationshipType: "ADDED",
          matchConfidence: distinctiveNew ? 0.88 : 0.8,
          alignmentMethod: "structural",
          alignmentReasons: distinctiveNew
            ? ["marked as new section", "no plausible original counterpart"]
            : ["no plausible original counterpart above ambiguity floor"],
        })
      );
      claimedB.add(b.id);
    } else {
      stillB.push(b);
    }
  }

  for (const b of stillB) {
    pairs.push(
      buildAlignedPair(nextId, {
        clauseAId: null,
        clauseBId: b.id,
        relationshipType: "UNCERTAIN",
        matchConfidence: 0.2,
        alignmentMethod: "structural",
        alignmentReasons: ["possible moved/renumbered clause — correspondence not confirmed"],
      })
    );
  }

  return { pairs, leftoverA: uncertainA, leftoverB: stillB };
}

function isTextFragmentOf(fragment: string, whole: string): boolean {
  const f = fragment.trim().toLowerCase();
  const w = whole.trim().toLowerCase();
  if (f.length < 40 || w.length < 40) return false;
  if (f.length >= w.length * 0.9) return false;
  if (w.includes(f.slice(0, Math.min(120, f.length)))) return true;
  const window = Math.min(48, f.length);
  if (window < 40) return false;
  for (let i = 0; i + window <= f.length; i += 8) {
    if (w.includes(f.slice(i, i + window))) return true;
  }
  return false;
}

/**
 * Two-level numeric cluster (3.7.4 → 3.7). Single-level labels are too coarse.
 */
function sectionCluster(clause: ExtractedClause): string | null {
  const label =
    extractNumericLabel(clause.title) ??
    extractNumericLabel((clause.sectionPath.at(-1) ?? "").replace(/\s+/g, ""));
  if (label) {
    const parts = label.split(".").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  }
  const pk = parentKey(clause);
  const numeric = pk.match(/^(\d+)\.(\d+)/);
  if (numeric) return `${numeric[1]}.${numeric[2]}`;
  return null;
}

function scorePairForMaps(
  a: ExtractedClause,
  b: ExtractedClause,
  allA: ExtractedClause[],
  allB: ExtractedClause[],
  indexInA: Map<string, number>,
  indexInB: Map<string, number>,
  moduleA: Map<string, string>,
  moduleB: Map<string, string>
) {
  const indexA = indexInA.get(a.id) ?? 0;
  const indexB = indexInB.get(b.id) ?? 0;
  return scoreClausePair(a, b, {
    indexA,
    indexB,
    lenA: allA.length,
    lenB: allB.length,
    prevA: neighborOf(allA, indexA, -1),
    nextA: neighborOf(allA, indexA, 1),
    prevB: neighborOf(allB, indexB, -1),
    nextB: neighborOf(allB, indexB, 1),
    moduleA: moduleA.get(a.id),
    moduleB: moduleB.get(b.id),
  });
}

/**
 * After 1:1 matching, leftover B that is a real fragment of an already-matched A
 * is SPLIT. Leftover A may MERGED into an already-matched B when it is a text
 * fragment, or — including in condensed rewrites — when it shares module,
 * numbered cluster, order, and topic/content with that B and has no stronger
 * unmatched Modified counterpart. Ordinary MATCH/MOVED stay 1:1.
 */
export function detectSplitMerge(
  leftoverA: ExtractedClause[],
  leftoverB: ExtractedClause[],
  matched: AlignedPair[],
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>,
  nextId: () => string
): { pairs: AlignedPair[]; consumedA: Set<string>; consumedB: Set<string> } {
  const pairs: AlignedPair[] = [];
  const consumedA = new Set<string>();
  const consumedB = new Set<string>();
  const allA = [...clauseMapA.values()].sort(
    (x, y) => x.position - y.position || x.id.localeCompare(y.id)
  );
  const allB = [...clauseMapB.values()].sort(
    (x, y) => x.position - y.position || x.id.localeCompare(y.id)
  );
  const indexInA = new Map(allA.map((c, i) => [c.id, i]));
  const indexInB = new Map(allB.map((c, i) => [c.id, i]));
  const moduleA = moduleKeysById(allA);
  const moduleB = moduleKeysById(allB);

  for (const b of leftoverB) {
    if (/\bNEW\b/i.test(b.title) || isChangelogTitle(b.title)) continue;
    let best: { pair: AlignedPair; sim: number } | null = null;
    for (const p of matched) {
      if (!p.clauseAId || !p.clauseBId) continue;
      if (p.relationshipType !== "MATCH" && p.relationshipType !== "MOVED") continue;
      const a = clauseMapA.get(p.clauseAId);
      if (!a) continue;
      const titled = titleJaccard(a.title, b.title) >= 0.35;
      const fragment = isTextFragmentOf(b.text, a.text);
      if (!fragment && !titled) continue;
      if (!fragment && charSimilarity(a.text.slice(0, 1500), b.text.slice(0, 1500)) < 0.55) {
        continue;
      }
      const sim = charSimilarity(a.text.slice(0, 1500), b.text.slice(0, 1500));
      if (!best || sim > best.sim) best = { pair: p, sim };
    }
    if (!best) continue;
    const a = clauseMapA.get(best.pair.clauseAId!);
    if (!a) continue;
    pairs.push(
      buildAlignedPair(nextId, {
        clauseAId: a.id,
        clauseBId: b.id,
        relationshipType: "SPLIT",
        matchConfidence: Math.min(0.9, best.sim + 0.1),
        alignmentMethod: "structural",
        alignmentReasons: [
          `content is a fragment of already-matched "${a.title}"`,
          "classified as SPLIT rather than a second ordinary MATCH",
        ],
      })
    );
    consumedB.add(b.id);
  }

  const unmatchedB = leftoverB.filter(
    (b) =>
      !consumedB.has(b.id) && !looksLikeNewSection(b) && !isChangelogTitle(b.title)
  );

  for (const a of leftoverA) {
    if (consumedA.has(a.id)) continue;
    let best: { pair: AlignedPair; sim: number } | null = null;
    for (const p of matched) {
      if (!p.clauseAId || !p.clauseBId) continue;
      if (p.relationshipType !== "MATCH" && p.relationshipType !== "MOVED") continue;
      const b = clauseMapB.get(p.clauseBId);
      if (!b) continue;
      if (looksLikeNewSection(b) || isChangelogTitle(b.title)) continue;
      if (!isTextFragmentOf(a.text, b.text)) continue;
      if (titleJaccard(a.title, b.title) < 0.3) continue;
      const sim = charSimilarity(a.text.slice(0, 1500), b.text.slice(0, 1500));
      if (sim < 0.45) continue;
      if (!best || sim > best.sim) best = { pair: p, sim };
    }
    if (!best) continue;
    const b = clauseMapB.get(best.pair.clauseBId!);
    if (!b) continue;
    pairs.push(
      buildAlignedPair(nextId, {
        clauseAId: a.id,
        clauseBId: b.id,
        relationshipType: "MERGED",
        matchConfidence: Math.min(0.9, best.sim + 0.1),
        alignmentMethod: "structural",
        alignmentReasons: [
          `content is a fragment of already-matched "${b.title}"`,
          "classified as MERGED rather than a second ordinary MATCH",
        ],
      })
    );
    consumedA.add(a.id);
  }

  for (const a of leftoverA) {
    if (consumedA.has(a.id)) continue;
    const clusterA = sectionCluster(a);
    if (!clusterA) continue;
    const idxA = indexInA.get(a.id) ?? 0;
    let best:
      | { pair: AlignedPair; scored: ReturnType<typeof scoreClausePair>; matchedA: ExtractedClause }
      | null = null;

    for (const p of matched) {
      if (!p.clauseAId || !p.clauseBId) continue;
      if (p.relationshipType !== "MATCH" && p.relationshipType !== "MOVED") continue;
      const matchedA = clauseMapA.get(p.clauseAId);
      const b = clauseMapB.get(p.clauseBId);
      if (!matchedA || !b) continue;
      if (looksLikeNewSection(b) || isChangelogTitle(b.title)) continue;
      const clusterM = sectionCluster(matchedA);
      if (!clusterM || clusterM !== clusterA) continue;
      const idxM = indexInA.get(matchedA.id) ?? 0;
      if (Math.abs(idxA - idxM) > 20) continue;
      const modA = moduleA.get(a.id);
      const modM = moduleA.get(matchedA.id);
      if (modA && modM && modA !== modM) continue;
      const modB = moduleB.get(b.id);
      if (modA && modB && modA !== modB) continue;
      const scored = scorePairForMaps(a, b, allA, allB, indexInA, indexInB, moduleA, moduleB);
      const parentSame = parentKey(a) !== "" && parentKey(a) === parentKey(matchedA);
      const recall = Math.max(headingTokenRecall(b, a), headingTokenRecall(a, b));
      const core = titleJaccard(a.title, b.title);
      const justified =
        parentSame ||
        scored.score >= 0.4 ||
        scored.contentSim >= 0.35 ||
        recall >= 0.5 ||
        core >= 0.4;
      if (!justified) continue;
      if (!best || scored.score > best.scored.score) {
        best = { pair: p, scored, matchedA };
      }
    }
    if (!best) continue;

    const matchedB = clauseMapB.get(best.pair.clauseBId!);
    if (!matchedB) continue;

    let competing = false;
    for (const other of unmatchedB) {
      if (other.id === matchedB.id) continue;
      const rival = scorePairForMaps(
        a,
        other,
        allA,
        allB,
        indexInA,
        indexInB,
        moduleA,
        moduleB
      );
      if (rival.score >= best.scored.score + 0.04 && rival.score >= AMBIGUOUS_MATCH_FLOOR) {
        competing = true;
        break;
      }
    }
    if (competing) continue;

    pairs.push(
      buildAlignedPair(nextId, {
        clauseAId: a.id,
        clauseBId: matchedB.id,
        relationshipType: "MERGED",
        matchConfidence: Math.min(0.88, Math.max(0.62, best.scored.score)),
        alignmentMethod: "structural",
        alignmentReasons: [
          `same numbered cluster as already-matched "${best.matchedA.title}"`,
          "same module/instrument as already-matched counterpart",
          "classified as MERGED rather than a second ordinary MATCH",
        ],
      })
    );
    consumedA.add(a.id);
  }

  return { pairs, consumedA, consumedB };
}
