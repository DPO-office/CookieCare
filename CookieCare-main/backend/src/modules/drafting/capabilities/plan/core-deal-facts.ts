import type { MissingFact } from "../../models/draft-plan.js";
import type {
  RequirementPriority,
} from "../../models/draft-requirements.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";

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
  const canonical = canonicalizeFieldId(field);
  if (canonical === "parties" || field === "parties") {
    return arePartiesSatisfied(facts);
  }

  // Prefer canonical key, then original field, then known aliases on facts bag.
  const candidates = [canonical, field];
  if (canonical === "transferMechanism") {
    candidates.push("sccModule", "ukIdta", "dataTransfer");
  }

  for (const key of candidates) {
    const value = facts[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (!isPlaceholderString(value)) return true;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some((v) => typeof v === "string" && !isPlaceholderString(v))) {
        return true;
      }
      continue;
    }
    if (typeof value === "boolean") return true;
    return true;
  }
  return false;
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

/** Catalog entry: what *can* be required — not an auto-ASK list. */
export interface RequiredFactCatalogEntry {
  id: string;
  priority: RequirementPriority;
  blocking: boolean;
  question: string;
  reasonRequired: string;
  options?: string[];
  aliases?: string[];
  /** When set, apply this value as assumed if missing. */
  safeDefault?: unknown;
  /**
   * If true, when effectiveDate is satisfied, treat this as not_applicable
   * (DPA principalAgreementDate may reuse effectiveDate).
   */
  coveredByEffectiveDate?: boolean;
}

const UNIVERSAL_CATALOG: RequiredFactCatalogEntry[] = [
  {
    id: "parties",
    priority: "critical",
    blocking: true,
    question:
      "Who are the parties to this agreement? Please provide the full legal names of both parties.",
    reasonRequired:
      "Party names appear throughout the agreement; drafting without them forces [PARTY] placeholders.",
    aliases: ["partyA", "partyB"],
  },
  {
    id: "governingLaw",
    priority: "critical",
    blocking: true,
    question:
      "Which governing law and venue should apply (e.g. State of Delaware, England & Wales)?",
    reasonRequired:
      "Governing law clauses must name a real jurisdiction; inventing one makes the draft wrong.",
    options: [
      "State of Delaware",
      "State of California",
      "England and Wales",
      "Ireland",
      "Other (specify)",
    ],
    aliases: ["jurisdiction"],
  },
  {
    id: "effectiveDate",
    priority: "critical",
    blocking: true,
    question:
      "What is the effective date of this agreement (or should it be the date of last signature)?",
    reasonRequired:
      "Without an effective date the draft leaves [● DATE] placeholders in the preamble and term clauses.",
  },
];

const DOC_TYPE_CATALOG: Record<string, RequiredFactCatalogEntry[]> = {
  dpa: [
    {
      id: "principalAgreementDate",
      priority: "critical",
      blocking: true,
      question:
        "What is the date of the principal / master services agreement this DPA supplements? (or say 'date of last signature')",
      reasonRequired:
        "DPA recitals cite the MSA date; without it the draft emits [● DATE OF MSA].",
      coveredByEffectiveDate: true,
      aliases: ["msaDate", "dateOfMsa"],
    },
    {
      id: "processingPurpose",
      priority: "critical",
      blocking: true,
      question:
        "What is the purpose of processing personal data under this DPA (e.g. cloud hosting, analytics, support)?",
      reasonRequired:
        "Art. 28 schedules require a stated processing purpose; otherwise Schedule 1 is filled with brackets.",
      aliases: ["purposeOfProcessing"],
    },
    {
      id: "dataCategories",
      priority: "critical",
      blocking: true,
      question:
        "Which categories of personal data will be processed (e.g. contact data, account IDs, health data)?",
      reasonRequired:
        "Details of Processing must list data categories; inventing them is unsafe and creates placeholders.",
      aliases: ["phiCategories", "personalDataCategories"],
    },
    {
      id: "dataSubjects",
      priority: "critical",
      blocking: true,
      question:
        "Whose personal data is processed (e.g. customers, employees, patients, end users)?",
      reasonRequired:
        "Schedule 1 must identify data subject categories; missing this yields bracketed stubs.",
      aliases: ["dataSubjectCategories"],
    },
    {
      id: "transferMechanism",
      priority: "critical",
      blocking: true,
      question:
        "Will personal data be transferred outside the UK/EEA? If yes, which mechanism applies (EU SCCs Module 2/3, UK IDTA, adequacy decision, none)?",
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
      aliases: ["sccModule", "ukIdta", "transferBasis"],
    },
  ],
  nda: [
    {
      id: "businessPurpose",
      priority: "critical",
      blocking: true,
      question:
        "What is the business purpose for sharing confidential information (one sentence)?",
      reasonRequired:
        "Purpose/permitted-use clauses must state a real purpose; otherwise [PURPOSE] placeholders remain.",
    },
    {
      id: "confidentialityTermYears",
      priority: "critical",
      blocking: true,
      question:
        "How many years should general confidentiality obligations last (typically 2–3)?",
      reasonRequired:
        "Term & survival must state a duration; inventing one or using [YEARS] is unacceptable.",
      options: ["2 years", "3 years", "5 years", "Other (specify)"],
    },
  ],
  msa: [
    {
      id: "servicesDescription",
      priority: "critical",
      blocking: true,
      question: "Briefly describe the services to be provided under the MSA.",
      reasonRequired:
        "Services scope drives SOW references and obligations; missing it produces bracketed stubs.",
    },
  ],
  "service-agreement": [
    {
      id: "servicesDescription",
      priority: "critical",
      blocking: true,
      question: "Briefly describe the services to be provided.",
      reasonRequired:
        "Service description is required to draft scope without placeholders.",
    },
  ],
};

