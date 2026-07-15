import {
  executeCompletion,
} from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";

export class NegotiationAgent {
  async negotiate(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ): Promise<string> {
    const playbookText = playbooks.join("\n\n---\n\n");

    const systemPrompt = `You are an expert Legal Counsel specializing in contract negotiation.
Your goal is to suggest precise redlines, safer replacement language, and negotiation guidance for the provided document.
Return the output in clear Markdown format with a short summary, redline recommendations, and any clause-level suggestions.`;

    const userPrompt = `[DOCUMENT CONTENT]
${documentContent}

[NEGOTIATION PLAYBOOKS]
${playbookText}

[USER INSTRUCTIONS]
${instructions}

Provide specific negotiation advice and clause redlines. Use headings and bullet points. Do not include unrelated legal theory.`;

    try {
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT,
        LLMProvider.GEMINI
      );
    } catch (err) {
      console.error("NegotiationAgent error:", err);
      throw err;
    }
  }

  async draftRedline(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ): Promise<string> {
    return await this.negotiate(documentContent, playbooks, instructions);
  }
}
