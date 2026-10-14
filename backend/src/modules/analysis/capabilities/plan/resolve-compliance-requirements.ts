import type { AnalysisSkillConfig, SkillRegimeRule } from "../../skills/runtime/catalog/types.js";
import type { IntentRequirement } from "../../models/intent.js";
import type {
  ComplianceRequestFacet,
  ComplianceRequirementResolution,
  ComplianceRequirementSelection,
  ComplianceRequirementSelectionSource,
} from "../../models/analysis-plan.js";
import {
  articleNumberFromRuleId,
  extractExplicitScope,
  ruleIdMatchesScope,
} from "../../skills/runtime/focus/extract-explicit-scope.js";
import { executeEmbedding, executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";

export interface ResolveComplianceRequirementsDocumentContext {
  documentTypes?: string[];
  jurisdictions?: string[];
  partyPerspective?: string;
  relationshipScopes?: string[];
}

export interface ResolveComplianceRequirementsInput {
  instruction: string;
  intentRequirements: IntentRequirement[];
  activeSkills: AnalysisSkillConfig[];
  documentContext?: ResolveComplianceRequirementsDocumentContext;
}

interface CandidateRule {
  skillId: string;
  skillVersion: string;
  rule: SkillRegimeRule;
}

interface RankedCandidate {
  candidate: CandidateRule;
  score: number;
  source: ComplianceRequirementSelectionSource;
}

const RRF_K = 60;
const MAX_SEMANTIC_CANDIDATES = 40;
const MAX_LLM_CANDIDATES_PER_FACET = 20;
const RULE_VECTOR_CACHE = new Map<string, Promise<Map<string, number[]> | undefined>>();

/** Resolve a free-form compliance request to atomic rules authored by the selected skills. */
export async function resolveComplianceRequirements(
  input: ResolveComplianceRequirementsInput
): Promise<ComplianceRequirementResolution> {
  const allCandidates = collectCandidateRules(input.activeSkills);
  if (allCandidates.length === 0) {
    return { facets: [], selections: [], unresolved: [], complete: true };
  }

  const candidates = allCandidates.filter((candidate) =>
    isApplicable(candidate.rule, input.documentContext)
  );
  const scope = extractExplicitScope(input.instruction);
  const exclusiveScope = hasExclusiveCitationBoundary(input.instruction);
  const facets = deriveFacets(input.instruction, input.intentRequirements, scope.articles);
  const selections: ComplianceRequirementSelection[] = [];
  const claimedByFacet = new Map<string, Set<string>>();

  const addSelection = (
    facetId: string,
    candidate: CandidateRule,
    source: ComplianceRequirementSelectionSource,
    confidence: number,
    required: boolean,
    reason: string
  ) => {
    const key = candidateKey(candidate);
    const claimed = claimedByFacet.get(facetId) ?? new Set<string>();
    if (claimed.has(key)) return;
    claimed.add(key);
    claimedByFacet.set(facetId, claimed);
    selections.push({ facetId, skillId: candidate.skillId, ruleId: candidate.rule.ruleId, source, confidence, required, reason });
  };

  // Citations are authoritative inclusions. They become an exclusive boundary
  // only when the user actually says "only", "limited to", etc.
  for (const article of scope.articles) {
    const facet = facets.find((item) => item.legalReferences.includes(String(article))) ??
      ensureFacet(facets, `citation:${article}`, `Article ${article}`, [String(article)]);
    for (const candidate of candidates) {
      if (articleNumberFromRuleId(candidate.rule.ruleId) !== article) continue;
      if (!ruleIdMatchesScope(candidate.rule.ruleId, { ...scope, articles: [article], allowOutOfScopeRules: false })) continue;
      const source: ComplianceRequirementSelectionSource =
        scope.subsections?.length || scope.articles.length === 1 ? "exact_citation" : "article_range";
      addSelection(facet.facetId, candidate, source, 0.98, true, `Matches the explicit Article ${article} request.`);
    }
  }

  const contextArticles = new Set(scope.contextArticles);

  // Compositions are aliases only. They do not own evidence or form an
  // execution boundary, and several compositions may answer one request.
  const lowerInstruction = input.instruction.toLowerCase();
  for (const skill of input.activeSkills) {
    for (const composition of skill.compositions ?? []) {
      const matchedAlias = composition.aliases.find((alias) => lowerInstruction.includes(alias.toLowerCase()));
      if (!matchedAlias) continue;
      const facet = facets.find((item) => item.sourceText.toLowerCase().includes(matchedAlias.toLowerCase())) ??
        ensureFacet(facets, `composition:${composition.id}`, composition.label);
      for (const ruleId of composition.ruleIds) {
        const article = articleNumberFromRuleId(ruleId);
        if (article !== undefined && contextArticles.has(article)) continue;
        if (exclusiveScope && article !== undefined && scope.articles.length > 0 && !ruleIdMatchesScope(ruleId, scope)) continue;
        const candidate = candidates.find((item) => item.skillId === skill.skillId && item.rule.ruleId === ruleId);
        if (!candidate) continue;
        addSelection(facet.facetId, candidate, "composition", 0.92, true, `Matched named compliance concept "${matchedAlias}".`);
      }
    }
  }

  // Full proof standards are deliberately absent from rule retrieval; those
  // standards are consumed later by evidence review and completeness checks.
  const semanticFacets = facets.filter((facet) =>
    !(claimedByFacet.get(facet.facetId)?.size) && !facet.facetId.startsWith("citation:")
  );
  if (semanticFacets.length > 0 && candidates.length > 0) {
    const denseVectors = await tryEmbedCandidates(candidates);
    for (const facet of semanticFacets) {
      const lexical = rankBm25(facet.sourceText, candidates, facet);
      const dense = denseVectors ? await rankDense(facet.sourceText, candidates, denseVectors) : [];
      const fused = fuseRankings([lexical, dense])
        .filter(({ candidate }) => {
          const article = articleNumberFromRuleId(candidate.rule.ruleId);
          if (article !== undefined && contextArticles.has(article)) return false;
          if (!exclusiveScope || scope.articles.length === 0 || article === undefined) return true;
          return ruleIdMatchesScope(candidate.rule.ruleId, scope);
        })
        .slice(0, MAX_SEMANTIC_CANDIDATES);

      const llmSelections = await reviewAmbiguousFacetsWithLlm(
        input.instruction,
        [facet],
        fused.slice(0, MAX_LLM_CANDIDATES_PER_FACET).map((row) => row.candidate)
      );
      for (const selected of llmSelections) {
        const candidate = candidates.find((item) => item.skillId === selected.skillId && item.rule.ruleId === selected.ruleId);
        if (candidate) addSelection(facet.facetId, candidate, selected.source, selected.confidence, true, selected.reason);
      }

      // If semantic services are degraded, select only a distinctive literal
      // phrase. Otherwise leave the facet visibly unresolved—never add top-N garbage.
      if (!(claimedByFacet.get(facet.facetId)?.size)) {
        for (const row of lexical.filter((item) => hasDistinctiveAliasHit(facet.sourceText, item.candidate)).slice(0, 3)) {
          addSelection(facet.facetId, row.candidate, "lexical", 0.72, true, "Distinctive atomic-rule alias matched the requested compliance facet.");
        }
      }
    }
  }

  for (const selection of [...selections]) {
    const candidate = candidates.find((item) => item.skillId === selection.skillId && item.rule.ruleId === selection.ruleId);
    for (const requiredRuleId of candidate?.rule.relationships?.requires ?? []) {
      const requiredCandidate = candidates.find((item) => item.skillId === selection.skillId && item.rule.ruleId === requiredRuleId);
      if (requiredCandidate) addSelection(selection.facetId, requiredCandidate, "dependency", 0.95, true, `Required by ${selection.ruleId}.`);
    }
  }

  const unresolved = facets.filter((facet) => !(claimedByFacet.get(facet.facetId)?.size)).map((facet) => ({
    facetId: facet.facetId,
    sourceText: facet.sourceText,
    reason: candidates.length === 0
      ? "No atomic rule is applicable to the known document context."
      : "No authored atomic rule could be safely selected for this requested compliance facet.",
  }));
  return { facets, selections, unresolved, complete: unresolved.length === 0 };
}

function collectCandidateRules(activeSkills: AnalysisSkillConfig[]): CandidateRule[] {
  return activeSkills.flatMap((skill) => (skill.regimeRules ?? [])
    .filter((rule) => Boolean(rule.authority && rule.selection && rule.investigation))
    .map((rule) => ({ skillId: skill.skillId, skillVersion: skill.version, rule })));
}

function isApplicable(rule: SkillRegimeRule, context: ResolveComplianceRequirementsDocumentContext | undefined): boolean {
  if (!context || !rule.applicability) return true;
  const overlaps = (known: string[] | undefined, allowed: string[] | undefined): boolean =>
    !known?.length || !allowed?.length || known.some((value) => allowed.includes(value));
  if (!overlaps(context.documentTypes, rule.applicability.documentTypes)) return false;
  if (!overlaps(context.jurisdictions, rule.applicability.jurisdictions)) return false;
  if (!overlaps(context.relationshipScopes, rule.applicability.relationshipScopes)) return false;
  return !(context.partyPerspective && rule.applicability.partyPerspectives?.length &&
    !rule.applicability.partyPerspectives.includes(context.partyPerspective));
}

function hasExclusiveCitationBoundary(instruction: string): boolean {
  return /\b(?:only|solely|exclusively|limited to|just)\b[\s\S]{0,100}\b(?:articles?|arts?)\b/i.test(instruction) ||
    /\b(?:articles?|arts?)\b[\s\S]{0,100}\b(?:only|solely|exclusively)\b/i.test(instruction);
}

function ensureFacet(
  facets: ComplianceRequestFacet[],
  facetId: string,
  sourceText: string,
  legalReferences: string[] = []
): ComplianceRequestFacet {
  const existing = facets.find((facet) => facet.facetId === facetId);
  if (existing) return existing;
  const facet: ComplianceRequestFacet = {
    facetId,
    sourceText,
    legalReferences,
    actors: extractActors(sourceText),
    actions: extractActions(sourceText),
    objects: extractObjects(sourceText),
  };
  facets.push(facet);
  return facet;
}

function deriveFacets(instruction: string, intentRequirements: IntentRequirement[], scopedArticles: number[]): ComplianceRequestFacet[] {
  const facets: ComplianceRequestFacet[] = [];
  const seenSource = new Set<string>();
  for (const requirement of intentRequirements) {
    const sourceText = requirement.description?.trim();
    if (!sourceText || seenSource.has(sourceText.toLowerCase())) continue;
    seenSource.add(sourceText.toLowerCase());
    ensureFacet(facets, requirement.id, sourceText, extractArticleReferences(sourceText));
  }
  if (facets.length === 1 && scopedArticles.length > 0) {
    facets[0].legalReferences = [...new Set([...facets[0].legalReferences, ...scopedArticles.map(String)])];
  }
  for (const article of scopedArticles) {
    if (facets.some((facet) => facet.legalReferences.includes(String(article)))) continue;
    ensureFacet(facets, `citation:${article}`, `Article ${article} (explicit request)`, [String(article)]);
  }

  const semanticParts = intentRequirements.length > 0
    ? []
    : instruction.replace(/\bidentify\s*:/gi, ".").split(/[.;\n]+/).map((part) => part.trim()).filter(Boolean);
  for (const [index, part] of semanticParts.entries()) {
    const stripped = part
      .replace(/\b(?:gdpr|uk gdpr|ccpa|cpra|hipaa|eu ai act)\b/gi, " ")
      .replace(/\b(?:articles?|arts?)\.?\s*\d{1,3}(?:\s*(?:-|to|,|and|&)\s*\d{1,3})*/gi, " ")
      .replace(/\b(?:review|check|assess|analy[sz]e|agreement|document|addresses?|how|this)\b/gi, " ")
      .replace(/\s+/g, " ").trim();
    const reportOnly = /^(?:identify\s+)?(?:any\s+)?(?:gaps?|violations?|risks?|recommendations?|summary|findings?)\b/i.test(stripped);
    if (reportOnly || tokenize(stripped).length < 2 || seenSource.has(part.toLowerCase())) continue;
    seenSource.add(part.toLowerCase());
    ensureFacet(facets, `instruction:${index}`, part, extractArticleReferences(part));
  }
  if (facets.length === 0) ensureFacet(facets, "instruction:0", instruction);
  return facets;
}

function extractArticleReferences(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\b(?:Articles?|Arts?)\.?\s+(\d{1,3})/gi)) out.add(match[1]);
  return [...out];
}

