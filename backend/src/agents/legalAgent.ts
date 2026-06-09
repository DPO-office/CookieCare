import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";
import { semanticSearch } from "../RAG/ragService.js";
import { DraftingAgent } from "./draftingAgent.js";
import { AnalysisAgent } from "./analysisAgent.js";
import { NegotiationAgent } from "./negotiationAgent.js";
import { AskLawyerAgent } from "./askLawyerAgent.js";

export interface ExecutionLog {
  agent: string;
  task: string;
  path: string;
  timestamp: string;
  durationMs: number;
  fallback_triggered: boolean;
  metadata?: any;
}

export interface AgentDecision {
  outcome: string;
  confidence: number;
  reasoning: string;
  actionTaken: string;
}

export class AgentOrchestrator {
  public draftingAgent = new DraftingAgent();
  public analysisAgent = new AnalysisAgent();
  public negotiationAgent = new NegotiationAgent();
  public askLawyerAgent = new AskLawyerAgent();

  async runAnalysis(documentId: string, content: string, userId: string, dbClient?: any): Promise<any> {
    const startedAt = Date.now();
    const client = dbClient || pool;
    try {
      if (!dbClient) {
        await client.query("BEGIN");
        await client.query("SET LOCAL app.current_user_id = $1", [userId]);
        await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
      }

      const result = await this.analysisAgent.runAudit(content, "NDA");

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, prompt, metadata)
        VALUES ($1, $2, $3, $4)
      `, [userId, 'document_audit', `Audit for document ${documentId}`, JSON.stringify({ documentId, summary: result.summary })]);

      await client.query(
        "UPDATE files SET analysis = $1 WHERE id = $2 AND (creator_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN')",
        [JSON.stringify(result), documentId]
      );

      await this.saveAgentLogs({
        fileId: documentId,
        userId,
        status: "success",
        executionPath: [{
          agent: "AnalysisAgent",
          task: "Audit",
          path: "Orchestrator -> AnalysisAgent",
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          fallback_triggered: false
        }],
        decisions: { "AnalysisAgent": { outcome: "Audit complete", confidence: 100, reasoning: "Heuristic/AI scan", actionTaken: "Updated file analysis" } },
        confidenceScore: 100
      }, dbClient);

      if (!dbClient) await client.query("COMMIT");
      return result;
    } catch (err) {
      if (!dbClient && client) await client.query("ROLLBACK").catch(() => {});
      console.error("AgentOrchestrator runAnalysis failed:", err);
      throw err;
    }
  }

  async askLawyer(prompt: string, userId: string, documents?: any[]): Promise<{ answer: string, sources: any[] }> {
    try {
      let context: any[] = [];
      if (documents && documents.length > 0) {
        context = documents.map(doc => ({
          content: doc.content,
          file_id: doc.id || doc.file_id,
          title: doc.title || "Selected Document"
        }));
      } else {
        context = await semanticSearch(userId, prompt, 10);
      }

      const answer = await this.askLawyerAgent.resolveQuery(context, prompt);
      const answerLower = answer.toLowerCase();
      const reconciledSources = Array.from(new Set(context.map(c => c.file_id)))
        .map(fileId => {
          const chunk = context.find(c => c.file_id === fileId);
          return { id: fileId, title: chunk.title, type: "Document", relevance: "High" };
        })
        .filter(source => answerLower.includes(source.title.toLowerCase()) || answerLower.includes(source.id.toLowerCase()));

      await pool.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, prompt, context_files, ai_response)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'legal_ask', prompt, JSON.stringify(reconciledSources.map(s => s.title)), answer]);

      return { answer, sources: reconciledSources };
    } catch (err) {
      console.error("AgentOrchestrator askLawyer failed:", err);
      throw err;
    }
  }

  async runDrafting(inputs: any): Promise<string> {
    let draft = await this.draftingAgent.draftDocument(inputs);
    let iterations = 0;
    const maxIterations = 5;
    let isSatisfactory = false;

    while (!isSatisfactory && iterations < maxIterations) {
      const audit = await this.analysisAgent.runAudit(draft, inputs.type || "Agreement");
      await pool.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, prompt, ai_response, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [null, 'draft_critic_loop', `Iteration ${iterations+1}`, draft, JSON.stringify({ audit_summary: audit.summary })]);

      const criticalRisks = audit.risks.filter((r: any) => r.severity === "high" || r.risk_level === "CRITICAL");

      if (criticalRisks.length === 0) {
        isSatisfactory = true;
      } else {
        const refinementPrompt = `The previous draft has the following critical risks:\n${criticalRisks.map((r: any) => `- ${r.clause}: ${r.description}`).join("\n")}\n\nPlease rewrite the draft to address these risks while maintaining the original intent.`;
        draft = await this.draftingAgent.draftDocument({
          ...inputs,
          instructions: `${inputs.instructions}\n\n[REFINEMENT DIRECTIVE]: ${refinementPrompt}`
        });
        iterations++;
      }
    }
    return draft;
  }

  async remediate(clauseText: string, riskType: string): Promise<any> {
    return await this.negotiationAgent.draftRedline(clauseText, riskType);
  }

  async interactAnalyze(
    folderIds: string[] = [], 
    prompt: string,
    userId: string,
    documentMode: "unified" | "individual" = "unified",
    answerStyle: "narrative" | "tabular" = "narrative",
    history: any[] = [],
    dbClient?: any
  ): Promise<any> {
    const client = dbClient || pool;
    try {
      if (!dbClient) {
        await client.query("BEGIN");
        await client.query("SET LOCAL app.current_user_id = $1", [userId]);
        await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
      }

      const safeFolderIds = Array.isArray(folderIds) ? folderIds : [];
      const folderFilters = safeFolderIds.filter(id => id !== "root");

      // FIX: Explicit cast to ::text[] to resolve syntax error
      const query = `
        SELECT id, title, content 
        FROM files 
        WHERE (folder_id IS NULL OR folder_id = ANY($1::text[])) 
        AND (creator_id = current_setting('app.current_user_id', true) 
             OR current_setting('app.current_user_role', true) = 'ADMIN')
      `;

      const { rows } = await client.query(query, [folderFilters]);
      const files = rows;

      if (files.length === 0) {
        throw new Error("No documents found in selected folders.");
      }

      let analysis = "";
      if (documentMode === "unified") {
        analysis = await this.analysisAgent.analyzeDocuments(files.map(f => f.content), prompt);
      } else {
        const summaries = [];
        for (const file of files) {
          const res = await this.analysisAgent.analyzeDocuments([file.content], prompt);
          summaries.push(`### Analysis for ${file.title}\n${res}`);
        }
        analysis = summaries.join("\n\n---\n\n");
      }

      if (!dbClient) await client.query("COMMIT");

      return { analysis, clauses: [] };
    } catch (err: any) {
      if (!dbClient && client) await client.query("ROLLBACK").catch(() => {});
      console.error("AgentOrchestrator interactAnalyze failed:", err);
      throw err;
    }
  }

  private async saveAgentLogs(res: any, dbClient?: any) {
    const client = dbClient || pool;
    try {
      await client.query(`
        INSERT INTO agent_execution_logs (file_id, user_id, agent_name, task_name, execution_path, decisions, confidence_score, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        res.fileId || null,
        res.userId,
        "AgentOrchestrator",
        "DocumentOrchestrationAndAuditLog",
        JSON.stringify(res.executionPath),
        JSON.stringify(res.decisions),
        res.confidenceScore,
        res.status,
      ]);
    } catch (dbErr) {
      console.error("[Orchestrator] Failed to log execution metrics:", dbErr);
    }
  }
}