import type { DraftState } from "../../models/draft-state.js";
import type { StructuredFacts } from "../../models/structured-facts.js";
import type {
  CanonicalRequirement,
  DraftRequirementsMap,
} from "../../models/draft-requirements.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";
import { sanitizeKnownFacts } from "./core-deal-facts.js";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";

/** Fields EXTRACT_FACTS may return (value + optional evidence). */
const FACT_FIELD_KEYS = [
  "documentType",
  "governingLaw",
  "parties",
  "partyA",
  "partyB",
  "roleA",
  "roleB",
  "effectiveDate",
  "principalAgreementDate",
  "processingPurpose",
  "dataCategories",
  "dataSubjects",
  "phiInvolved",
  "transferMechanism",
  "sccModule",
  "ukIdta",
  "businessPurpose",
  "confidentialityTermYears",
  "servicesDescription",
  "breachNotification",
  "subprocessorNotice",
  "auditNotice",
  "deletionReturn",
  "industry",
  "language",
  "excludedRequirements",
] as const;

type FactFieldKey = (typeof FACT_FIELD_KEYS)[number];

interface ExtractedField {
  value?: unknown;
  evidence?: string;
}

type ExtractFactsRaw = Partial<Record<FactFieldKey, ExtractedField | unknown>>;

const EXTRACT_FACTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(
    FACT_FIELD_KEYS.map((key) => [
      key,
      {
        type: "object",
        additionalProperties: false,
        properties: {
          value: {
            description:
              "Extracted value only if explicitly present or clearly inferable from the user text. Omit the whole field if absent.",
          },
          evidence: {
            type: "string",
            description: "Short verbatim snippet from the user text supporting the value.",
          },
        },
      },
    ])
  ),
} as const;

const SYSTEM = `
You extract deal facts for a legal drafting system from the user's drafting request.
Return ONLY JSON matching the schema. Do not invent parties, dates, jurisdictions,
processing details, transfer mechanisms, or SLAs that are not in the text.
If a field is absent, omit it or set value to null.
For parties: prefer partyA/partyB when roles are clear; also fill parties as an array of legal names.
For transferMechanism: capture SCC module, UK IDTA, adequacy, or "no international transfers" when stated.
For phiInvolved: true only when PHI/HIPAA/protected health information is clearly involved.
For excludedRequirements: list topics/clauses the user explicitly asked to omit.
`.trim();

function unwrapField(raw: unknown): { value: unknown; evidence?: string } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as object)) {
    const obj = raw as ExtractedField;
    if (obj.value === undefined || obj.value === null) return null;
    if (typeof obj.value === "string" && !obj.value.trim()) return null;
    return {
      value: obj.value,
      evidence: typeof obj.evidence === "string" ? obj.evidence.trim() : undefined,
    };
  }
  // Tolerate bare values
  if (typeof raw === "string" && !raw.trim()) return null;
  return { value: raw };
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function coalesceTransferValue(facts: Record<string, unknown>): string | undefined {
  const mech = readString(facts.transferMechanism);
  if (mech) return mech;
  const scc = readString(facts.sccModule);
  if (scc) {
    return /module\s*2/i.test(scc)
      ? "EU SCCs Module 2 (C2P)"
      : /module\s*3/i.test(scc)
        ? "EU SCCs Module 3 (P2P)"
        : scc;
  }
  if (facts.ukIdta === true) return "UK IDTA";
  return undefined;
}

/**
 * EXTRACT_FACTS — fill structuredFacts + seed draftRequirements from the full prompt.
 * Does not invent values. Runs after thin CREATE extractRequirements.
 */
export async function extractDealFacts(state: DraftState): Promise<DraftState> {
  const instructions =
    state.request.rawInstructions ||
    state.requirements?.instructions ||
    "";
  if (!instructions.trim()) {
    return state;
  }

  const sourceSnippet =
    typeof state.request.sourceText === "string" && state.request.sourceText.trim()
      ? state.request.sourceText.length > 8_000
        ? `${state.request.sourceText.slice(0, 8_000)}…`
        : state.request.sourceText
      : "";

  const prompt = [
    "## User drafting request",
    instructions,
    sourceSnippet ? `\n## Uploaded source text (snippet)\n${sourceSnippet}` : "",
    "",
    "Extract only facts grounded in the text above. Omit fields that are not present.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw: ExtractFactsRaw = {};
  try {
    raw = await executeJsonCompletion<ExtractFactsRaw>(
      prompt,
      SYSTEM,
      EXTRACT_FACTS_JSON_SCHEMA,
      LLMTask.EXTRACT_FACTS,
      LLMProvider.GEMINI
    );
  } catch (err) {
    console.warn(
      `[extractDealFacts] failed; continuing with prior facts: ${(err as Error).message}`
    );
    return state;
  }

  const patch: Record<string, unknown> = {};
  const evidenceById: Record<string, string[]> = {};
  const priorReqs = state.draftRequirements?.byId ?? {};

  for (const key of FACT_FIELD_KEYS) {
    const unwrapped = unwrapField(raw[key]);
    if (!unwrapped) continue;
    patch[key] = unwrapped.value;
    const canonical = canonicalizeFieldId(key);
    if (unwrapped.evidence) {
      evidenceById[canonical] = [
        ...(evidenceById[canonical] ?? []),
        unwrapped.evidence,
      ];
    }
  }

  // Prefer explicit partyA/partyB; derive parties array when needed.
  const partyA = readString(patch.partyA);
  const partyB = readString(patch.partyB);
  if (partyA && partyB && !Array.isArray(patch.parties)) {
    patch.parties = [partyA, partyB];
  }

  const transfer = coalesceTransferValue({ ...state.structuredFacts, ...patch });
  if (transfer) {
    patch.transferMechanism = transfer;
  }

  const mergedFacts = sanitizeKnownFacts({
    ...(state.structuredFacts ?? {}),
    ...patch,
  }) as StructuredFacts;

  const byId: DraftRequirementsMap = { ...priorReqs };
  for (const [key, value] of Object.entries(patch)) {
    const id = canonicalizeFieldId(key);
    // Don't overwrite a prior user-satisfied entry with a weaker alias-only write
    // when value is redundant (sccModule after transferMechanism).
    if (id !== key && byId[id]?.status === "satisfied" && byId[id].value != null) {
      continue;
    }
    const existing = byId[id];
    const evidence = [
      ...(existing?.evidence ?? []),
      ...(evidenceById[id] ?? []),
    ];
    const req: CanonicalRequirement = {
      id,
      value: id === "transferMechanism" ? transfer ?? value : value,
      status: "satisfied",
      source: "user",
      priority: existing?.priority ?? "critical",
      evidence: [...new Set(evidence.filter(Boolean))],
      aliases: existing?.aliases ?? [],
      blocking: existing?.blocking ?? true,
      question: existing?.question,
      options: existing?.options,
      reasonRequired: existing?.reasonRequired,
    };
    byId[id] = req;
  }

  const satisfiedKeys = Object.keys(byId).filter((k) => byId[k].status === "satisfied");
  console.log(
    `[extractDealFacts] satisfied=${satisfiedKeys.join(",") || "(none)"} factKeys=${Object.keys(mergedFacts).join(",")}`
  );

  return {
    ...state,
    structuredFacts: mergedFacts,
    draftRequirements: {
      byId,
      conflicts: state.draftRequirements?.conflicts ?? [],
    },
  };
}