function extractActors(text: string): string[] {
  const actors: string[] = [];
  if (/\bsub-?processors?\b/i.test(text)) actors.push("subprocessor");
  if (/\bprocessors?\b/i.test(text)) actors.push("processor");
  if (/\bcontrollers?\b/i.test(text)) actors.push("controller");
  if (/\bdata subjects?|individuals?|consumers?\b/i.test(text)) actors.push("data_subject");
  if (/\bbusiness associates?\b/i.test(text)) actors.push("business_associate");
  if (/\bcovered entit(?:y|ies)\b/i.test(text)) actors.push("covered_entity");
  return [...new Set(actors)];
}

function extractActions(text: string): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/\bassist(?:ance)?\b/i, "assist"], [/\bnotif(?:y|ication)\b/i, "notify"],
    [/\berase|erasure|delet(?:e|ion)\b/i, "erase"], [/\brectif/i, "rectify"],
    [/\bportab/i, "port"], [/\bobject(?:ion)?\b/i, "object"],
    [/\btransfer/i, "transfer"], [/\baudit/i, "audit"], [/\baccess\b/i, "access"],
    [/\brestrict/i, "restrict"], [/\breturn|destroy\b/i, "return_or_destroy"],
  ];
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, action]) => action);
}

function extractObjects(text: string): string[] {
  const objects: string[] = [];
  if (/\bpersonal data|personal information|phi|protected health information\b/i.test(text)) objects.push("regulated_data");
  if (/\brequests?|rights?\b/i.test(text)) objects.push("rights_request");
  if (/\btimeframes?|deadlines?|without undue delay|within\b/i.test(text)) objects.push("timeframe");
  if (/\bsecurity|safeguards?|technical and organi[sz]ational\b/i.test(text)) objects.push("security_measures");
  return objects;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "by", "with", "this", "that",
  "must", "may", "shall", "is", "are", "be", "only", "not", "its", "their", "other", "any", "when",
  "where", "if", "under", "upon", "from", "as", "at", "than", "such", "into", "which", "who", "each",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function ruleSearchText(candidate: CandidateRule): string {
  const selection = candidate.rule.selection!;
  return [candidate.rule.label, ...selection.aliases, ...selection.concepts, candidate.rule.ruleText].filter(Boolean).join(" ");
}

/** In-memory BM25 over the active atomic-rule catalog. */
function rankBm25(
  query: string,
  candidates: CandidateRule[],
  facet?: ComplianceRequestFacet
): RankedCandidate[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || candidates.length === 0) return [];
  const documents = candidates.map((candidate) => tokenize(ruleSearchText(candidate)));
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) documentFrequency.set(token, documents.filter((doc) => doc.includes(token)).length);
  return candidates.map((candidate, index) => {
    const doc = documents[index];
    const frequencies = new Map<string, number>();
    for (const token of doc) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    let score = 0;
    for (const token of queryTokens) {
      const frequency = frequencies.get(token) ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (candidates.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + 1.2 * (0.25 + 0.75 * (doc.length / averageLength));
      score += idf * ((frequency * 2.2) / denominator);
    }
    const selection = candidate.rule.selection;
    const overlapCount = (wanted: string[], authored: string[] | undefined) =>
      wanted.filter((value) => authored?.includes(value)).length;
    if (facet && selection) {
      score += overlapCount(facet.actors, selection.actors) * 1.5;
      score += overlapCount(facet.actions, selection.actions) * 1.25;
      score += overlapCount(facet.objects, selection.objects) * 0.75;
    }
    return { candidate, score, source: "lexical" as const };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
}

function candidateCacheKey(candidates: CandidateRule[]): string {
  return candidates.map((candidate) => `${candidate.skillId}@${candidate.skillVersion}:${candidate.rule.ruleId}`).sort().join("|");
}

function candidateKey(candidate: CandidateRule): string {
  return `${candidate.skillId}::${candidate.rule.ruleId}`;
}

async function tryEmbedCandidates(candidates: CandidateRule[]): Promise<Map<string, number[]> | undefined> {
  const cacheKey = candidateCacheKey(candidates);
  const cached = RULE_VECTOR_CACHE.get(cacheKey);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const vectors = await executeEmbedding(candidates.map(ruleSearchText));
      const map = new Map<string, number[]>();
      vectors.forEach((vector, index) => { if (vector) map.set(candidateKey(candidates[index]), vector); });
      return map.size ? map : undefined;
    } catch (error) {
      console.warn("[resolveComplianceRequirements] dense embedding channel degraded", error);
      return undefined;
    }
  })();
  RULE_VECTOR_CACHE.set(cacheKey, pending);
  return pending;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    dot += a[index] * b[index]; normA += a[index] * a[index]; normB += b[index] * b[index];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function rankDense(query: string, candidates: CandidateRule[], vectors: Map<string, number[]>): Promise<RankedCandidate[]> {
  try {
    const [queryVector] = await executeEmbedding([query]);
    if (!queryVector) return [];
    return candidates.map((candidate) => ({
      candidate,
      score: cosineSimilarity(queryVector, vectors.get(candidateKey(candidate)) ?? []),
      source: "semantic" as const,
    })).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
  } catch (error) {
    console.warn("[resolveComplianceRequirements] dense query embedding degraded", error);
    return [];
  }
}

