import type { StructuredFacts } from "../../models/structured-facts.js";
import { isPlaceholderString, parsePartyPairFromText } from "../plan/core-deal-facts.js";

export interface DealIdentity {
  partyA: string;
  partyB: string;
  roleA: string;
  roleB: string;
  effectiveDate?: string;
  principalAgreementDate?: string;
  governingLaw?: string;
  glossary: Record<string, string>;
  isMutual?: boolean;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t || isPlaceholderString(t)) return undefined;
  return t;
}

function resolvePartyPair(facts: StructuredFacts | Record<string, unknown>): {
  partyA?: string;
  partyB?: string;
} {
  const f = facts as Record<string, unknown>;

  // Check specific privacy / contract role fields first
  const fiduciary =
    asString(f.dataFiduciaryLegalName) ||
    asString(f.dataFiduciary) ||
    asString(f.fiduciaryLegalName) ||
    asString(f.fiduciary) ||
    asString(f.legalNameOfTheDataFiduciary);
  const controller =
    asString(f.dataControllerLegalName) ||
    asString(f.dataController) ||
    asString(f.controllerLegalName) ||
    asString(f.controller) ||
    asString(f.legalNameOfTheDataController);
  const processor =
    asString(f.dataProcessorLegalName) ||
    asString(f.dataProcessor) ||
    asString(f.processorLegalName) ||
    asString(f.processor) ||
    asString(f.legalNameOfTheDataProcessor);
  if ((fiduciary || controller) && processor) {
    return { partyA: fiduciary || controller, partyB: processor };
  }

  const disclosing = asString(f.disclosingParty);
  const receiving = asString(f.receivingParty);
  if (disclosing && receiving) {
    return { partyA: disclosing, partyB: receiving };
  }

  const partyA = asString(f.partyA);
  const partyB = asString(f.partyB);
  if (partyA && partyB) return { partyA, partyB };

  if (typeof f.parties === "string") {
    const parsed = parsePartyPairFromText(f.parties);
    if (parsed?.partyA && parsed?.partyB) {
      return { partyA: parsed.partyA, partyB: parsed.partyB };
    }
  }

  const parties = Array.isArray(f.parties)
    ? f.parties
        .filter((p): p is string => typeof p === "string" && !isPlaceholderString(p))
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  if (parties.length >= 2) {
    return { partyA: parties[0], partyB: parties[1] };
  }
  if (parties.length === 1) {
    const parsed = parsePartyPairFromText(parties[0]);
    if (parsed?.partyA && parsed?.partyB) {
      return { partyA: parsed.partyA, partyB: parsed.partyB };
    }
  }
  if (partyA && parties[0] && partyA.toLowerCase() !== parties[0].toLowerCase()) {
    return { partyA, partyB: parties[0] };
  }
  if (partyB && parties[0] && partyB.toLowerCase() !== parties[0].toLowerCase()) {
    return { partyA: parties[0], partyB };
  }
  if ((fiduciary || controller) && (partyB || parties[0])) {
    return { partyA: fiduciary || controller, partyB: partyB || parties[0] };
  }
  if (processor && (partyA || parties[0])) {
    return { partyA: partyA || parties[0], partyB: processor };
  }

  return { partyA, partyB };
}

