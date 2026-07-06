import { config } from "../../../config/index.js";
import { pool } from "../../../config/database.js";
import {
  DraftState,
  RequirementContext,
  ValidationIssue,
} from "../models/draft-state";
import { OpenRouterClient } from "../providers/openrouter-provider";
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

  // TRACK A: THE NEW REACTIVE DEFENSE SYSTEM PROMPT FORK
  if (state.request.intent === "reactive" && sourceTextSnippet) {
    return [
      "You are analyzing an incoming hostile legal notice, claim letter, or court petition document.",
      "Your goal is to extract the adversary's claims and synthesize a clean tactical instructions playbook.",
      "",
      "INCOMING HOSTILE DOCUMENT DETECTED:",
      sourceTextSnippet,
      "",
      "User defensive instructions strategy notes:",
      state.request.rawInstructions ?? "(none provided)",
      "",
      "FIELD EXTRACTION INSTRUCTIONS FOR REACTIVE DEFENSE:",
      "- `contractType`: Classify the specific response format needed (e.g., 'Breach Response Letter', 'Cease & Desist Rebuttal').",
      "- `parties`: Array where index 0 is [The Hostile Sender/Adversary] and index 1 is [Our Company/Target Name].",
      "- `jurisdiction`: The governing law or court location specified in the hostile claim text.",
      // TODO: We can improve this to an array of object where it store the configurations of the uploaded document
      "- `uploadedDocSummary`: Write a clear, 2-to-3 sentence summary explaining exactly what the adversary is alleging or demanding in the uploaded text.",
      "- `instructions`: Synthesize a comprehensive structural payload string. Format it EXACTLY like this: 'ADVERSARY ACCUSATIONS CLAIMS SUMMARY: [Write a 2-sentence structural summary of what they are alleging or demanding] | TARGET DEFENSE STRATEGY DIRECTIVES: [Summarize the user instructions strategy notes]'.",
      "- `excludedClauses` & `additionalRequiredClauses` & `optionalClauses`: Keep these empty [] unless the user notes explicitly request specific clause changes.",
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
  // If we are responding reactively, baseline clause catalogs for proactive creation are bypassed
  if (state.request.intent === "reactive") {
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
  return {
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
}

export async function requirementExtractionStep(
  state: DraftState
): Promise<DraftState> {
  // Make the system instruction adapt to intent
  const isReactive = state.request.intent === "reactive";
  
  const systemInstruction = isReactive
    ? "You are a deterministic requirements extraction engine analyzing an adversarial legal document. Focus on extracting the claim facts and defense targets. Return ONLY valid JSON matching the provided JSON Schema. Do not include markdown or commentary."
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

    const client = new OpenRouterClient({
      apiKey: config.openRouterApiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      model: config.openRouterModel,
      timeoutMs: 30_000,
      httpReferer: "https://cookiecare.app",
      xTitle: "CookieCare Legal AI",
    });

    const extracted = await client.getJsonCompletion<RequirementExtractionResult>(
      prompt,
      systemInstruction,
      REQUIREMENT_EXTRACTION_JSON_SCHEMA
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