function fuseRankings(rankings: RankedCandidate[][]): RankedCandidate[] {
  const fused = new Map<string, RankedCandidate>();
  for (const ranking of rankings) ranking.forEach((row, rank) => {
    const key = candidateKey(row.candidate);
    const contribution = 1 / (RRF_K + rank + 1);
    const current = fused.get(key);
    if (current) current.score += contribution;
    else fused.set(key, { ...row, score: contribution });
  });
  return [...fused.values()].sort((a, b) => b.score - a.score);
}

function hasDistinctiveAliasHit(query: string, candidate: CandidateRule): boolean {
  const normalized = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ");
  return (candidate.rule.selection?.aliases ?? []).some((alias) => {
    const clean = alias.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
    return clean.split(" ").length >= 2 && clean.length >= 8 && normalized.includes(clean);
  });
}

const REVIEW_SYSTEM_PROMPT = [
  "Select the atomic compliance rules needed to answer each requested facet.",
  "Choose ONLY listed (skillId, ruleId) pairs; never invent or rewrite an id.",
  "Select every rule materially required by the facet, but no merely related rule.",
  "If none of the candidates answers a facet, return no selection for it.",
  "Do not decide whether the document complies and do not search for evidence.",
].join(" ");

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    selections: { type: "array", items: { type: "object", properties: {
      facetId: { type: "string" }, skillId: { type: "string" }, ruleId: { type: "string" }, reason: { type: "string" },
    }, required: ["facetId", "skillId", "ruleId", "reason"] } },
  },
  required: ["selections"],
};

