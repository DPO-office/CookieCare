import { config } from "../../../config/index.js";
import { pool } from "../../../config/database.js";
import {
  DraftState,
  RequirementContext,
  ValidationIssue,
} from "../models/draft-state";
import { LLMTask } from "../config/model-specs.js";
import { LLMProvider } from "../config/model-specs.js";
import { executeCompletion, executeJsonCompletion } from "../llm/index.js";
import {
  ClauseCatalogRetriever,
  ClauseCatalogFilters,
} from "../retrieval/ClauseCatalogRetriever";
import { string } from "zod";

const REQUIREMENT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractType",
    "jurisdiction",
    "industry",
    "parties",
    "excludedClauses",
    "additionalRequiredClauses",
    "optionalClauses",
    "language",
    "instructions",
    "uploadDocSummary"
  ],
  properties: {
    contractType: { type: "string" },
    jurisdiction: { type: "string" },
    industry: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    excludedClauses: { type: "array", items: { type: "string" } },
    additionalRequiredClauses: { type: "array", items: { type: "string" } },
    optionalClauses: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    instructions: { type: "string" },
    uploadDocSummary:{type:"string"}
  },
} as const;

const REACTIVE_REQUIREMENT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractType",
    "jurisdiction",
    "industry",
    "parties",
    "excludedClauses",
    "additionalRequiredClauses",
    "optionalClauses",
    "language",
    "instructions",
    "uploadDocSummary",
    "agreementTitle",
    "partyA",
    "partyB",
    "effectiveDate"
  ],
  properties: {
    contractType: { type: "string" },
    jurisdiction: { type: "string" },
    industry: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    excludedClauses: { type: "array", items: { type: "string" } },
    additionalRequiredClauses: { type: "array", items: { type: "string" } },
    optionalClauses: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    instructions: { type: "string" },
    uploadDocSummary: { type: "string" },
    agreementTitle: { type: "string" },
    partyA: { type: "string" },
    partyB: { type: "string" },
    effectiveDate: { type: "string" }
  },
} as const;

interface RequirementExtractionResult {
  contractType: string;
  jurisdiction: string;
  industry: string;
  parties: string[];
  excludedClauses: string[];
  additionalRequiredClauses: string[];
  optionalClauses: string[];
  language: string;
  instructions: string;
  uploadDocSummary:string; // for Reactive work
}

interface ReactiveRequirementExtractionResult extends RequirementExtractionResult {
  agreementTitle: string;
  partyA: string;
  partyB: string;
  effectiveDate: string;
}

function appendValidationWarning(
  state: DraftState,
  description: string
): DraftState {
  const issue: ValidationIssue = {
    type: "formatting",
    severity: "warning",
    description,
    targetSection: "requirement-extraction",
  };

  const existingIssues = state.validation?.issues ?? [];

  return {
    ...state,
    validation: {
      isValid: false,
      issues: [...existingIssues, issue],
    },
  };
}