function rolesForDocType(
  documentType: string | undefined,
  facts?: StructuredFacts | Record<string, unknown>,
  instructionsText?: string
): { roleA: string; roleB: string } {
  const f = (facts ?? {}) as Record<string, unknown>;
  const explicitA = asString(f.roleA);
  const explicitB = asString(f.roleB);
  if (explicitA && explicitB) {
    return { roleA: explicitA, roleB: explicitB };
  }

  const raw = (documentType || "").toLowerCase();
  const regime = String(f.privacyRegime || "").toLowerCase();
  const law = String(f.governingLaw || "").toLowerCase();
  const instructions = (
    instructionsText ||
    String(f.instructionText || "") +
      " " +
      String(f.rawInstructions || "") +
      " " +
      String(f.instructions || "")
  ).toLowerCase();
  const isDpdpa =
    regime.includes("dpdpa") ||
    regime.includes("dpdp") ||
    law.includes("india") ||
    instructions.includes("dpdpa") ||
    instructions.includes("digital personal data protection") ||
    instructions.includes("data fiduciary") ||
    Boolean(
      f.dataFiduciaryLegalName ||
        f.dataProcessorLegalName ||
        f.dataFiduciary ||
        f.dataProcessor
    );

  const isMutual =
    instructions.includes("mutual") ||
    raw.includes("mutual") ||
    String(f.ndaType || "").toLowerCase().includes("mutual") ||
    String(f.agreementType || "").toLowerCase().includes("mutual");

  if (raw.includes("dpa") || raw.includes("data processing") || raw.includes("addendum")) {
    if (isDpdpa) {
      return { roleA: "Data Fiduciary", roleB: "Data Processor" };
    }
    return { roleA: "Controller", roleB: "Processor" };
  }
  if (raw.includes("nda") || raw.includes("non-disclosure") || raw.includes("confidential")) {
    if (isMutual) {
      return { roleA: "Party A", roleB: "Party B" };
    }
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
  documentType?: string,
  rawInstructions?: string
): DealIdentity | null {
  const f = (facts ?? {}) as Record<string, unknown>;
  const { partyA, partyB } = resolvePartyPair(f);
  if (!partyA || !partyB) return null;

  const combinedInstructions = (
    String(rawInstructions || "") +
    " " +
    String(f.instructionText || "") +
    " " +
    String(f.rawInstructions || "") +
    " " +
    String(f.instructions || "")
  ).trim();

  const { roleA, roleB } = rolesForDocType(
    documentType || asString(f.documentType),
    f,
    combinedInstructions
  );
  const effectiveDate =
    asString(f.effectiveDate) || asString(f.principalAgreementDate);
  const principalAgreementDate =
    asString(f.principalAgreementDate) || asString(f.effectiveDate);

  let governingLaw = asString(f.governingLaw);
  if (governingLaw) {
    const glLower = governingLaw.trim().toLowerCase();
    if (
      glLower === "gdpr (eu)" ||
      glLower === "gdpr (european union)" ||
      glLower === "gdpr" ||
      glLower === "european union (eu)" ||
      glLower === "european union" ||
      glLower === "eu" ||
      glLower === "europe" ||
      glLower === "eea"
    ) {
      governingLaw =
        "the European Union (EU), with jurisdiction of the competent courts of the European Union";
    } else if (
      glLower === "ireland" ||
      glLower === "republic of ireland" ||
      glLower === "irish" ||
      glLower === "republic of ireland (eu)"
    ) {
      governingLaw =
        "the Republic of Ireland, with exclusive jurisdiction of the courts of Dublin, Ireland";
    } else if (
      glLower === "ccpa (us)" ||
      glLower === "ccpa" ||
      glLower === "cpra"
    ) {
      governingLaw =
        "the State of California, United States, with exclusive jurisdiction of the state and federal courts located in California";
    } else if (
      glLower === "dpdpa (india)" ||
      glLower === "dpdpa"
    ) {
      governingLaw =
        "the laws of India, with exclusive jurisdiction of the competent courts of New Delhi, India";
    } else if (
      glLower === "uk gdpr / english law" ||
      glLower === "uk gdpr (england & wales)" ||
      glLower === "uk gdpr" ||
      glLower === "english law"
    ) {
      governingLaw =
        "England and Wales, with exclusive jurisdiction of the courts of England and Wales";
    }
  }

  const isMutual =
    combinedInstructions.toLowerCase().includes("mutual") ||
    String(f.ndaType || "").toLowerCase().includes("mutual") ||
    String(f.agreementType || "").toLowerCase().includes("mutual") ||
    (documentType || "").toLowerCase().includes("mutual") ||
    (roleA === "Party A" && roleB === "Party B");

  const glossary: Record<string, string> = {
    [roleA]: partyA,
    [roleB]: partyB,
    "Party A": partyA,
    "Party B": partyB,
  };

  if (roleA === "Data Fiduciary" || roleB === "Data Processor") {
    glossary["Data Fiduciary"] = roleA === "Data Fiduciary" ? partyA : partyB;
    glossary["Data Processor"] = roleB === "Data Processor" ? partyB : partyA;
    glossary.DataFiduciary = glossary["Data Fiduciary"];
    glossary.DataProcessor = glossary["Data Processor"];
  } else {
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
    isMutual,
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
  const isDpdpa =
    identity.roleA === "Data Fiduciary" ||
    identity.roleB === "Data Processor" ||
    identity.roleA.toLowerCase().includes("fiduciary") ||
    identity.roleB.toLowerCase().includes("processor");

  const rules = [
    "RULES:",
    `1. Use ONLY these two party names. Never invent, rename, or substitute other companies (no alternate Inc./GmbH/Ltd names).`,
    isDpdpa
      ? `2. Under the DPDP Act 2023, the statutory roles are "${identity.roleA}" and "${identity.roleB}". Do NOT use GDPR labels "Controller", "Processor", or "Data Subject".`
      : `2. When you write "${identity.roleA}" or "Controller"/"Disclosing Party", it MUST mean ${identity.partyA}.`,
    isDpdpa
      ? `3. When you write "${identity.roleA}", it MUST mean ${identity.partyA}. When you write "${identity.roleB}", it MUST mean ${identity.partyB}.`
      : `3. When you write "${identity.roleB}" or "Processor"/"Receiving Party", it MUST mean ${identity.partyB}.`,
    "4. Do not introduce a third commercial party as a contracting party.",
  ];

  if (identity.isMutual) {
    rules.push(
      "5. MUTUAL AGREEMENT RULE: This is a bilateral mutual agreement between commercial partners. You are strictly forbidden from labeling either party as 'Client', 'Independent Contractor', 'Employer', or 'Employee'. Refer to the parties as 'Party A' and 'Party B' or by their corporate short names."
    );
  }

  return [
    "DEAL IDENTITY LOCK (mandatory — identical in every section):",
    `- ${identity.roleA} / Party A legal name: ${identity.partyA}`,
    `- ${identity.roleB} / Party B legal name: ${identity.partyB}`,
    identity.effectiveDate ? `- Effective Date: ${identity.effectiveDate}` : "",
    identity.principalAgreementDate
      ? `- Principal / MSA Date: ${identity.principalAgreementDate}`
      : "",
    identity.governingLaw ? `- Governing Law: ${identity.governingLaw}` : "",
    ...rules,
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
