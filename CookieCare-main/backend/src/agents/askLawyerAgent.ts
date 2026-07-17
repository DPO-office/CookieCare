import { executeCompletion } from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";

export type OutputFormat = "Brief Summary" | "Full IRAC" | "CREAC";

export interface AskLawyerOptions {
  prompt: string;
  context: string;
  jurisdictions?: string[];
  outputFormat?: OutputFormat;
  sources?: Array<{ title: string; file_id: string; content: string }>;
}

export class AskLawyerAgent {
  /**
   * Upgraded Ask AI Lawyer agent with jurisdiction awareness, output format control,
   * and document-grounded structured analysis.
   */
  async getAdvice(options: AskLawyerOptions): Promise<{ text: string; sources?: any[] }> {
    const {
      prompt,
      context,
      jurisdictions = [],
      outputFormat = "Full IRAC",
      sources = []
    } = options;

    // Build jurisdiction scope clause
    const jurisdictionClause = jurisdictions.length > 0
      ? `\n\n**JURISDICTIONAL SCOPE:** Your analysis must prioritize and reference legal principles, statutes, and case law from the following jurisdictions: ${jurisdictions.join(", ")}. Where the retrieved documents or general principles do not clearly cover these jurisdictions, state that assumption explicitly and recommend jurisdiction-specific counsel.`
      : "";

    // Build output format instructions
    const formatInstructions = this.getFormatInstructions(outputFormat);

    const systemPrompt = `You are a Senior Legal Counsel specializing in commercial contract law, regulatory compliance, and risk assessment.

Your task is to provide **document-grounded, jurisdiction-aware, structured legal analysis** based on the retrieved document context provided below.${jurisdictionClause}

${formatInstructions}

**CRITICAL RULES:**
1. **Ground your analysis in the retrieved document context wherever possible.** Quote or paraphrase relevant clauses. If the context does not support a point, clearly state: "The retrieved documents do not address this issue — the following is based on general legal principles."
2. **Clearly separate:**
   - Conclusions grounded in the provided documents
   - General legal principles applied when context is insufficient
3. **Provide practical, actionable legal analysis** — not vague generic advice.
4. **Identify risks, ambiguities, and assumptions** where the documents are unclear or incomplete.
5. **Include practical recommendations / next steps** at the end.
6. **Return clean, well-structured Markdown** with headers, bullet points, and bold text for readability.

If the retrieved document context is weak or empty, you must still provide a structured answer using general legal principles, but clearly label it as such and recommend that the user consult jurisdiction-specific counsel or provide more specific documents.`;

    const userPrompt = `[RETRIEVED DOCUMENT CONTEXT]
${context || "⚠️ No document chunks were retrieved. You must rely on general legal principles and clearly state where assumptions are made."}

[USER QUERY]
${prompt}

Provide your analysis using the required ${outputFormat} structure.`;

    try {
      const result = await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT,    // Routes to Gemini 2.5 Pro for deep legal analysis
        LLMProvider.GEMINI
      );

      const text = result || "I cannot answer this query right now.";

      // Return sources if available
      const sourcesMetadata = sources.length > 0
        ? sources.map((s, idx) => ({
            id: `src_${idx + 1}`,
            title: s.title || "Untitled Document",
            file_id: s.file_id,
            excerpt: s.content.substring(0, 200) + (s.content.length > 200 ? "..." : "")
          }))
        : undefined;

      return { text, sources: sourcesMetadata };
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
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

Structure your answer as follows:

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
