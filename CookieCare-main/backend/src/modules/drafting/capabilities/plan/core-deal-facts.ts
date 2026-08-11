import type { MissingFact } from "../../models/draft-plan.js";

const PLACEHOLDER_RE =
  /^(not\s+specified|unspecified|unknown|n\/?a|none|tbd|\[?●\]?|party\s*[ab12]?|disclosing\s+party|receiving\s+party|the\s+company|our\s+company|counterparty|client|vendor|user)$/i;

function isPlaceholderString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.toLowerCase() === "general") return true;
  return PLACEHOLDER_RE.test(trimmed);
}

/** True when a structured fact has a real, usable value (not empty / placeholder). */
export function isFactSatisfied(facts: Record<string, unknown>, field: string): boolean {
  if (field === "parties") {
    return arePartiesSatisfied(facts);
  }

  const value = facts[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    return !isPlaceholderString(value);
  }
  if (Array.isArray(value)) {
    return value.some((v) => typeof v === "string" && !isPlaceholderString(v));
  }
  if (typeof value === "boolean") return true;
  return true;
}

function arePartiesSatisfied(facts: Record<string, unknown>): boolean {
  const partyA =
    typeof facts.partyA === "string" && !isPlaceholderString(facts.partyA)
      ? facts.partyA.trim()
      : "";
  const partyB =
    typeof facts.partyB === "string" && !isPlaceholderString(facts.partyB)
      ? facts.partyB.trim()
      : "";
  if (partyA && partyB) return true;

  const parties = facts.parties;
  if (!Array.isArray(parties)) return false;
  const named = parties
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter((p) => p && !isPlaceholderString(p));
  // Need two distinct named parties to draft without asking.
  return new Set(named.map((p) => p.toLowerCase())).size >= 2;
}

/** Strip placeholders so detect-gaps does not treat invented values as known. */
export function sanitizeKnownFacts(
  facts: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (!isPlaceholderString(value)) out[key] = value.trim();
      continue;
    }
    if (Array.isArray(value)) {
      const cleaned = value.filter(
        (v) => typeof v !== "string" || !isPlaceholderString(v)
      );
      if (cleaned.length > 0) out[key] = cleaned;
      continue;
    }
    out[key] = value;
  }
  return out;
}

const CORE_DEAL_GAPS: MissingFact[] = [
  {
    field: "parties",
    question:
      "Who are the parties to this agreement? Please provide the full legal names of both parties.",
    severity: "critical",
    reasonRequired:
      "Party names appear throughout the agreement (preamble, signature blocks, notice, and defined terms); drafting without them forces placeholders that make the document unusable.",
  },
  {
    field: "governingLaw",
    question:
      "Which governing law and venue should apply (e.g. State of Delaware, England & Wales)?",
    severity: "critical",
    reasonRequired:
      "Governing law and venue clauses must name a real jurisdiction; inventing one can make the draft legally wrong for the deal.",
    options: [
      "State of Delaware",
      "State of California",
      "England and Wales",
      "Ireland",
      "Other (specify)",
    ],
  },
];

/**
 * Guarantee ASK for core deal identity when still unknown.
 * LLM detect-gaps may mark these optional or omit them; PAC still must pause.
 */
export function mergeCoreMissingFacts(
  missingFacts: MissingFact[],
  facts: Record<string, unknown>
): MissingFact[] {
  const byField = new Map<string, MissingFact>();
  for (const fact of missingFacts) {
    byField.set(fact.field, fact);
  }

  for (const core of CORE_DEAL_GAPS) {
    if (isFactSatisfied(facts, core.field)) continue;
    const existing = byField.get(core.field);
    if (existing) {
      byField.set(core.field, {
        ...existing,
        severity: "critical",
        question: existing.question || core.question,
        reasonRequired: existing.reasonRequired || core.reasonRequired,
        options: existing.options?.length ? existing.options : core.options,
      });
    } else {
      byField.set(core.field, { ...core });
    }
  }

  return Array.from(byField.values());
}
