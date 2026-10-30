import { DigitalOceanInferenceClient } from "../../../../llm/provider/digitalocean-client.js";
import { SEMANTIC_PROMPT_VERSION, type SemanticDecisionClient } from "./semantic-relationships.js";

const discoverySchema = { type: "object", additionalProperties: false,
  required: ["links", "issues"], properties: {
    links: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["exactMention", "targetCitation", "kind", "role", "condition", "typeProposal", "evidenceQuote"],
      properties: { exactMention: { type: "string", maxLength: 300 },
        targetCitation: { type: "string", maxLength: 180 },
        kind: { type: "string", enum: ["refers_to", "defines", "exempts_from", "exception_to",
          "depends_on", "alternative_to", "interprets", "penalty_for", "defined_term"] },
        role: { type: "string", maxLength: 160 },
        condition: { type: ["string", "null"], maxLength: 400 },
        typeProposal: { type: ["object", "null"], additionalProperties: false,
          required: ["name", "definition"], properties: { name: { type: "string", maxLength: 80 },
            definition: { type: "string", maxLength: 300 } } },
        evidenceQuote: { type: "string", maxLength: 500 },
      } } }, issues: { type: "array", items: { type: "string" } },
  } } as const;

const responseSchema = { type: "object", additionalProperties: false,
  required: ["links", "issues"], properties: {
    links: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["relationId", "kind", "role", "evidenceQuote", "condition"], properties: {
        relationId: { type: "string" }, kind: { type: "string", enum: ["refers_to", "defines",
          "exempts_from", "exception_to", "depends_on", "alternative_to", "interprets", "penalty_for", "defined_term"] },
        role: { type: "string", maxLength: 500 }, evidenceQuote: { type: "string", maxLength: 500 },
        condition: { type: ["string", "null"], maxLength: 2000 },
      } } }, issues: { type: "array", items: { type: "string" } },
  } } as const;

export class DigitalOceanSemanticClient implements SemanticDecisionClient {
  constructor(readonly model: string, private readonly inference = new DigitalOceanInferenceClient()) {}

  async discover(input: Parameters<NonNullable<SemanticDecisionClient["discover"]>>[0],
    options?: { attempt: number }): Promise<unknown> {
    const result = await this.inference.chat({ model: this.model, temperature: 0,
      maxCompletionTokens: (options?.attempt ?? 1) > 1 ? 16_384 : 8_192,
      reasoningEffort: "low", retryOnTimeout: false, responseSchema: discoverySchema,
      systemInstruction: `Version ${SEMANTIC_PROMPT_VERSION}. You are ingesting a legal document into a source-grounded graph.
Discover every explicit internal legal relationship in sourceText, even when existingReferences misses it.
For each relationship, return ONE link per target using a targetCitation exactly as written in directory.
Use the exact shortest citation or defined-term occurrence as exactMention. Quote a contiguous source passage
containing exactMention as evidenceQuote. If a condition applies, copy its exact wording into condition;
otherwise use null. Use a broad kind from the schema and a short descriptive role. Never invent a target.
When no broad kind adequately describes the link, keep kind refers_to and provide a concise
typeProposal name and definition for human ontology review; otherwise set typeProposal to null.
Examples: "sub-sections (1) and (3)" under Section 9 means separate links to Section 9(1) and Section 9(3).
"may ... notify ... shall not apply" is an exempts_from link with the notification condition preserved.
A Schedule breach row and its penalty basis may have different targets and roles.
A defined term used in an obligation points to its definition with kind defined_term.
If the target is external or absent, return its best citation as targetCitation; it will remain unresolved.
If the meaning cannot be grounded, put it in issues.
Do not claim a notification has been issued merely because the Act permits one.`,
      prompt: JSON.stringify(input) });
    if (result.finishReason?.toLowerCase() === "length")
      throw new Error("Semantic discovery response incomplete");
    return JSON.parse(result.text) as unknown;
  }

  async decide(input: Parameters<SemanticDecisionClient["decide"]>[0], options?: { attempt: number }): Promise<unknown> {
    const maxCompletionTokens = (options?.attempt ?? 1) > 1 ? 16384 : 8192;
    process.stdout.write(`      Semantic request: model=${this.model}, output budget=${maxCompletionTokens}, reasoning=low\n`);
    const result = await this.inference.chat({ model: this.model, temperature: 0,
      maxCompletionTokens, reasoningEffort: "low", retryOnTimeout: false,
      systemInstruction: `Version ${SEMANTIC_PROMPT_VERSION}. Classify only explicit legal relations in the supplied source.
Use only the supplied relation IDs, targets and ontology kinds. Keep role a short label, not a sentence.
Quote an exact, contiguous passage
from sourceText that includes the cited mention. Copy controlling conditions from sourceText or parentContext
into condition (null if none); put uncertainty in issues. Do not discard an inherited condition.
Return no link when the role is not supported. Do not make a legal conclusion or invent amounts.`,
      prompt: JSON.stringify(input), responseSchema });
    if (result.finishReason?.toLowerCase() === "length") {
      const raw = result.rawResponse as { choices?: Array<{ finish_reason?: unknown;
        message?: { reasoning_content?: unknown } }>; usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } } };
      throw new Error(`Semantic response incomplete: provider finish=${String(raw?.choices?.[0]?.finish_reason ?? "unknown")}, ` +
        `output tokens=${result.usage?.outputTokens ?? "unknown"}/${maxCompletionTokens}, ` +
        `reasoning tokens=${String(raw?.usage?.completion_tokens_details?.reasoning_tokens ?? "unknown")}, ` +
        `answer characters=${result.text.length}, reasoning present=${Boolean(raw?.choices?.[0]?.message?.reasoning_content)}`);
    }
    return JSON.parse(result.text) as unknown;
  }
}
