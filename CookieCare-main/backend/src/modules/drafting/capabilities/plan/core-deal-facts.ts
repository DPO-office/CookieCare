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

const UNIVERSAL_CORE_GAPS: MissingFact[] = [
  {
    field: "parties",
    question:
      "Who are the parties to this agreement? Please provide the full legal names of both parties.",
    severity: "critical",
    reasonRequired:
      "Party names appear throughout the agreement; drafting without them forces [PARTY] placeholders.",
  },
  {
    field: "governingLaw",
    question:
      "Which governing law and venue should apply (e.g. State of Delaware, England & Wales)?",
    severity: "critical",
    reasonRequired:
      "Governing law clauses must name a real jurisdiction; inventing one makes the draft wrong.",
    options: [
      "State of Delaware",
      "State of California",
      "England and Wales",
      "Ireland",
      "Other (specify)",
    ],
  },
  {
    field: "effectiveDate",
    question:
      "What is the effective date of this agreement (or should it be the date of last signature)?",
    severity: "critical",
    reasonRequired:
      "Without an effective date the draft leaves [● DATE] placeholders in the preamble and term clauses.",
  },
];

const DOC_TYPE_GAPS: Record<string, MissingFact[]> = {
  dpa: [
    {
      field: "principalAgreementDate",
      question:
        "What is the date of the principal / master services agreement this DPA supplements? (or say 'date of last signature')",
      severity: "critical",
      reasonRequired:
        "DPA recitals cite the MSA date; without it the draft emits [● DATE OF MSA].",
    },
    {
      field: "processingPurpose",
      question:
        "What is the purpose of processing personal data under this DPA (e.g. cloud hosting, analytics, support)?",
      severity: "critical",
      reasonRequired:
        "Art. 28 schedules require a stated processing purpose; otherwise Schedule 1 is filled with brackets.",
    },
    {
      field: "dataCategories",
      question:
        "Which categories of personal data will be processed (e.g. contact data, account IDs, health data)?",
      severity: "critical",
      reasonRequired:
        "Details of Processing must list data categories; inventing them is unsafe and creates placeholders.",
    },
    {
      field: "dataSubjects",
      question:
        "Whose personal data is processed (e.g. customers, employees, patients, end users)?",
      severity: "critical",
      reasonRequired:
        "Schedule 1 must identify data subject categories; missing this yields bracketed stubs.",
    },
    {
      field: "transferMechanism",
      question:
        "Will personal data be transferred outside the UK/EEA? If yes, which mechanism applies (EU SCCs Module 2/3, UK IDTA, adequacy decision, none)?",
      severity: "critical",
      reasonRequired:
        "International transfer clauses and SCC modules change materially based on this answer.",
      options: [
        "No international transfers",
        "EU SCCs Module 2 (C2P)",
        "EU SCCs Module 3 (P2P)",
        "UK IDTA",
        "Adequacy decision only",
        "Other (specify)",
      ],
    },
  ],
  nda: [
    {
      field: "businessPurpose",
      question:
        "What is the business purpose for sharing confidential information (one sentence)?",
      severity: "critical",
      reasonRequired:
        "Purpose/permitted-use clauses must state a real purpose; otherwise [PURPOSE] placeholders remain.",
    },
    {
      field: "confidentialityTermYears",
      question:
        "How many years should general confidentiality obligations last (typically 2–3)?",
      severity: "critical",
      reasonRequired:
        "Term & survival must state a duration; inventing one or using [YEARS] is unacceptable.",
      options: ["2 years", "3 years", "5 years", "Other (specify)"],
    },
  ],
  msa: [
    {
      field: "servicesDescription",
      question: "Briefly describe the services to be provided under the MSA.",
      severity: "critical",
      reasonRequired:
        "Services scope drives SOW references and obligations; missing it produces bracketed stubs.",
    },
  ],
  "service-agreement": [
    {
      field: "servicesDescription",
      question: "Briefly describe the services to be provided.",
      severity: "critical",
      reasonRequired:
        "Service description is required to draft scope without placeholders.",
    },
  ],
};

function resolveDocTypeKey(documentType: string | undefined): string {
  const raw = (documentType || "").toLowerCase();
  if (!raw) return "";
  if (raw.includes("dpa") || raw.includes("data processing") || raw.includes("addendum")) {
    return "dpa";
  }
  if (raw.includes("nda") || raw.includes("non-disclosure") || raw.includes("confidential")) {
    return "nda";
  }
  if (raw.includes("msa") || raw.includes("master service")) return "msa";
  if (raw.includes("service")) return "service-agreement";
  return raw;
}

