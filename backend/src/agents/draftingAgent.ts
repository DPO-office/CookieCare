import { executeCompletion, LLMProvider, LLMTask } from "../llm/index.js";

export class DraftingAgent {
  async generateDraft(prompt: string): Promise<string> {
    const systemPrompt =
      "You are an expert Legal Draftsman. Generate a professional legal document based on the user's instruction. Return only the document content in Markdown format. Do not include any preamble or notes.";

    const userPrompt = prompt;

    try {
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT,
        LLMProvider.GEMINI
      );
    } catch (err) {
      console.error("DraftingAgent error:", err);
      throw err;
    }
  }
}