function readStringField(
  source: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArrayField(
  source: Record<string, unknown> | undefined,
  key: string
): string[] | undefined {
  const value = source?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function resolveCatalogFilters(state: DraftState): ClauseCatalogFilters {
  const formFields = state.request.formFields;

  return {
    contractType: readStringField(formFields, "contractType"),
    jurisdiction: readStringField(formFields, "jurisdiction"),
    industry: readStringField(formFields, "industry"),
    templateId: state.request.templateId,
    clauseIds: readStringArrayField(formFields, "clauseIds"),
    organizationId: readStringField(
      state.metadata as Record<string, unknown>,
      "organizationId"
    ),
  };
}

function normalizeClauseName(name: string): string {
  return name.trim().toLowerCase();
}

function mergeRequiredClauses(
  baselineClauses: string[],
  excludedClauses: string[],
  additionalRequiredClauses: string[]
): string[] {
  const excluded = new Set(excludedClauses.map(normalizeClauseName));
  const baselineNormalized = new Set(baselineClauses.map(normalizeClauseName));

  const retainedBaseline = baselineClauses.filter(
    (clause) => !excluded.has(normalizeClauseName(clause))
  );

  const additions = additionalRequiredClauses.filter((clause) => {
    const normalized = normalizeClauseName(clause);
    return !baselineNormalized.has(normalized) && !excluded.has(normalized);
  });

  return [...retainedBaseline, ...additions];
}

/**
 * ADAPTIVE EXTRACTION PROMPT
 * Splits logic based on whether we are performing Proactive creation or Reactive defense.
 */
function buildExtractionPrompt(
  state: DraftState,
  baselineRequiredClauses: string[]
): string {
  const formFields =
    state.request.formFields && Object.keys(state.request.formFields).length > 0
      ? JSON.stringify(state.request.formFields)
      : "";

  const sourceText =
    typeof state.request.sourceText === "string" &&
    state.request.sourceText.trim()
      ? state.request.sourceText
      : "";

  const sourceTextSnippet =
    sourceText.length > 12_000 ? `${sourceText.slice(0, 12_000)}…` : sourceText;

  // TRACK A: THE REACTIVE AGREEMENT REVISION FORK
  if (state.request.intent === "REACTIVE" && sourceTextSnippet) {
    return [
      "You are analyzing an uploaded vendor agreement document that needs to be revised against corporate policies.",
      "Your goal is to extract the agreement details and user instructions to prepare for markup/revision.",
      "",
      "UPLOADED VENDOR AGREEMENT DETECTED:",
      sourceTextSnippet,
      "",
      "User instructions / target policies:",
      state.request.rawInstructions ?? "(none provided)",
      "",
      "FIELD EXTRACTION INSTRUCTIONS FOR REACTIVE AGREEMENT REVISION:",
      "- `contractType`: Extract the type of agreement (e.g., 'NDA', 'MSA', 'SLA', 'DPA', 'SaaS Agreement').",
      "- `parties`: Array containing all the legal entities/parties entering into the agreement.",
      "- `jurisdiction`: The governing law or jurisdiction specified in the agreement.",
      "- `uploadedDocSummary`: Write a clear 2-to-3 sentence summary of the purpose of the agreement.",
      "- `instructions`: Clean and consolidate the user instructions or revision policies.",
      "- `excludedClauses` & `additionalRequiredClauses` & `optionalClauses`: Keep these empty [] unless the user instructions explicitly note specific clause additions/deletions.",
      "- `agreementTitle`: Extract the exact original title of the agreement (e.g., 'MASTER SERVICES AGREEMENT' or 'MUTUAL NON-DISCLOSURE AGREEMENT').",
      "- `partyA`: Extract the legal name of the first party/disclosing party.",
      "- `partyB`: Extract the legal name of the second party/receiving party.",
      "- `effectiveDate`: Extract the exact Effective Date of the agreement as stated (e.g., 'October 12, 2024' or 'the date of last signature' or '[●]'). If not found, write 'Not specified'.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // TRACK B: THE STANDARD PROACTIVE TRACK (Your unchanged existing code layout)
  const baselineClauseList =
    baselineRequiredClauses.length > 0
      ? baselineRequiredClauses.map((clause) => `- ${clause}`).join("\n")
      : "- (none loaded from catalog)";

  return [
    "Extract structured drafting requirements from the inputs below.",
    "",
    "User instructions:",
    state.request.rawInstructions ?? "",
    "",
    formFields ? `Form fields (JSON):\n${formFields}\n` : "",
    sourceTextSnippet ? `Source text (snippet):\n${sourceTextSnippet}\n` : "",
    "Baseline required clauses (already loaded from the clause catalog — do NOT re-guess these):",
    baselineClauseList,
    "",
    "Clause handling rules:",
    "- `excludedClauses`: clause types the user explicitly asked to omit or exclude from the baseline list above.",
    "- `additionalRequiredClauses`: ONLY clause types that are NOT already in the baseline list but are required based on user instructions or obvious contract gaps.",
    "- Do NOT repeat baseline clauses inside `additionalRequiredClauses`.",
    "- Do NOT invent baseline clauses from scratch; the platform already loaded them from the database.",
    "- If the user requests a specific new clause (e.g. 'add a non-compete'), put it in `additionalRequiredClauses`.",
    "- If the user says to skip/remove a baseline clause (e.g. 'no indemnity clause'), put it in `excludedClauses`.",
    "",
    "Other field rules:",
    "- Produce concrete strings (no nulls).",
    "- If a value is unknown, infer a safe default consistent with the instructions.",
    "- `parties` must be an array of party names (strings).",
    "- `optionalClauses` must be clause/topic names that are nice-to-have but not mandatory.",
    "- `instructions` should be a cleaned, consolidated instruction string.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchBaselineClauses(
  state: DraftState
): Promise<{ clauses: string[]; warning?: string }> {
  // If we are responding reactively, baseline clause catalogs for PROACTIVE creation are bypassed
  if (state.request.intent === "REACTIVE") {
    return { clauses: [] };
  }

  try {
    const filters = resolveCatalogFilters(state);
    const retriever = new ClauseCatalogRetriever(pool);
    const clauses = await retriever.fetchBaselineClauseTypes(filters);
    return { clauses };
  } catch (err) {
    return {
      clauses: [],
      warning: `Clause catalog lookup failed; continuing without baseline clauses. ${(err as Error).message}`,
    };
  }
}

function toRequirementContext(
  extracted: RequirementExtractionResult,
  baselineRequiredClauses: string[]
): RequirementContext {
  const result: RequirementContext = {
    contractType: extracted.contractType,
    jurisdiction: extracted.jurisdiction,
    industry: extracted.industry,
    parties: extracted.parties,
    requiredClauses: mergeRequiredClauses(
      baselineRequiredClauses,
      extracted.excludedClauses,
      extracted.additionalRequiredClauses
    ),
    optionalClauses: extracted.optionalClauses,
    language: extracted.language,
    instructions: extracted.instructions,
    uploadDocSummary: extracted.uploadDocSummary.trim() ? extracted.uploadDocSummary : undefined
  };

  const rext = extracted as any;
  if (rext.agreementTitle) result.agreementTitle = rext.agreementTitle;
  if (rext.partyA) result.partyA = rext.partyA;
  if (rext.partyB) result.partyB = rext.partyB;
  if (rext.effectiveDate) result.effectiveDate = rext.effectiveDate;

  return result;
}

export async function requirementExtractionStep(
  state: DraftState,
  provider:LLMProvider = LLMProvider.GEMINI
): Promise<DraftState> {
  // Make the system instruction adapt to intent
  const isReactive = state.request.intent === "REACTIVE";
  
  const systemInstruction = isReactive
    ? "You are a deterministic requirements extraction engine analyzing a vendor agreement. Extract the contract type, title, parties, effective date, jurisdiction, and rules. Return ONLY valid JSON matching the provided JSON Schema. Do not include markdown or commentary."
    : "You are a deterministic requirements extraction engine. Baseline required clauses are already provided by the platform from the database. Your clause task is limited to identifying exclusions and additional required clauses only. Return ONLY valid JSON matching the provided JSON Schema. Do not include markdown or commentary.";

  const { clauses: baselineRequiredClauses, warning: catalogWarning } =
    await fetchBaselineClauses(state);

  let workingState = state;
  if (catalogWarning) {
    workingState = appendValidationWarning(workingState, catalogWarning);
  }

  const prompt = buildExtractionPrompt(workingState, baselineRequiredClauses);

  try {
    if (!config.openRouterApiKey || !config.openRouterApiKey.trim()) {
      const fallbackRequirements: RequirementContext = {
        contractType:
          readStringField(state.request.formFields, "contractType") ?? "General",
        jurisdiction:
          readStringField(state.request.formFields, "jurisdiction") ??
          "Unspecified",
        industry:
          readStringField(state.request.formFields, "industry") ?? "General",
        parties: [],
        requiredClauses: baselineRequiredClauses,
        optionalClauses: [],
        language: "English",
        instructions: state.request.rawInstructions ?? "",
      };

      return appendValidationWarning(
        {
          ...workingState,
          requirements: fallbackRequirements,
        },
        "Requirement extraction skipped: OPENROUTER_API_KEY is not configured."
      );
    }

    const schemaToUse = isReactive 
      ? REACTIVE_REQUIREMENT_EXTRACTION_JSON_SCHEMA 
      : REQUIREMENT_EXTRACTION_JSON_SCHEMA;

    const extracted = await executeJsonCompletion<any>(
      prompt,
      systemInstruction,
      schemaToUse,LLMTask.STRUCTURAL_JSON,provider
    );

    return {
      ...workingState,
      requirements: toRequirementContext(extracted, baselineRequiredClauses),
      metadata: {
        ...workingState.metadata,
        requirementExtraction: {
          baselineRequiredClauses,
          excludedClauses: extracted.excludedClauses,
          additionalRequiredClauses: extracted.additionalRequiredClauses,
        },
      },
    };
  } catch (err) {
    const fallbackRequirements: RequirementContext = {
      contractType:
        readStringField(state.request.formFields, "contractType") ?? "General",
      jurisdiction:
        readStringField(state.request.formFields, "jurisdiction") ??
        "Unspecified",
      industry:
        readStringField(state.request.formFields, "industry") ?? "General",
      parties: [],
      requiredClauses: baselineRequiredClauses,
      optionalClauses: [],
      language: "English",
      instructions: state.request.rawInstructions ?? "",
    };

    return appendValidationWarning(
      {
        ...workingState,
        requirements: fallbackRequirements,
      },
      `Requirement extraction failed; continuing with catalog baseline clauses. ${(err as Error).message}`
    );
  }
}