import { AnalysisAgent } from "./analysisAgent.js";
import { DraftingAgent } from "./draftingAgent.js";
import { NegotiationAgent } from "./negotiationAgent.js";
import { AskLawyerAgent } from "./askLawyerAgent.js";
import { pool } from "../config/database.js";
import { searchHybrid } from "../RAG/ragService.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey || "dummy");

export class AgentOrchestrator {
  public analysisAgent = new AnalysisAgent();
  public draftingAgent = new DraftingAgent();
  public negotiationAgent = new NegotiationAgent();
  public askLawyerAgent = new AskLawyerAgent();

  async runAnalysis(documentId: string, content: string, userId: string, folderIds?: string[], userRole: string = 'USER') {
    const audit = await this.analysisAgent.runAudit(content, "legal");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.current_user_id = $1", [userId]);
      await client.query("SET LOCAL app.current_user_role = $2", [userRole]);

      await client.query(
        "UPDATE files SET analysis = $1 WHERE id = $2",
        [JSON.stringify(audit), documentId]
      );

      await client.query(
        "INSERT INTO agent_execution_logs (file_id, user_id, agent_name, task_name, decisions, confidence_score) VALUES ($1, $2, $3, $4, $5, $6)",
        [documentId, userId, "AnalysisAgent", "Legal Audit", JSON.stringify({ summary: audit.summary }), 95.0]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return audit;
  }

  async runDrafting(params: { mode: string; detailLevel: string; instructions: string; formFields?: any; templateId?: string; sourceText?: string; playbookText?: string }) {
    const prompt = `Mode: ${params.mode}, Level: ${params.detailLevel}, Instructions: ${params.instructions}`;
    return await this.draftingAgent.generateDraft(prompt);
  }

  async runNegotiation(documentContent: string, playbooks: string[], instructions: string) {
    return await this.negotiationAgent.negotiate(documentContent, playbooks, instructions);
  }

  async askLawyer(prompt: string, userId: string, documentIds?: string[]) {
    const contextChunks = await searchHybrid(prompt, userId, documentIds);

    // Format context with explicit indexing for citations
    const contextText = contextChunks.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.content}`).join("\n\n");

    const advice = await this.askLawyerAgent.getAdvice(prompt, contextText);

    // Map internal chunks to UI-compatible sources
    const sources = contextChunks.map((c, i) => ({
      id: `src-${i + 1}`,
      title: c.title,
      citation: `Source ${i + 1}`,
      jurisdiction: "Document Context",
      documentType: "Internal Reference",
      officialCopy: c.content
    }));

    return {
      answer: advice,
      sources: sources
    };
  }

  async remediate(documentId: string, content: string, userId: string, userRole: string = 'USER') {
     return await this.runAnalysis(documentId, content, userId, undefined, userRole);
  }

  async interactAnalyze(folderIds: string[], prompt: string, userId: string, documentMode: boolean, answerStyle: string, history: any[], folderId?: string, userRole: string = 'USER') {
    const context = await searchHybrid(prompt, userId, undefined, folderIds);
    const contextText = context.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.content}`).join("\n\n");

    const fullPrompt = `You are a Legal Analyst. Answer the following query based on the provided document context.
Answer Style: ${answerStyle}
History: ${JSON.stringify(history)}

[CONTEXT]
${contextText}

[QUERY]
${prompt}`;

    try {
      const result = await genAI.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
      });
      return result.response.text();
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
}
