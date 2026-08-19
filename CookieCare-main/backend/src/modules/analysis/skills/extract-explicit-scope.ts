import type { ExplicitScope, ExplicitSubsectionScope } from "../models/analysis-plan.js";
import type { ResolutionCandidate } from "./build-resolution-catalog.js";
import { normalizeForMatch } from "./normalize-for-match.js";

const CONTEXT_PREFIX_RE =
  /\b(?:considering|in light of|with reference to|referenced in|referencing|under applicable|assist(?:ance)? with(?: obligations under)? applicable|obligations under|interact with)\s*$/i;

const ADDITIVE_SCOPE_RE =
  /\b(?:also|plus|as well as)\s+(?:check|review|assess|verify|explain|how|analyze|analyse)\b/i;

const SUBSECTION_ONLY_RE =
  /\b(?:only|limited to|exclusively|just)\b[\s\S]{0,80}\b(?:articles?|arts?)\.?\s*\d+\s*\(\s*(\d+)\s*\)/i;

const SUBSECTION_ONLY_SUFFIX_RE =
  /\b(?:articles?|arts?)\.?\s*(\d+)\s*\(\s*(\d+)\s*\)\s+only\b/i;

/** Rule ids directly tied to a scoped paragraph (e.g. 28(3)(d) → 28(4)). */
const SUBSECTION_DEPENDENCY_RULES: Record<string, string[]> = {
  "28:3": ["gdpr.art28.4"],
};

export function scopeBoundaryActive(scope: ExplicitScope): boolean {
  return scope.articles.length > 0 && !scope.allowOutOfScopeRules;
}

function expandArticleExpression(expression: string): number[] {
  const numbers = new Set<number>();
  for (const range of expression.matchAll(/(\d{1,3})\s*(?:-|to)\s*(\d{1,3})/g)) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end >= start && end - start <= 100) {
      for (let article = start; article <= end; article++) numbers.add(article);
    }
  }
  for (const token of expression.match(/\d{1,3}/g) ?? []) {
    numbers.add(Number(token));
  }
  return [...numbers].filter(Number.isInteger);
}

function articleNumbersBeforeIndex(normalized: string, index: number): number[] {
  const prefix = normalized.slice(Math.max(0, index - 96), index);
  if (!CONTEXT_PREFIX_RE.test(prefix) && !/\bapplicable\s*$/i.test(prefix)) {
    return [];
  }
  const tail = normalized.slice(index);
  const match = tail.match(/^(?:articles?|arts?)\.?\s*(\d{1,3}(?:(?:\s*(?:-|to|,|and|&)\s*|\s+)\d{1,3})*)/i);
  if (!match) return [];
  return expandArticleExpression(match[1]);
}

function articleNumbersFromReference(normalized: string, index: number): number[] {
  const tail = normalized.slice(index);
  const match = tail.match(/^(?:articles?|arts?)\.?\s*(\d{1,3}(?:(?:\s*(?:-|to|,|and|&)\s*|\s+)\d{1,3})*)/i);
  if (!match) return [];
  return expandArticleExpression(match[1]);
}

function detectSubsectionOnlyScope(normalized: string): ExplicitSubsectionScope[] | undefined {
  const suffixMatch = normalized.match(SUBSECTION_ONLY_SUFFIX_RE);
  if (suffixMatch) {
    return [
      {
        article: Number(suffixMatch[1]),
        paragraph: Number(suffixMatch[2]),
      },
    ];
  }

  const onlyMatch = normalized.match(SUBSECTION_ONLY_RE);
  if (!onlyMatch) return undefined;

  const paragraph = Number(onlyMatch[1]);
  const articleMatch = normalized.match(
    new RegExp(`(?:articles?|arts?)\\.?\\s*(\\d+)\\s*\\(\\s*${paragraph}\\s*\\)`, "i")
  );
  const article = articleMatch ? Number(articleMatch[1]) : undefined;
  if (!Number.isInteger(article) || !Number.isInteger(paragraph)) return undefined;
  return [{ article, paragraph }];
}

/**
 * Extract explicit review scope vs cross-reference context from the instruction.
 */
export function extractExplicitScope(instruction: string): ExplicitScope {
  const normalized = normalizeForMatch(instruction);
  const scopeArticles = new Set<number>();
  const contextArticles = new Set<number>();

  const articleMarker = /\b(?:articles?|arts?)\.?\s*/gi;
  for (const marker of normalized.matchAll(articleMarker)) {
    const index = marker.index ?? 0;
    const contextOnly = articleNumbersBeforeIndex(normalized, index);
    if (contextOnly.length > 0) {
      for (const article of contextOnly) contextArticles.add(article);
      continue;
    }

    const prefix = normalized.slice(Math.max(0, index - 96), index);
    const inScope = articleNumbersFromReference(normalized, index);
    if (inScope.length === 0) continue;

    if (ADDITIVE_SCOPE_RE.test(prefix)) {
      for (const article of inScope) scopeArticles.add(article);
      continue;
    }

    for (const article of inScope) scopeArticles.add(article);
  }

  for (const contextArticle of contextArticles) {
    scopeArticles.delete(contextArticle);
  }

  const subsections = detectSubsectionOnlyScope(normalized);
  const hasExplicitArticles = scopeArticles.size > 0;

  return {
    articles: [...scopeArticles].sort((a, b) => a - b),
    subsections,
    contextArticles: [...contextArticles].sort((a, b) => a - b),
    allowCrossReferencedContext: true,
    allowOutOfScopeRules: !hasExplicitArticles,
  };
}

