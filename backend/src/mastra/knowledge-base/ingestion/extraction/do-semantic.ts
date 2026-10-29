import { DigitalOceanInferenceClient } from "../../../../llm/provider/digitalocean-client.js";
import { SEMANTIC_PROMPT_VERSION, type SemanticDecisionClient } from "./semantic-relationships.js";

const responseSchema = { type: "object", additionalProperties: false,
  required: ["links", "issues"], properties: {
    links: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["relationId", "kind", "role", "evidenceQuote"], properties: {
        relationId: { type: "string" }, kind: { type: "string", enum: ["refers_to", "defines",
          "exempts_from", "exception_to", "depends_on", "alternative_to", "interprets", "penalty_for"] },
        role: { type: "string", maxLength: 500 }, evidenceQuote: { type: "string", maxLength: 500 },
      } } }, issues: { type: "array", items: { type: "string" } },
  } } as const;

export class DigitalOceanSemanticClient implements SemanticDecisionClient {
  constructor(readonly model: string, private readonly inference = new DigitalOceanInferenceClient()) {}

  async decide(input: Parameters<SemanticDecisionClient["decide"]>[0], options?: { attempt: number }): Promise<unknown> {
    const maxCompletionTokens = (options?.attempt ?? 1) > 1 ? 16384 : 8192;
    process.stdout.write(`      Semantic request: model=${this.model}, output budget=${maxCompletionTokens}, reasoning=low\n`);
    const result = await this.inference.chat({ model: this.model, temperature: 0,
      maxCompletionTokens, reasoningEffort: "low", retryOnTimeout: false,
      systemInstruction: `Version ${SEMANTIC_PROMPT_VERSION}. Classify only explicit legal relations in the supplied source.
Use only the supplied relation IDs, targets and ontology kinds. Keep role a short label, not a sentence.
Quote an exact, contiguous passage
from sourceText that includes the cited mention. Preserve conditions and uncertainty in issues.
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
