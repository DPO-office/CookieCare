import type { StructuredFacts } from "../../../models/structured-facts.js";

const EU_FAMILY_IDS = new Set(["GDPR_ART28", "UK_GDPR_IDTA", "CPRA_SP"]);

function blob(facts: StructuredFacts, extra = ""): string {
  const text = `${JSON.stringify(facts)} ${extra}`.toLowerCase();
  // "do not attach EU SCCs" must not count as a request for the EU regime.
  return text.replace(/\b(?:do not|don't|never|without|not)\b[^.]{0,100}/gi, " ");
}

const PLACEHOLDER_REGIME =
  /^(not\s+specified|unspecified|unknown|n\/?a|none|tbd|other(?:\s*\(specify\))?)$/i;

function regimeText(facts: StructuredFacts, extra = ""): string {
  return blob(facts, extra);
}

/** Chip label already stored, or inferred from the user's words. Never from a bare DPA. */
export function inferPrivacyRegime(facts: StructuredFacts, extra = ""): string | undefined {
  const explicit = String(facts.privacyRegime || "").trim();
  if (explicit && !PLACEHOLDER_REGIME.test(explicit)) return explicit;

  const law = String(facts.governingLaw || "").toLowerCase();
  const text = regimeText(facts, extra);

  if (
    /\b(india|indian)\b/.test(law) ||
    /\bdpdpa\b/.test(text) ||
    /\bdpdp\b/.test(text) ||
    text.includes("digital personal data protection") ||
    text.includes("data fiduciary")
  ) {
    return "DPDPA";
  }
  if (/\b(ccpa|cpra)\b/.test(text) || law.includes("california")) return "CCPA / CPRA";
  if (
    /\buk\s*gdpr\b/.test(text) ||
    text.includes("idta") ||
    text.includes("uk addendum")
  ) {
    return "UK GDPR";
  }
  if (
    /\bgdpr\b/.test(text) ||
    text.includes("article 28") ||
    /\beea\b/.test(text) ||
    /\beu\b/.test(text) ||
    law.includes("gdpr") ||
    law.includes("eea") ||
    /\beu\b/.test(law) ||
    law.includes("ireland")
  ) {
    return "GDPR";
  }
  return undefined;
}

export function privacyRegimeKnown(facts: StructuredFacts, extra = ""): boolean {
  return inferPrivacyRegime(facts, extra) !== undefined;
}

/** Explicit DPDPA / India data-protection ask — never inferred from a bare DPA. */
export function dpdpaRequested(facts: StructuredFacts, extra = ""): boolean {
  const law = String(facts.governingLaw || "").toLowerCase();
  if (/\b(india|indian)\b/.test(law)) return true;
  const text = blob(facts, extra);
  return (
    /\bdpdpa\b/.test(text) ||
    /\bdpdp\b/.test(text) ||
    text.includes("digital personal data protection") ||
    text.includes("data fiduciary")
  );
}

/**
 * User also asked for an EU/UK/US privacy regime, or set a governing law that
 * already selects one. A plain "dpa" document type is not enough.
 */
export function gdprFamilyRequested(facts: StructuredFacts, extra = ""): boolean {
  const law = String(facts.governingLaw || "").toLowerCase();
  if (
    law.includes("ireland") ||
    law.includes("gdpr") ||
    law.includes("eea") ||
    /\beu\b/.test(law) ||
    law.includes("england") ||
    /\buk\b/.test(law) ||
    law.includes("united kingdom") ||
    law.includes("california")
  ) {
    return true;
  }
  const text = blob(facts, extra);
  return (
    /\bgdpr\b/.test(text) ||
    /\beea\b/.test(text) ||
    /\beu\b/.test(text) ||
    text.includes("article 28") ||
    text.includes("ireland") ||
    text.includes("ccpa") ||
    text.includes("cpra") ||
    text.includes("idta")
  );
}

export function dropEuFamilyForDpdpaOnly(regimeId: string): boolean {
  return EU_FAMILY_IDS.has(regimeId);
}

/** GDPR Art. 28 applies only when the user named GDPR/EU/Ireland — never a bare DPA. */
export function gdprArt28Requested(facts: StructuredFacts, extra = ""): boolean {
  const regime = String(facts.privacyRegime || "").toLowerCase();
  if (regime.includes("gdpr") && !regime.includes("uk")) return true;
  const law = String(facts.governingLaw || "").toLowerCase();
  if (
    law.includes("ireland") ||
    law.includes("gdpr") ||
    law.includes("eea") ||
    /\beu\b/.test(law)
  ) {
    return true;
  }
  const text = blob(facts, extra);
  return /\bgdpr\b/.test(text) || text.includes("article 28");
}
