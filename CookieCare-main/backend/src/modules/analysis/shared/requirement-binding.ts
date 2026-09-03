/**
 * Phase 2 — structural requirement binding.
 *
 * Builds the explicit request-id ↔ package-native-id links that replace the
 * hand-maintained alias tables in `requirement-identity.ts` as the source of
 * correctness for joining ACT findings back to requirements. Everything here is
 * derived from data the system already has for THIS run — the request ids the
 * classifier produced, the native ids/capabilities a package authored — never a
 * lookup table someone maintains against future LLM phrasings.
 *
 * Derivation ladder (strongest unambiguous tier wins):
 *   1. canonical    — request ≡ native (identical / alias / token-set equal)
 *   2. subprovision — native's article/paragraph key nests under the request's,
 *                     OR native's topic tokens are a proper subset of the
 *                     request's (a MERGED request id split across two natives,
 *                     e.g. `…subject_matter_duration` → `…duration` + `…subject_matter`)
 *   3. capability   — request→capability and native→capability sets intersect
 * A unique semantic score may identify one native, and exact package/article
 * umbrellas may intentionally bind all authored children. Capability matching
 * is accepted only when it identifies one native.
 * An unmatched or ambiguous request yields no binding: package selection alone
 * never makes all package findings evidence for that request.
 */
import type {
  RequirementBinding,
  RequirementBindingRelation,
  RequirementBindingSource,
} from "../models/analysis-plan.js";
import {
  articleNumberFromRequirementId,
  subprovisionKeyFromId,
} from "./article-linkage.js";
import { requirementIdsEquivalent } from "./requirement-identity.js";

/** Namespace/filler tokens carrying no identifying content. */
const IGNORED_TOKEN = /^(?:gdpr|ukgdpr|ccpa|cpra|and|or|of|the|a|an|to|for|art|article|req|requirement|compliance|assessment|review|gap|analysis|adequacy|completeness|overall|check|verify|whether|identify|identifies|evaluation|agreement|contract|provision|including)\d*$/;

function normalizeToken(token: string): string {
  // Lightweight, domain-neutral singularisation. This deliberately avoids a
  // legal-topic dictionary: new clauses and regimes receive the same treatment.
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

/** Topic tokens of a requirement id (namespace/filler stripped). */
export function requirementTokens(id: string): Set<string> {
  return new Set(
    id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .split(/[._]+/)
      .filter((t) => t.length > 0 && !/^\d+$/.test(t) && !IGNORED_TOKEN.test(t))
      .map(normalizeToken)
  );
}

function isContentFreeUmbrellaId(id: string): boolean {
  const parts = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .split("_")
    .filter(Boolean);
  if (parts.length < 3) return false;
  // Treat the leading segment as an arbitrary regime/namespace only when the
  // entire remaining id is generic planning vocabulary. This adapts to new
  // regimes without declaring substantive two-part ids (duration.compliance,
  // audit.right, and so on) to be umbrellas.
  return parts.slice(1).every(
    (part) => /^\d+$/.test(part) || IGNORED_TOKEN.test(part)
  );
}

function isProperSubset(inner: Set<string>, outer: Set<string>): boolean {
  if (inner.size === 0 || inner.size >= outer.size) return false;
  for (const t of inner) if (!outer.has(t)) return false;
  return true;
}

function intersects(a: Set<string>, b: Iterable<string>): boolean {
  for (const t of b) if (a.has(t)) return true;
  return false;
}

function sameArticleOrNeither(
  reqArticle: number | undefined,
  nativeArticle: number | undefined
): boolean {
  if (nativeArticle === undefined) return true;
  return reqArticle === nativeArticle;
}

/** Package-side inputs the derivation reads (kept minimal so callers stay decoupled). */
export interface PackageBindingInput {
  packageId: string;
  nativeRequirementIds: string[];
  /** All packages selected for this run (used to validate an explicit multi-package parent edge). */
  selectedPackageIds?: string[];
  /** Number of classifier-authored request requirements in this run. */
  requestRequirementCount?: number;
  /** nativeRequirementId → authored capability ids (empty when the package omits the map). */
  nativeCapabilities?: Map<string, string[]>;
  /** Request id -> the classifier's own description for this run. */
  requestDescriptions?: Map<string, string>;
  /** Package-native id -> authored hypothesis/proof description. */
  nativeDescriptions?: Record<string, string>;
  /** Package metadata used only to detect an exact package-wide umbrella. */
  packageDescription?: string;
  packageCapabilityIds?: string[];
  facetId?: string;
}

function combinedTokens(...values: Array<string | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const token of requirementTokens(value)) out.add(token);
  }
  return out;
}