export function articleNumberFromRuleId(ruleId: string): number | undefined {
  const match = ruleId.match(/(?:^|\.)art(\d{1,3})(?:\.|$)/i);
  return match ? Number(match[1]) : undefined;
}

interface ParsedRuleId {
  article: number;
  paragraph?: number;
  suffix?: string;
}

function parseGdprStyleRuleId(ruleId: string): ParsedRuleId | undefined {
  const match = ruleId.match(/\.art(\d+)(?:\.(\d+)(?:\.(.+))?)?$/i);
  if (!match) return undefined;
  return {
    article: Number(match[1]),
    paragraph: match[2] !== undefined ? Number(match[2]) : undefined,
    suffix: match[3],
  };
}

function ruleMatchesSubsections(ruleId: string, subsections: ExplicitSubsectionScope[]): boolean {
  const parsed = parseGdprStyleRuleId(ruleId);
  if (!parsed) return false;

  for (const sub of subsections) {
    if (parsed.article !== sub.article) continue;

    const depKey = `${sub.article}:${sub.paragraph ?? ""}`;
    if ((SUBSECTION_DEPENDENCY_RULES[depKey] ?? []).includes(ruleId)) {
      return true;
    }

    if (sub.paragraph === undefined) return true;

    if (parsed.paragraph !== sub.paragraph) continue;

    if (sub.letters && sub.letters.length > 0) {
      if (parsed.suffix === "chapeau") return true;
      if (parsed.suffix && sub.letters.includes(parsed.suffix.toLowerCase())) return true;
      continue;
    }

    if (parsed.suffix === "chapeau" || /^[a-h]$/i.test(parsed.suffix ?? "")) {
      return true;
    }
  }

  return false;
}

export function ruleIdMatchesScope(ruleId: string, scope: ExplicitScope): boolean {
  if (!scopeBoundaryActive(scope)) return true;

  const article = articleNumberFromRuleId(ruleId);
  if (article === undefined) return true;

  if (scope.contextArticles.includes(article)) return false;
  if (!scope.articles.includes(article)) return false;

  if (scope.subsections && scope.subsections.length > 0) {
    return ruleMatchesSubsections(ruleId, scope.subsections);
  }

  return true;
}

function packageIdMatchesScope(packageId: string, scope: ExplicitScope): boolean {
  const articleMatch = packageId.match(/\.art(\d+)/i);
  if (!articleMatch) return true;

  const article = Number(articleMatch[1]);
  if (scope.contextArticles.includes(article)) return false;
  if (!scope.articles.includes(article)) return false;

  if (!scope.subsections?.length) return true;

  const paragraphMatch = packageId.match(/\.art\d+\.(\d+)/i);
  if (paragraphMatch) {
    const paragraph = Number(paragraphMatch[1]);
    return scope.subsections.some(
      (sub) => sub.article === article && sub.paragraph === paragraph
    );
  }

  if (/particulars/i.test(packageId)) {
    return scope.subsections.some(
      (sub) => sub.article === article && sub.paragraph === 3
    );
  }

  return false;
}

function matrixArticleFromCandidate(candidate: ResolutionCandidate): number | undefined {
  const fromDescription = candidate.description?.match(/\bArticle\s+(\d{1,3})\b/i);
  if (fromDescription) return Number(fromDescription[1]);
  return undefined;
}

export function capabilityIdMatchesScope(
  id: string,
  scope: ExplicitScope,
  catalog?: ResolutionCandidate[]
): boolean {
  if (!scopeBoundaryActive(scope)) return true;

  const candidate = catalog?.find((entry) => entry.id === id);
  if (candidate?.kind === "risk_category") return true;

  if (candidate?.kind === "package") {
    return packageIdMatchesScope(id, scope);
  }

  if (candidate?.kind === "matrix_row") {
    const article = matrixArticleFromCandidate(candidate);
    if (article === undefined) return true;
    if (scope.contextArticles.includes(article)) return false;
    if (!scope.articles.includes(article)) return false;
    return true;
  }

  return ruleIdMatchesScope(id, scope);
}

export function filterIdsByScope(
  ids: string[],
  scope: ExplicitScope,
  catalog?: ResolutionCandidate[]
): string[] {
  if (!scopeBoundaryActive(scope)) return ids;
  return ids.filter((id) => capabilityIdMatchesScope(id, scope, catalog));
}

export function renderScopeForCatalogPrompt(scope: ExplicitScope): string | undefined {
  if (!scopeBoundaryActive(scope)) return undefined;

  const lines = [
    "EXPLICIT SCOPE BOUNDARY (mandatory — do not expand beyond this):",
    `- In-scope articles: ${scope.articles.join(", ")}`,
  ];

  if (scope.subsections?.length) {
    lines.push(
      `- Subsection scope: ${scope.subsections
        .map((sub) => {
          const base = `Article ${sub.article}${sub.paragraph !== undefined ? `(${sub.paragraph})` : ""}`;
          if (sub.letters?.length) return `${base}(${sub.letters.join(", ")})`;
          return base;
        })
        .join("; ")}`
    );
  }

  if (scope.contextArticles.length > 0) {
    lines.push(
      `- Context-only articles (legal background only — do NOT schedule as separate rule checks): ${scope.contextArticles.join(", ")}`
    );
  }

  lines.push(
    "- Cross-referenced articles inform parent-rule evaluation only (e.g. assess the Art 28(3)(f) assistance promise; do NOT add separate Art 32–36 compliance reviews).",
    "- Put only in-scope capabilities in requiredIds. Never promote context articles to requiredIds.",
    "- Adjacent or related articles (e.g. Art 29 when user asked for Art 28) belong in supportingIds at most, not requiredIds."
  );

  return lines.join("\n");
}
