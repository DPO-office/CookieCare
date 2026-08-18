import type { StandardAxis } from "../../models/intent.js";
import { hasPlaybookRule, hasRegimeRule } from "../../skills/registry.js";

/** Map classifier / user-facing standard ids to canonical regime pack ids. */
const REGIME_PACK_ALIASES: Record<string, string> = {
  "gdpr-article-28": "regimes/data-protection/gdpr",
  "gdpr-article28": "regimes/data-protection/gdpr",
  "gdpr-art28": "regimes/data-protection/gdpr",
  "gdpr-art-28": "regimes/data-protection/gdpr",
  "article-28-gdpr": "regimes/data-protection/gdpr",
  "gdpr-dpa": "regimes/data-protection/gdpr",
  "privacy-gdpr-dpa": "regimes/data-protection/gdpr",
  gdpr: "regimes/data-protection/gdpr",
  privacy: "regimes/data-protection/gdpr",
  dpa: "doc-types/dpa",
  ccpa: "regimes/data-protection/ccpa-cpra",
  cpra: "regimes/data-protection/ccpa-cpra",
  hipaa: "regimes/healthcare/hipaa-baa",
  "uk-gdpr": "regimes/data-protection/uk-gdpr-idta",
  idta: "regimes/data-protection/uk-gdpr-idta",
  sccs: "regimes/data-protection/international-transfers",
  "ai-act": "regimes/ai-governance/eu-ai-act",
};

function canonicalRegimePackId(id: string): string {
  const normalized = id.trim().toLowerCase();
  return REGIME_PACK_ALIASES[normalized] ?? id.trim();
}

function isValidRegimePack(id: string): boolean {
  return hasRegimeRule(id);
}

/**
 * Deterministic keyword → regime-pack map used to turn a free-form semantic
 * standard concept (e.g. "GDPR Article 28", "UK GDPR / IDTA") into an existing
 * registry regime pack. This never fabricates an ID — every target is validated
 * against the registry before it is returned. More specific regimes are listed
 * before broader ones (e.g. "uk gdpr" before "gdpr") so overlapping keywords
 * resolve to the narrowest correct pack.
 */
const CONCEPT_KEYWORD_PACKS: Array<{ re: RegExp; pack: string }> = [
  { re: /\bhipaa\b|\bbaa\b/i, pack: "regimes/healthcare/hipaa-baa" },
  { re: /\b(?:ccpa|cpra)\b/i, pack: "regimes/data-protection/ccpa-cpra" },
  { re: /\buk[\s-]?gdpr\b|\bidta\b/i, pack: "regimes/data-protection/uk-gdpr-idta" },
  {
    re: /\bsccs?\b|\bstandard contractual clauses?\b|\binternational (?:data )?transfers?\b|\bschrems\b/i,
    pack: "regimes/data-protection/international-transfers",
  },
  { re: /\b(?:eu\s+)?ai act\b|\bai governance\b/i, pack: "regimes/ai-governance/eu-ai-act" },
  {
    re: /\bgdpr\b|\bgeneral data protection regulation\b/i,
    pack: "regimes/data-protection/gdpr",
  },
];

/**
 * Deterministically resolve a semantic standard concept to an existing registry
 * regime pack. Semantic understanding (the concept itself) is produced upstream
 * by the LLM; this layer only performs a validated, non-LLM lookup and will
 * never invent a registry identifier that does not exist.
 */
export function resolveStandardConceptToRegistry(
  concept: string | undefined
): { standard: StandardAxis; unresolved?: string } {
  const trimmed = typeof concept === "string" ? concept.trim() : "";
  if (!trimmed) return { standard: "none" };

  for (const { re, pack } of CONCEPT_KEYWORD_PACKS) {
    if (re.test(trimmed) && isValidRegimePack(pack)) {
      return { standard: `regime_pack:${pack}` };
    }
  }

  return { standard: "none", unresolved: trimmed };
}

/**
 * Normalize a classifier standard string into a closed StandardAxis value.
 * Preserves unresolved strings only when no registry match exists.
 */
export function normalizeStandard(
  s: string,
  documentIds: string[] = []
): { standard: StandardAxis; unresolved?: string } {
  if (!s || s === "none") return { standard: "none" };

  const colon = s.indexOf(":");
  if (colon < 0) {
    const aliased = canonicalRegimePackId(s);
    if (aliased !== s && isValidRegimePack(aliased)) {
      return { standard: `regime_pack:${aliased}` };
    }
    if (isValidRegimePack(s)) return { standard: `regime_pack:${s}` };
    return { standard: "none", unresolved: s };
  }

  const kind = s.slice(0, colon);
  const rawId = s.slice(colon + 1).trim();
  if (!rawId) return { standard: "none", unresolved: s };

  if (kind === "regime_pack") {
    const id = canonicalRegimePackId(rawId);
    if (isValidRegimePack(id)) return { standard: `regime_pack:${id}` };
    return { standard: "none", unresolved: s };
  }
  if (kind === "playbook_rule") {
    if (hasPlaybookRule(rawId)) return { standard: `playbook_rule:${rawId}` };
    return { standard: "none", unresolved: s };
  }
  if (kind === "reference_document") {
    if (documentIds.includes(rawId)) return { standard: `reference_document:${rawId}` };
    return { standard: "none", unresolved: s };
  }

  return { standard: "none", unresolved: s };
}