function equalTokens(a: Set<string>, b: Set<string>): boolean {
  return a.size > 0 && a.size === b.size && [...a].every((token) => b.has(token));
}

function semanticScore(request: Set<string>, native: Set<string>): number {
  if (request.size === 0 || native.size === 0) return 0;
  let overlap = 0;
  for (const token of request) if (native.has(token)) overlap += 1;
  if (overlap < 2) return 0;
  const containment = overlap / Math.min(request.size, native.size);
  if (containment < 0.45) return 0;
  const union = new Set([...request, ...native]).size;
  return containment * 2 + overlap / union;
}

/**
 * Count request terms that distinguish one authored native requirement from its
 * package siblings. The vocabulary is derived from the selected package for the
 * current run; there is no domain/topic alias table here. This breaks otherwise
 * close semantic ties (for example, several siblings may all mention the package
 * topic) while preserving the fail-closed unique-winner rule below.
 */
function discriminatingOverlap(
  request: Set<string>,
  native: Set<string>,
  siblingConcepts: Set<string>[]
): number {
  let count = 0;
  for (const token of native) {
    if (!request.has(token)) continue;
    const siblingFrequency = siblingConcepts.reduce(
      (total, sibling) => total + (sibling.has(token) ? 1 : 0),
      0
    );
    if (siblingFrequency === 1) count += 1;
  }
  return count;
}

function articleFamilies(ids: string[]): Set<number> {
  const out = new Set<number>();
  for (const id of ids) {
    const article = articleNumberFromRequirementId(id);
    if (article) out.add(article);
  }
  return out;
}

function classifyPair(
  requestId: string,
  reqTokens: Set<string>,
  reqArticle: number | undefined,
  nativeId: string
): { relation: RequirementBindingRelation; source: RequirementBindingSource } | undefined {
  if (requirementIdsEquivalent(requestId, nativeId)) {
    return { relation: "direct", source: "canonical" };
  }

  const reqKey = subprovisionKeyFromId(requestId);
  const natKey = subprovisionKeyFromId(nativeId);
  if (reqKey && natKey && natKey !== reqKey && natKey.startsWith(reqKey)) {
    return { relation: "child", source: "subprovision" };
  }

  const nativeArticle = articleNumberFromRequirementId(nativeId);
  const nativeTokens = requirementTokens(nativeId);
  if (
    sameArticleOrNeither(reqArticle, nativeArticle) &&
    equalTokens(nativeTokens, reqTokens)
  ) {
    return { relation: "direct", source: "canonical" };
  }
  if (
    sameArticleOrNeither(reqArticle, nativeArticle) &&
    isProperSubset(nativeTokens, reqTokens)
  ) {
    return { relation: "child", source: "subprovision" };
  }

  return undefined;
}

/**
 * Derive bindings for one package against the request requirements that selected
 * it. `requestCapabilities` returns the capability ids the classifier mapped a
 * given request id to (from `focus.requirementMappings`).
 */