export function resolveDocTypeKey(documentType: string | undefined): string {
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

/** Requirement schema for a document type — ASK only when status is missing/conflict. */
export function getRequiredFactCatalog(
  documentType?: string,
  skillFacts?: RequiredFactCatalogEntry[]
): RequiredFactCatalogEntry[] {
  const docKey = resolveDocTypeKey(documentType);
  const byId = new Map<string, RequiredFactCatalogEntry>();
  for (const entry of UNIVERSAL_CATALOG) {
    byId.set(entry.id, entry);
  }
  // Skill-authored facts take precedence over hardcoded DOC_TYPE_CATALOG.
  const skillList = skillFacts ?? [];
  if (skillList.length > 0) {
    for (const entry of skillList) {
      byId.set(entry.id, entry);
    }
  } else {
    for (const entry of DOC_TYPE_CATALOG[docKey] ?? []) {
      byId.set(entry.id, entry);
    }
  }
  return Array.from(byId.values());
}

export function getCatalogEntry(
  fieldId: string,
  documentType?: string
): RequiredFactCatalogEntry | undefined {
  const canonical = canonicalizeFieldId(fieldId);
  return getRequiredFactCatalog(documentType).find((e) => e.id === canonical);
}

/**
 * @deprecated P0 ASK authority is resolveRequirements + computeGapsAndConflicts.
 * Kept for any legacy callers; prefer the new path.
 */
export function mergeCoreMissingFacts(
  missingFacts: MissingFact[],
  facts: Record<string, unknown>,
  documentType?: string
): MissingFact[] {
  const catalog = getRequiredFactCatalog(documentType);
  const byField = new Map<string, MissingFact>();

  for (const fact of missingFacts) {
    const id = canonicalizeFieldId(fact.field);
    if (isFactSatisfied(facts, id)) continue;
    byField.set(id, {
      ...fact,
      field: id,
      severity: "critical",
    });
  }

  for (const core of catalog) {
    if (core.coveredByEffectiveDate && isFactSatisfied(facts, "effectiveDate")) {
      continue;
    }
    if (isFactSatisfied(facts, core.id)) continue;
    const existing = byField.get(core.id);
    byField.set(core.id, {
      field: core.id,
      question: existing?.question || core.question,
      severity: "critical",
      reasonRequired: existing?.reasonRequired || core.reasonRequired,
      options: existing?.options?.length ? existing.options : core.options,
    });
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
  const seen = new Set<string>();
  const deduped: MissingFact[] = [];
  for (const fact of missingFacts) {
    const id = canonicalizeFieldId(fact.field);
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push({ ...fact, field: id });
  }

  const critical = deduped.filter((f) => f.severity === "critical");
  const optional = deduped.filter((f) => f.severity !== "critical");
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
