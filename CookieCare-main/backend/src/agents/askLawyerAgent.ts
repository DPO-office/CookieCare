import { openRouterComplete } from "../services/openRouterClient.js";

export class AskLawyerAgent {
  async getAdvice(prompt: string, context: string): Promise<string> {
    const systemPrompt = `You are a Senior Legal Counsel. Provide professional legal advice based on the following context.
If the information is not in the context, state that you are advising based on general legal principles but recommend consulting with specific jurisdictional counsel.

IMPORTANT: Return your response in clean Markdown format.`;

    const userPrompt = `[CONTEXT]
${context}

[USER QUERY]
${prompt}`;

    try {
      const result = await openRouterComplete(systemPrompt, userPrompt);
      return result || "I cannot answer this query right now.";
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
  }
}