function upsertCritical(
  byField: Map<string, MissingFact>,
  core: MissingFact
): void {
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

/**
 * Guarantee ASK for universal + document-type deal facts when still unknown.
 * Also promotes any LLM-emitted deal-fill missingFacts to critical.
 */
export function mergeCoreMissingFacts(
  missingFacts: MissingFact[],
  facts: Record<string, unknown>,
  documentType?: string
): MissingFact[] {
  const byField = new Map<string, MissingFact>();
  for (const fact of missingFacts) {
    // Any LLM-surfaced gap that would fill a draft blank is critical for ASK.
    byField.set(fact.field, {
      ...fact,
      severity: "critical",
    });
  }

  for (const core of UNIVERSAL_CORE_GAPS) {
    if (isFactSatisfied(facts, core.field)) continue;
    upsertCritical(byField, core);
  }

  // effectiveDate also covers principalAgreementDate for DPA when only one date is known
  const docKey = resolveDocTypeKey(
    documentType ||
      (typeof facts.documentType === "string" ? facts.documentType : undefined)
  );
  for (const core of DOC_TYPE_GAPS[docKey] ?? []) {
    if (core.field === "principalAgreementDate" && isFactSatisfied(facts, "effectiveDate")) {
      continue;
    }
    if (isFactSatisfied(facts, core.field)) continue;
    upsertCritical(byField, core);
  }

  return Array.from(byField.values());
}

/** Cap ASK batch size so UX stays usable; keep highest-priority fields first. */
const ASK_FIELD_PRIORITY = [
  "parties",
  "governingLaw",
  "effectiveDate",
  "principalAgreementDate",
  "businessPurpose",
  "processingPurpose",
  "dataCategories",
  "dataSubjects",
  "transferMechanism",
  "confidentialityTermYears",
  "servicesDescription",
];

export function prioritizeMissingFacts(
  missingFacts: MissingFact[],
  maxCritical = 10
): MissingFact[] {
  const critical = missingFacts.filter((f) => f.severity === "critical");
  const optional = missingFacts.filter((f) => f.severity !== "critical");
  critical.sort((a, b) => {
    const ia = ASK_FIELD_PRIORITY.indexOf(a.field);
    const ib = ASK_FIELD_PRIORITY.indexOf(b.field);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return [...critical.slice(0, maxCritical), ...optional];
}

/** Bracketed stubs left in a finished draft — must not ship. */
export const DRAFT_PLACEHOLDER_RE =
  /\[\s*(?:●|•)?\s*(?:DATE|PARTY|NAME|ADDRESS|INSERT|TBD|TODO|PURPOSE|YEARS|NUMBER|AMOUNT|MSA|AGREEMENT)[^\]]*\]|\[[^\]]{0,40}●[^\]]*\]/gi;

export function findDraftPlaceholders(document: string): string[] {
  const found = document.match(DRAFT_PLACEHOLDER_RE) ?? [];
  return [...new Set(found.map((s) => s.trim()))];
}

export function missingFactsFromPlaceholders(placeholders: string[]): MissingFact[] {
  const facts: MissingFact[] = [];
  const joined = placeholders.join(" ").toUpperCase();
  if (/DATE|MSA/.test(joined)) {
    facts.push({
      field: "effectiveDate",
      question:
        "The draft still has date placeholders. What effective / MSA date should we use?",
      severity: "critical",
      reasonRequired: "Leftover [● DATE] placeholders make the document unusable.",
    });
  }
  if (/PARTY|NAME/.test(joined)) {
    facts.push({
      field: "parties",
      question:
        "The draft still has party-name placeholders. Confirm the full legal names of both parties.",
      severity: "critical",
      reasonRequired: "Leftover [PARTY] placeholders make the document unusable.",
    });
  }
  if (/PURPOSE/.test(joined)) {
    facts.push({
      field: "businessPurpose",
      question: "The draft still has a purpose placeholder. What is the business / processing purpose?",
      severity: "critical",
      reasonRequired: "Purpose must be stated without brackets.",
    });
  }
  if (facts.length === 0 && placeholders.length > 0) {
    facts.push({
      field: "placeholderCleanup",
      question: `The draft still contains placeholders (${placeholders.slice(0, 5).join(", ")}). Please provide the missing values so we can replace them.`,
      severity: "critical",
      reasonRequired: "Bracketed stubs must be resolved before delivery.",
    });
  }
  return facts;
}
