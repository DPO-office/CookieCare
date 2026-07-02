import { config } from "../../../config/index.js";
import { DraftState, RequirementContext, ValidationIssue } from "../models/draft-state";
import { OpenRouterClient } from "../providers/openrouter-provider";

const REQUIREMENT_CONTEXT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractType",
    "jurisdiction",
    "industry",
    "parties",
    "requiredClauses",
    "optionalClauses",
    "language",
    "instructions",
  ],
  properties: {
    contractType: { type: "string" },
    jurisdiction: { type: "string" },
    industry: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    requiredClauses: { type: "array", items: { type: "string" } },
    optionalClauses: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    instructions: { type: "string" },
  },
} as const;

function appendValidationWarning(state: DraftState, description: string): DraftState {
  const issue: ValidationIssue = {
    type: "formatting",
    severity: "warning",
    description,
    targetSection: "requirement-extraction",
  };

  const existingIssues = state.validation?.issues ?? [];
  const nextIssues = [...existingIssues, issue];

  return {
    ...state,
    validation: {
      isValid: false,
      issues: nextIssues,
    },
  };
}

function buildExtractionPrompt(state: DraftState): string {
  const formFields =
    state.request.formFields && Object.keys(state.request.formFields).length > 0
      ? JSON.stringify(state.request.formFields)
      : "";

  const sourceText =
    typeof state.request.sourceText === "string" && state.request.sourceText.trim()
      ? state.request.sourceText
      : "";

  const sourceTextSnippet =
    sourceText.length > 8_000 ? `${sourceText.slice(0, 8_000)}…` : sourceText;

  return [
    "Extract structured drafting requirements from the inputs below.",
    "",
    "User instructions:",
    state.request.rawInstructions ?? "",
    "",
    formFields ? `Form fields (JSON):\n${formFields}\n` : "",
    sourceTextSnippet ? `Source text (snippet):\n${sourceTextSnippet}\n` : "",
    "Rules:",
    "- Produce concrete strings (no nulls).",
    "- If a value is unknown, infer a safe default consistent with the instructions.",
    '- `parties` must be an array of party names (strings).',
    "- `requiredClauses` and `optionalClauses` must be arrays of clause/topic names.",
    "- `instructions` should be a cleaned, consolidated instruction string.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function requirementExtractionStep(
  state: DraftState
): Promise<DraftState> {
  const systemInstruction =
    "You are a deterministic requirements extraction engine. Return ONLY valid JSON that matches the provided JSON Schema. Do not include markdown or commentary.";

  const prompt = buildExtractionPrompt(state);

  try {
    if (!config.openRouterApiKey || !config.openRouterApiKey.trim()) {
      return appendValidationWarning(
        state,
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
      onMetrics: (metrics) => {
        // Keep metrics accessible for later steps without coupling orchestration logic.
        // (pure state updates are done below; this hook is best-effort only)
        void metrics;
      },
    });

    const extracted = await client.getJsonCompletion<RequirementContext>(
      prompt,
      systemInstruction,
      REQUIREMENT_CONTEXT_JSON_SCHEMA
    );

    return {
      ...state,
      requirements: extracted,
    };
  } catch (err) {
    return appendValidationWarning(
      state,
      `Requirement extraction failed; continuing with fallback state. ${(err as Error).message}`
    );
  }
}

