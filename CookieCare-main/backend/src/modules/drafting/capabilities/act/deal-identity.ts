import type { StructuredFacts } from "../../models/structured-facts.js";

export interface DealIdentity {
  partyA: string;
  partyB: string;
  roleA: string;
  roleB: string;
  effectiveDate?: string;
  principalAgreementDate?: string;
  governingLaw?: string;
  glossary: Record<string, string>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function resolvePartyPair(facts: StructuredFacts | Record<string, unknown>): {
  partyA?: string;
  partyB?: string;
} {
  const partyA = asString(facts.partyA);
  const partyB = asString(facts.partyB);
  if (partyA && partyB) return { partyA, partyB };

  const parties = Array.isArray(facts.parties)
    ? facts.parties.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  if (parties.length >= 2) {
    return { partyA: parties[0].trim(), partyB: parties[1].trim() };
  }
  if (partyA && parties[0]) return { partyA, partyB: parties[0].trim() };
  if (partyB && parties[0]) return { partyA: parties[0].trim(), partyB };
  return { partyA, partyB };
}

function rolesForDocType(documentType: string | undefined): { roleA: string; roleB: string } {
  const raw = (documentType || "").toLowerCase();
  if (raw.includes("dpa") || raw.includes("data processing") || raw.includes("addendum")) {
    return { roleA: "Controller", roleB: "Processor" };
  }
  if (raw.includes("nda") || raw.includes("non-disclosure") || raw.includes("confidential")) {
    return { roleA: "Disclosing Party", roleB: "Receiving Party" };
  }
  return { roleA: "Party A", roleB: "Party B" };
}

/**
 * Freeze party/date identity once facts are known so every ACT section
 * uses the same names (prevents HealthTech vs OmniHealth drift).
 */
export function buildDealIdentity(
  facts: StructuredFacts | Record<string, unknown> | undefined,
  documentType?: string
): DealIdentity | null {
  const f = (facts ?? {}) as Record<string, unknown>;
  const { partyA, partyB } = resolvePartyPair(f);
  if (!partyA || !partyB) return null;

  const { roleA, roleB } = rolesForDocType(
    documentType || asString(f.documentType)
  );
  const effectiveDate =
    asString(f.effectiveDate) || asString(f.principalAgreementDate);
  const principalAgreementDate =
    asString(f.principalAgreementDate) || asString(f.effectiveDate);
  const governingLaw = asString(f.governingLaw);

  const glossary: Record<string, string> = {
    [roleA]: partyA,
    [roleB]: partyB,
    "Party A": partyA,
    "Party B": partyB,
  };

  // Force role aliases used across DPA/NDA sections
  if (roleA === "Controller" || roleB === "Controller") {
    glossary.Controller = roleA === "Controller" ? partyA : partyB;
  } else {
    glossary.Controller = partyA;
  }
  if (roleA === "Processor" || roleB === "Processor") {
    glossary.Processor = roleB === "Processor" ? partyB : partyA;
  } else {
    glossary.Processor = partyB;
  }
  if (roleA === "Disclosing Party") glossary["Disclosing Party"] = partyA;
  if (roleB === "Receiving Party") glossary["Receiving Party"] = partyB;

  if (effectiveDate) {
    glossary["Effective Date"] = effectiveDate;
    glossary.EffectiveDate = effectiveDate;
  }
  if (principalAgreementDate) {
    glossary["Principal Agreement Date"] = principalAgreementDate;
    glossary["MSA Date"] = principalAgreementDate;
  }
  if (governingLaw) {
    glossary["Governing Law"] = governingLaw;
  }

  return {
    partyA,
    partyB,
    roleA,
    roleB,
    effectiveDate,
    principalAgreementDate,
    governingLaw,
    glossary,
  };
}

/** Merge frozen identity into plan.glossary without letting later sections overwrite parties. */
export function applyDealIdentityToPlanGlossary(
  existing: Record<string, string> | undefined,
  identity: DealIdentity
): Record<string, string> {
  const lockedKeys = new Set(Object.keys(identity.glossary));
  const kept: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (!lockedKeys.has(k)) kept[k] = v;
  }
  return { ...kept, ...identity.glossary };
}

/** Prompt block injected into every section/exhibit draft. */
export function formatDealIdentityLock(identity: DealIdentity): string {
  return [
    "DEAL IDENTITY LOCK (mandatory — identical in every section):",
    `- ${identity.roleA} / Party A legal name: ${identity.partyA}`,
    `- ${identity.roleB} / Party B legal name: ${identity.partyB}`,
    identity.effectiveDate ? `- Effective Date: ${identity.effectiveDate}` : "",
    identity.principalAgreementDate
      ? `- Principal / MSA Date: ${identity.principalAgreementDate}`
      : "",
    identity.governingLaw ? `- Governing Law: ${identity.governingLaw}` : "",
    "RULES:",
    `1. Use ONLY these two party names. Never invent, rename, or substitute other companies (no alternate Inc./GmbH/Ltd names).`,
    `2. When you write "${identity.roleA}" or "Controller"/"Disclosing Party", it MUST mean ${identity.partyA}.`,
    `3. When you write "${identity.roleB}" or "Processor"/"Receiving Party", it MUST mean ${identity.partyB}.`,
    "4. Do not introduce a third commercial party as a contracting party.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Formal corporate suffixes only — require a space before the suffix. */
const ENTITY_SUFFIX_RE =
  /\b([A-Z][A-Za-z0-9,&'’.-]*(?:\s+[A-Z][A-Za-z0-9,&'’.-]*)*\s+(?:Inc\.?|Incorporated|LLC|L\.L\.C\.|Ltd\.?|Limited|GmbH|AG|Corp\.?|Corporation|PLC|LLP))\b/g;

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Detect foreign legal-entity names in the draft that are not the frozen parties.
 * Returns unique offending strings.
 */
export function findForeignPartyNames(
  document: string,
  identity: DealIdentity
): string[] {
  const allowed = new Set(
    [identity.partyA, identity.partyB].map(normalizeName)
  );
  const hits = [...document.matchAll(ENTITY_SUFFIX_RE)].map((m) => m[1].trim());
  const foreign: string[] = [];
  for (const hit of hits) {
    const n = normalizeName(hit);
    if (!n || n.length < 4) continue;
    // Skip bare suffix-only matches (e.g. "Limited" alone).
    const withoutSuffix = n
      .replace(
        /\b(inc|incorporated|llc|l l c|ltd|limited|gmbh|ag|corp|corporation|plc|llp)\b/g,
        ""
      )
      .trim();
    if (!withoutSuffix || withoutSuffix.length < 2) continue;
    let ok = false;
    for (const a of allowed) {
      if (n === a || a.includes(n) || n.includes(a)) {
        ok = true;
        break;
      }
    }
    if (!ok) foreign.push(hit);
  }
  return [...new Set(foreign)];
}
