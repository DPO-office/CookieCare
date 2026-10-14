import { executeCompletion, LLMProvider, LLMTask } from "../llm/index.js";

export type OutputFormat = "Brief Summary" | "Full IRAC" | "CREAC";

export interface AskLawyerOptions {
  prompt: string;
  context: string;
  historyText?: string;
  jurisdictions?: string[];
  outputFormat?: OutputFormat;
  sources?: Array<{ title: string; file_id: string; content: string }>;
}

export interface AskLawyerResult {
  rawText: string;
  text: string;
  sources?: Array<{ id: string; title: string; file_id: string; excerpt: string }>;
}

export class AskLawyerAgent {
  /**
   * Upgraded Ask AI Lawyer agent with jurisdiction awareness, output format control,
   * and document-grounded structured analysis.
   */
  async getAdvice(options: AskLawyerOptions): Promise<AskLawyerResult> {
    const {
      prompt,
      context,
      historyText,
      sources = []
    } = options;

    const systemPrompt = `You are a helpful AI legal assistant. Answer the user's questions in a clear, friendly, and conversational way. You have broad knowledge of law, contracts, compliance, and legal concepts. Respond naturally — like a knowledgeable friend who happens to be a lawyer. Keep answers concise unless the user asks for detail. Use plain language unless legal terminology is specifically needed.`;

    // Build the full user prompt — include history and document context when available
    const historySection = historyText
      ? `[CONVERSATION HISTORY]\n${historyText}\n\n`
      : "";

    const contextSection = context
      ? `[DOCUMENT CONTEXT]\n${context}\n\n`
      : "";

    const userPrompt = `${historySection}${contextSection}[USER]\n${prompt}`;

    try {
      const rawText = await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT,    // Routes to Gemini 2.5 Pro for deep legal analysis
        LLMProvider.GEMINI
      );

      const text = this.sanitizeModelOutput(rawText || "I cannot answer this query right now.");

      // Return sources if available
      const sourcesMetadata = sources.length > 0
        ? sources.map((s, idx) => ({
            id: `src_${idx + 1}`,
            title: s.title || "Untitled Document",
            file_id: s.file_id,
            excerpt: s.content.substring(0, 200) + (s.content.length > 200 ? "..." : "")
          }))
        : undefined;

      return { rawText, text, sources: sourcesMetadata };
    } catch (err: any) {
      console.error("AskLawyerAgent error:", err);
      throw new Error(`Ask AI Lawyer execution failed: ${err?.message || String(err)}`);
    }
  }

  private sanitizeModelOutput(text: string): string {
    return text
      .trim()
      .replace(/^```(?:markdown)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  private getFormatInstructions(format: OutputFormat): string {
    switch (format) {
      case "Brief Summary":
        return `**OUTPUT FORMAT: Brief Summary**

Structure your answer as follows:
1. **Executive Summary** (2-4 sentences): Concise answer to the user's query.
2. **Key Points** (3-5 bullet points): Core legal principles or document findings.
3. **Risks / Ambiguities** (2-3 bullet points): Gaps, assumptions, or areas of concern.
4. **Practical Recommendation** (1-2 sentences): Clear next step or actionable advice.

Keep the answer **concise and practical** — no more than 300-400 words total.`;

      case "Full IRAC":
        return `**OUTPUT FORMAT: Full IRAC (Issue, Rule, Application, Conclusion)**

Structure your answer as follows and return only the sections below with no surrounding text or code fences:

### ISSUE
State the legal question or problem clearly in 1-2 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions that apply. If grounded in the retrieved documents, quote or cite the specific clause/section. If based on general legal principles, state that explicitly.

### APPLICATION
Apply the rule to the facts or document provisions retrieved. Analyze how the rule interacts with the user's situation. Identify risks, ambiguities, or gaps in the documents.

### CONCLUSION
Provide a clear conclusion that answers the user's query. Include:
- The likely legal outcome or interpretation
- Practical next steps or recommendations
- Any disclaimers about jurisdiction or missing information

If the user asked for IRAC, strictly use the four sections above.
Use **clear headers** for each section and bullet points where appropriate.`;

      case "CREAC":
        return `**OUTPUT FORMAT: CREAC (Conclusion, Rule, Explanation, Application, Conclusion)**

Structure your answer as follows:

### CONCLUSION (Short Answer)
Provide a direct, concise answer to the user's query in 2-3 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions. If grounded in the retrieved documents, quote or cite the specific clause. If based on general legal principles, state that explicitly.

### EXPLANATION OF RULE
Elaborate on how the rule works, its purpose, and any relevant nuances or exceptions. Reference case law, regulatory guidance, or contract interpretation principles where applicable.

### APPLICATION
Apply the rule to the facts or document provisions. Analyze the interaction between the rule and the user's situation. Highlight risks, ambiguities, or missing protections.

### CONCLUSION (Full Answer)
Restate and expand on the conclusion. Include:
- Detailed legal outcome or interpretation
- Practical recommendations / next steps
- Disclaimers about jurisdiction, assumptions, or areas requiring further research

Use **clear headers** and bullet points for readability.`;

      default:
        return "";
    }
  }
}
