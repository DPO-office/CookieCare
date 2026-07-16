import { executeCompletion } from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";

export class NegotiationAgent {
  /**
   * Evaluates the document against provided playbooks and generates a structured, 
   * commercially minded negotiation strategy with clean redlines.
   */
  async negotiate(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ): Promise<string> {
    const playbookText = playbooks.length > 0 
      ? playbooks.join("\n\n---\n\n") 
      : "Default corporate playbook and risk guidelines.";

    const systemPrompt = `You are an elite corporate legal counsel and master transactional negotiator. 
Your objective is to review the provided contract against our playbook rules and user guidelines to produce a comprehensive, structured redline and strategic advisory report.

REQUIRED OUTPUT STRUCTURE (Markdown):
1. ### 📋 Executive Risk Summary
   - Provide a high-level, clear overview of the contract's primary exposure vectors (e.g., liability caps, indemnification gaps, IP ownership transfer).

2. ### ⚔️ Recommended Redline Adjustments
   Represent your suggestions in a clean Markdown Table using these exact column headers:
   | Provision Name | Original Text | Proposed Redline Clause | Strategic Rationale |
   
   Ensure that:
   - "Original Text" is a highly accurate representation of the risky text.
   - "Proposed Redline Clause" is fully drafted, balanced, and ready to copy-paste.
   - "Strategic Rationale" explains the operational risk of the original and why the redline is a fair compromise.

3. ### 💬 Tactical Negotiation Scripting
   - Provide practical talking points and defensive scripts our business team can use verbally or in emails to defend each redline when dealing with the counterparty's legal team.

STRICT TONE CONSTRAINT:
Maintain a highly professional, commercially constructive, and executive-ready tone. Focus purely on transactional risk mitigation and deal velocity. Avoid academic legal theory.`;

    const userPrompt = `[DOCUMENT CONTENT]
${documentContent}

[NEGOTIATION PLAYBOOKS]
${playbookText}

[USER INSTRUCTIONS]
${instructions || "Ensure the agreement is protective, mutual, and commercially reasonable."}

Analyze the agreement and generate your professional negotiation layout:`;

    try {
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        LLMTask.COMPLEX_DRAFT, // Routes to Gemini Pro / Sonnet for deep analytical depth
        LLMProvider.GEMINI
      );
    } catch (err) {
      console.error("NegotiationAgent error during execution:", err);
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