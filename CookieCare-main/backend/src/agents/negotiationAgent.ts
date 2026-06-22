import { openRouterComplete } from "../services/openRouterClient.js";

export class NegotiationAgent {
  async negotiate(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ): Promise<string> {
    const playbookText = playbooks.join("\n\n---\n\n");

    const systemPrompt = `You are an expert Legal Counsel specializing in contract negotiation.
Your goal is to suggest redlines and improvements for the provided document based on the company's playbooks and specific user instructions.
Return the output in Markdown format with a summary of changes and the proposed redlines.`;

    const userPrompt = `[DOCUMENT CONTENT]
${documentContent}

[NEGOTIATION PLAYBOOKS]
${playbookText}

[USER INSTRUCTIONS]
${instructions}

Provide detailed negotiation advice and specific clause redlines.`;

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
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