export function deriveStructuralBindings(
  requestRequirementIds: string[],
  requestCapabilities: (requestId: string) => string[],
  pkg: PackageBindingInput
): RequirementBinding[] {
  const out: RequirementBinding[] = [];
  for (const requestId of requestRequirementIds) {
    const reqTokens = requirementTokens(requestId);
    const reqArticle = articleNumberFromRequirementId(requestId);
    const reqCaps = new Set(requestCapabilities(requestId));

    const requestConcept = combinedTokens(
      requestId,
      pkg.requestDescriptions?.get(requestId)
    );
    const packageConcept = combinedTokens(pkg.packageId, pkg.packageDescription);
    const packageArticles = articleFamilies(pkg.packageCapabilityIds ?? []);
    // A single classifier requirement explicitly mapped to multiple selected
    // component packages is their structural parent even when its generated id
    // contains substantive-looking words. This reads the PLAN graph rather than
    // guessing from unstable classifier wording. Requiring a single request
    // prevents compound/matrix asks from collapsing into package-wide bindings.
    const mappedSelectedPackageCount = (pkg.selectedPackageIds ?? []).filter(
      (packageId) => reqCaps.has(packageId)
    ).length;
    const explicitMultiPackageUmbrella =
      (pkg.requestRequirementCount ?? requestRequirementIds.length) === 1 &&
      mappedSelectedPackageCount >= 2 &&
      reqCaps.has(pkg.packageId);

    // A classifier may also author a deliberately content-free umbrella id and
    // map it directly to one package. This remains a structural edge, not a
    // package-selection fallback.
    const explicitPackageUmbrella =
      explicitMultiPackageUmbrella ||
      ((reqTokens.size === 0 || isContentFreeUmbrellaId(requestId)) &&
        reqCaps.has(pkg.packageId));
    const umbrella =
      explicitPackageUmbrella ||
      equalTokens(requestConcept, packageConcept) ||
      (Boolean(reqArticle) && reqTokens.size === 0 && packageArticles.has(reqArticle!));
    if (umbrella) {
      for (const nativeId of pkg.nativeRequirementIds) {
        out.push({
          requestRequirementId: requestId,
          nativeRequirementId: nativeId,
          packageId: pkg.packageId,
          relation: "child",
          source: "semantic",
          facetId: pkg.facetId,
        });
      }
      continue;
    }

    const strongMatches: RequirementBinding[] = [];
    for (const nativeId of pkg.nativeRequirementIds) {
      const hit = classifyPair(
        requestId,
        reqTokens,
        reqArticle,
        nativeId
      );
      if (hit) {
        strongMatches.push({
          requestRequirementId: requestId,
          nativeRequirementId: nativeId,
          packageId: pkg.packageId,
          relation: hit.relation,
          source: hit.source,
          facetId: pkg.facetId,
        });
      }
    }

    if (strongMatches.length > 0) {
      out.push(...strongMatches);
      continue;
    }

    const requestDescription = pkg.requestDescriptions?.get(requestId);
    const nativeConcepts = pkg.nativeRequirementIds.map((nativeId) => ({
      nativeId,
      tokens: combinedTokens(nativeId, pkg.nativeDescriptions?.[nativeId]),
    }));
    const siblingConcepts = nativeConcepts.map((candidate) => candidate.tokens);
    const semanticCandidates = requestDescription
      ? nativeConcepts
      .map(({ nativeId, tokens }) => ({
        nativeId,
        score: pkg.nativeDescriptions?.[nativeId]
          ? semanticScore(requestConcept, tokens) +
            discriminatingOverlap(requestConcept, tokens, siblingConcepts) * 0.35
          : 0,
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      : [];
    const semanticWinner = semanticCandidates[0];
    const semanticRunnerUp = semanticCandidates[1];
    if (
      semanticWinner &&
      (!semanticRunnerUp || semanticWinner.score - semanticRunnerUp.score >= 0.2)
    ) {
      out.push({
        requestRequirementId: requestId,
        nativeRequirementId: semanticWinner.nativeId,
        packageId: pkg.packageId,
        relation: "semantic",
        source: "semantic",
        facetId: pkg.facetId,
      });
      continue;
    }

    const capabilityMatches = pkg.nativeRequirementIds.filter((nativeId) => {
      const nativeCaps = pkg.nativeCapabilities?.get(nativeId) ?? [];
      return reqCaps.size > 0 && nativeCaps.length > 0 && intersects(reqCaps, nativeCaps);
    });
    if (capabilityMatches.length === 1) {
      out.push({
        requestRequirementId: requestId,
        nativeRequirementId: capabilityMatches[0]!,
        packageId: pkg.packageId,
        relation: "direct",
        source: "capability",
        facetId: pkg.facetId,
      });
    }
  }
  return out;
}

/**
 * Native requirement id(s) a finding stamped with `findingNativeId` answers for a
 * given request id — reading the binding graph, not fuzzy id matching. Returns
 * true when the finding's native id is bound to `requestId`.
 */
export function bindingLinksFindingToRequest(
  bindings: RequirementBinding[],
  findingNativeId: string | undefined,
  requestId: string
): boolean {
  if (!findingNativeId) return false;
  return bindings.some(
    (b) =>
      b.requestRequirementId === requestId &&
      requirementIdsEquivalent(b.nativeRequirementId, findingNativeId)
  );
}

/** All request requirement ids a given native finding id is bound to. */
export function requestIdsForNative(
  bindings: RequirementBinding[],
  findingNativeId: string | undefined
): string[] {
  if (!findingNativeId) return [];
  const out = new Set<string>();
  for (const b of bindings) {
    if (requirementIdsEquivalent(b.nativeRequirementId, findingNativeId)) {
      out.add(b.requestRequirementId);
    }
  }
  return [...out];
}
