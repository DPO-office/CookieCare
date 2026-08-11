import { z } from "zod";
import type { DraftState } from "../../models/draft-state.js";
import { resolveApplicablePacks } from "../../packs/resolve-applicable-packs.js";
import { loadSkillDocs } from "../../packs/load-skill-docs.js";
import { DETECT_GAPS_SYSTEM_PROMPT } from "../../prompts/detect-gaps-prompt.js";

export const MissingFactSchema = z.object({
  field: z.string().describe("short machine-usable key, e.g. 'governingLaw', 'phiInvolved', 'sccModule'"),
  question: z.string().describe("the exact question to show the user"),
  severity: z.enum(["critical", "optional"]),
  reasonRequired: z.string().describe("one sentence: why this fact changes what must be drafted"),
  options: z.array(z.string()).optional(),
});

export const ChecklistItemSchema = z.object({
  id: z.string().describe("kebab-case, stable across reruns of the same deal, e.g. 'gdpr-art28-subprocessor-flowdown'"),
  source: z.enum(["documentType", "regime", "jurisdiction"]),
  sourcePackId: z.string().describe("id of the pack this came from, e.g. 'gdpr-art28'"),
  requirement: z.string().describe("one sentence, stated as a testable pass/fail condition — not a summary of the law"),
  severity: z.enum(["critical", "warning"]),
  sourceExcerpt: z.string().max(300).describe("the exact sentence(s) in the skill.md this requirement is grounded in"),
  sectionTarget: z.string().optional().describe("workUnit id this belongs to, if it maps to one predictable section; omit if cross-cutting"),
});

export const DetectGapsOutputSchema = z.object({
  missingFacts: z.array(MissingFactSchema),
  checklist: z.array(ChecklistItemSchema),
});

export type DetectGapsOutput = z.infer<typeof DetectGapsOutputSchema>;


export function buildDetectGapsUserMessage(input: {
  facts: Record<string, unknown>;
  draftInstructions: string;
  skillDocs: { packId: string; packType: "documentType" | "regime" | "jurisdiction"; content: string }[];
}): string {
  const skillBlock = input.skillDocs
    .map(
      (d) =>
        `--- SKILL DOCUMENT: ${d.packId} (${d.packType}) ---\n${d.content}\n--- END ${d.packId} ---`
    )
    .join("\n\n");

  return `
## Known facts (already extracted — do not re-derive)
${JSON.stringify(input.facts, null, 2)}

## User's drafting instructions (context only)
${input.draftInstructions}

## Applicable skill documents (your only source of requirements)
${skillBlock}

Produce missingFacts and checklist per your instructions and the schema.
`.trim();
}

/** JSON Schema for provider structured output (mirrors DetectGapsOutputSchema). */
export const DETECT_GAPS_JSON_SCHEMA = {
  type: "object",
  properties: {
    missingFacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          question: { type: "string" },
          severity: { type: "string", enum: ["critical", "optional"] },
          reasonRequired: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["field", "question", "severity", "reasonRequired"],
      },
    },
    checklist: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          source: {
            type: "string",
            enum: ["documentType", "regime", "jurisdiction"],
          },
          sourcePackId: { type: "string" },
          requirement: { type: "string" },
          severity: { type: "string", enum: ["critical", "warning"] },
          sourceExcerpt: { type: "string" },
          sectionTarget: { type: "string" },
        },
        required: [
          "id",
          "source",
          "sourcePackId",
          "requirement",
          "severity",
          "sourceExcerpt",
        ],
      },
    },
  },
  required: ["missingFacts", "checklist"],
} as const;

export type DetectGapsLlmCall = (
  prompt: string,
  systemInstruction: string,
  jsonSchema: unknown,
  task: string,
  provider?: string
) => Promise<unknown>;

export interface DetectGapsOptions {
  /** Inject for tests; defaults to executeJsonCompletion (lazy-loaded). */
  llmCall?: DetectGapsLlmCall;
}

async function defaultDetectGapsLlmCall(
  prompt: string,
  systemInstruction: string,
  jsonSchema: unknown
): Promise<unknown> {
  // Lazy-load so unit tests can inject llmCall without requiring GOOGLE_CLOUD_PROJECT.
  const { executeJsonCompletion, LLMProvider, LLMTask } = await import(
    "../../../../llm/index.js"
  );
  return executeJsonCompletion(
    prompt,
    systemInstruction,
    jsonSchema,
    LLMTask.DETECT_GAPS,
    LLMProvider.GEMINI
  );
}

async function structuredDetectGapsCall(
  system: string,
  user: string,
  llmCall: DetectGapsLlmCall
): Promise<DetectGapsOutput> {
  const raw = await llmCall(user, system, DETECT_GAPS_JSON_SCHEMA, "DETECT_GAPS", "GEMINI");

  const first = DetectGapsOutputSchema.safeParse(raw);
  if (first.success) return first.data;

  const retryPrompt = `${user}

Previous output failed schema validation:
${JSON.stringify(first.error.issues)}

Return corrected JSON matching the schema exactly.`;

  const retried = await llmCall(
    retryPrompt,
    system,
    DETECT_GAPS_JSON_SCHEMA,
    "DETECT_GAPS",
    "GEMINI"
  );

  return DetectGapsOutputSchema.parse(retried);
}

/**
 * PLAN capability — single LLM gap/checklist pass grounded in applicable skill.md files.
 * Returns raw analysis; build-plan freezes it onto state.plan for the deal lifetime.
 */
export async function detectGaps(
  state: DraftState,
  options: DetectGapsOptions = {}
): Promise<DetectGapsOutput> {
  const applicablePacks = resolveApplicablePacks(state);
  const skillDocs = await loadSkillDocs(applicablePacks);
  const llmCall = options.llmCall ?? defaultDetectGapsLlmCall;

  const facts = (state.structuredFacts ?? {}) as Record<string, unknown>;
  console.log(
    `[detectGaps] skillDocs=${skillDocs.length} knownFactKeys=${Object.keys(facts).join(",") || "(none)"}`
  );

  const result = await structuredDetectGapsCall(
    DETECT_GAPS_SYSTEM_PROMPT,
    buildDetectGapsUserMessage({
      facts,
      draftInstructions:
        state.request.rawInstructions ||
        state.requirements?.instructions ||
        "",
      skillDocs,
    }),
    llmCall
  );

  console.log(
    `[detectGaps] llm missingFacts=${result.missingFacts.length} critical=${result.missingFacts.filter((f) => f.severity === "critical").length} checklist=${result.checklist.length}`
  );
  return result;
}
