import { openRouterComplete } from "../services/openRouterClient.js";

export class DraftingAgent {
  async generateDraft(prompt: string): Promise<string> {
    const systemPrompt =
      "You are an expert Legal Draftsman. Generate a professional legal document based on the user's instruction. Return only the document content in Markdown format. Do not include any preamble or notes.";

    const userPrompt = prompt;

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("DraftingAgent error:", err);
      throw err;
    }
  }
}
