import type {
  RequirementAssessment,
  RequirementStatus,
} from "../../models/requirement-assessment.js";

/**
 * User-facing theme used by synthesis. Internal requirement granularity is
 * preserved on `members`; the report should write one section per group.
 */
export interface AssessmentThemeGroup {
  title: string;
  status: RequirementStatus;
  members: RequirementAssessment[];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "from",
  "for",
  "to",
  "in",
  "on",
  "by",
  "with",
  "without",
  "that",
  "this",
  "its",
  "their",
  "any",
  "all",
  "not",
  "no",
  "must",
  "shall",
  "under",
  "personal",
  "information",
  "data",
  "requirement",
  "obligation",
  "obligations",
  "clause",
  "terms",
  "agreement",
]);

/**
 * Collapse overlapping internal requirements into user-facing themes so the
 * synthesis model is not asked to print near-duplicates as separate sections.
 */
export function groupAssessmentsForReport(
  assessments: RequirementAssessment[]
): AssessmentThemeGroup[] {
  if (assessments.length === 0) return [];

  const parent = assessments.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const tokens = assessments.map((a) => tokensFor(a));
  for (let i = 0; i < assessments.length; i++) {
    for (let j = i + 1; j < assessments.length; j++) {
      if (shouldMerge(tokens[i], tokens[j], assessments[i], assessments[j])) {
        union(i, j);
      }
    }
  }

  const buckets = new Map<number, RequirementAssessment[]>();
  for (let i = 0; i < assessments.length; i++) {
    const root = find(i);
    const list = buckets.get(root) ?? [];
    list.push(assessments[i]);
    buckets.set(root, list);
  }

  return [...buckets.values()].map((members) => ({
    title: groupTitle(members),
    status: combinedStatus(members.map((m) => m.status)),
    members,
  }));
}

export function humanizeRequirementId(id: string): string {
  return id
    .replace(/^[a-z]+\.[a-z0-9.]+\./i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shouldMerge(
  aTokens: Set<string>,
  bTokens: Set<string>,
  a: RequirementAssessment,
  b: RequirementAssessment
): boolean {
  const coverage = smallerCoverage(aTokens, bTokens);
  if (Math.min(aTokens.size, bTokens.size) >= 2 && coverage >= 0.75) {
    return true;
  }
  if (jaccard(aTokens, bTokens) >= 0.45 && Math.min(aTokens.size, bTokens.size) >= 2) {
    return true;
  }
  const aLabel = humanizeRequirementId(a.requirementId).toLowerCase();
  const bLabel = humanizeRequirementId(b.requirementId).toLowerCase();
  return sharesDistinctPhrase(aLabel, bLabel);
}

function tokensFor(assessment: RequirementAssessment): Set<string> {
  const raw = humanizeRequirementId(assessment.requirementId);
  const out = new Set<string>();
  for (const piece of raw.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (piece.length < 3 || STOPWORDS.has(piece)) continue;
    out.add(stem(piece));
  }
  return out;
}

function stem(token: string): string {
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

function smallerCoverage(a: Set<string>, b: Set<string>): number {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  if (smaller.size === 0) return 0;
  let hits = 0;
  for (const token of smaller) {
    if ([...larger].some((other) => tokensMatch(token, other))) hits += 1;
  }
  return hits / smaller.size;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if ([...b].some((other) => tokensMatch(token, other))) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function sharesDistinctPhrase(a: string, b: string): boolean {
  if (isSaleShareLabel(a) && isSaleShareLabel(b)) return true;
  const phrases = [
    "business purpose",
    "combin",
    "consumer request",
    "data subject request",
    "subprocessor",
    "security measure",
    "breach notif",
  ];
  return phrases.some(
    (phrase) => a.includes(phrase) && b.includes(phrase) && phrase.length >= 6
  );
}

function isSaleShareLabel(label: string): boolean {
  return /(sell|sale|selling)/.test(label) && /(share|sharing)/.test(label);
}

function groupTitle(members: RequirementAssessment[]): string {
  const labels = members.map((m) => humanizeRequirementId(m.requirementId));
  return labels.sort((a, b) => b.length - a.length)[0] ?? "Requirement";
}

function combinedStatus(statuses: RequirementStatus[]): RequirementStatus {
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0] ?? "cannot_determine";
  if (
    unique.has("covered") &&
    (unique.has("missing") || unique.has("partial") || unique.has("cannot_determine"))
  ) {
    return "partial";
  }
  if (unique.has("partial")) return "partial";
  if (unique.has("cannot_determine")) return "cannot_determine";
  if (unique.has("missing")) return "missing";
  if (unique.has("not_applicable")) return "not_applicable";
  return "cannot_determine";
}