export async function reviewAmbiguousFacetsWithLlm(
  instruction: string,
  facets: ComplianceRequestFacet[],
  candidates: CandidateRule[]
): Promise<ComplianceRequirementSelection[]> {
  if (!facets.length || !candidates.length) return [];
  const validFacets = new Set(facets.map((facet) => facet.facetId));
  const validRules = new Set(candidates.map(candidateKey));
  const prompt = [
    `Instruction: ${instruction}`,
    `Facets: ${JSON.stringify(facets)}`,
    `Candidates: ${JSON.stringify(candidates.map((candidate) => ({
      skillId: candidate.skillId, ruleId: candidate.rule.ruleId, label: candidate.rule.label,
      authority: candidate.rule.authority?.citation, selection: candidate.rule.selection,
    })))}`,
  ].join("\n\n");
  try {
    const raw = await executeJsonCompletion<{ selections: Array<{ facetId: string; skillId: string; ruleId: string; reason: string }> }>(
      prompt, REVIEW_SYSTEM_PROMPT, REVIEW_SCHEMA, LLMTask.STRUCTURAL_JSON_LITE, LLMProvider.GEMINI
    );
    return (raw?.selections ?? []).filter((selection) =>
      validFacets.has(selection.facetId) && validRules.has(`${selection.skillId}::${selection.ruleId}`)
    ).map((selection) => ({ ...selection, source: "semantic" as const, confidence: 0.7, required: true }));
  } catch (error) {
    console.warn("[resolveComplianceRequirements] bounded LLM review degraded", error);
    return [];
  }
}
