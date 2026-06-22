import { AnalysisAgent } from "./analysisAgent.js";
import { DraftingAgent } from "./draftingAgent.js";
import { NegotiationAgent } from "./negotiationAgent.js";
import { AskLawyerAgent } from "./askLawyerAgent.js";
import { pool } from "../config/database.js";
import { searchHybrid } from "../RAG/ragService.js";
import { openRouterComplete } from "../services/openRouterClient.js";

export class AgentOrchestrator {
  public analysisAgent = new AnalysisAgent();
  public draftingAgent = new DraftingAgent();
  public negotiationAgent = new NegotiationAgent();
  public askLawyerAgent = new AskLawyerAgent();

  async runAnalysis(
    documentId: string,
    content: string,
    userId: string,
    folderIds?: string[],
    userRole: string = "USER"
  ) {
    const audit = await this.analysisAgent.runAudit(content, "legal");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.current_user_id = $1", [userId]);
      await client.query("SET LOCAL app.current_user_role = $2", [userRole]);

      await client.query("UPDATE files SET analysis = $1 WHERE id = $2", [
        JSON.stringify(audit),
        documentId,
      ]);

      await client.query(
        "INSERT INTO agent_execution_logs (file_id, user_id, agent_name, task_name, decisions, confidence_score) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          documentId,
          userId,
          "AnalysisAgent",
          "Legal Audit",
          JSON.stringify({ summary: audit.summary }),
          95.0,
        ]
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

  async runDrafting(params: {
    mode: string;
    detailLevel: string;
    instructions: string;
    formFields?: any;
    templateId?: string;
    sourceText?: string;
    playbookText?: string;
  }) {
    const prompt = `Mode: ${params.mode}, Level: ${params.detailLevel}, Instructions: ${params.instructions}`;
    return await this.draftingAgent.generateDraft(prompt);
  }

  async runNegotiation(
    documentContent: string,
    playbooks: string[],
    instructions: string
  ) {
    return await this.negotiationAgent.negotiate(
      documentContent,
      playbooks,
      instructions
    );
  }

  async askLawyer(
    prompt: string,
    userId: string,
    documentIds?: string[]
  ) {
    const context = await searchHybrid(prompt, userId, documentIds);
    const contextText = context
      .map((c) => `[Source: ${c.title}]\n${c.content}`)
      .join("\n\n");
    return await this.askLawyerAgent.getAdvice(prompt, contextText);
  }

  async remediate(
    documentId: string,
    content: string,
    userId: string,
    userRole: string = "USER"
  ) {
    return await this.runAnalysis(documentId, content, userId, undefined, userRole);
  }

  async interactAnalyze(
    folderIds: string[],
    prompt: string,
    userId: string,
    documentMode: boolean,
    answerStyle: string,
    history: any[],
    folderId?: string,
    userRole: string = "USER"
  ) {
    const context = await searchHybrid(prompt, userId, undefined, folderIds);
    const contextText = context
      .map((c) => `[File: ${c.title}]\n${c.content}`)
      .join("\n\n");

    const systemPrompt = `You are a Legal Analyst. Answer the following query based on the provided document context.
Answer Style: ${answerStyle}
History: ${JSON.stringify(history)}`;

    const userPrompt = `[CONTEXT]
${contextText}

[QUERY]
${prompt}`;

    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
}
