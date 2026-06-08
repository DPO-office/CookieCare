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
      // If we're in a worker, set context
      if (!dbClient) {
        await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)", [userId, 'USER']);
      }

      const result = await this.analysisAgent.runAudit(content, "NDA"); // Assuming NDA for now or extracting from metadata

      // Log for compliance
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

      return result;
    } catch (err) {
      console.error("AgentOrchestrator runAnalysis failed:", err);
      throw err;
    }
  }

  async askLawyer(prompt: string, userId: string): Promise<string> {
    try {
      const context = await semanticSearch(userId, prompt, 10);
      const response = await this.askLawyerAgent.resolveQuery(context, prompt);

      // Log for compliance
      await pool.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, prompt, context_files, ai_response)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'legal_ask', prompt, JSON.stringify(context.map(c => c.substring(0, 100))), response]);

      return response;
    } catch (err) {
      console.error("AgentOrchestrator askLawyer failed:", err);
      return "An error occurred while consulting the AI attorney.";
    }
  }

  async runDrafting(inputs: any): Promise<string> {
    // Initial Draft
    let draft = await this.draftingAgent.draftDocument(inputs);

    // Stateful "Critic" Loop (LangGraph-style self-correction)
    // Phase 3: Deepen Critic Loop to 5 iterations for enterprise-grade self-correction
    let iterations = 0;
    const maxIterations = 5;
    let isSatisfactory = false;

    while (!isSatisfactory && iterations < maxIterations) {
      const audit = await this.analysisAgent.runAudit(draft, inputs.type || "Agreement");

      // Log intermediate draft for compliance
      await pool.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, prompt, ai_response, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, ["system", 'draft_critic_loop', `Iteration ${iterations+1}`, draft, JSON.stringify({ audit_summary: audit.summary })]);

      const criticalRisks = audit.risks.filter((r: any) => r.severity === "high" || r.risk_level === "CRITICAL");

      if (criticalRisks.length === 0) {
        isSatisfactory = true;
      } else {
        // Feed back findings to Drafting Agent for refinement
        const refinementPrompt = `The previous draft has the following critical risks:
${criticalRisks.map((r: any) => `- ${r.clause}: ${r.description}`).join("\n")}

Please rewrite the draft to address these risks while maintaining the original intent.`;

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
      // If we're in a worker, we might not have RLS session variables set on the pool.
      // We should ideally set them here if dbClient is not provided.
      if (!dbClient) {
        await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)", [userId, 'USER']);
      }

      const safeFolderIds = Array.isArray(folderIds) ? folderIds : [];

      let files: any[] = [];
      
      if (safeFolderIds.length === 0 || safeFolderIds.includes("root")) {
        const folderFilters = safeFolderIds.filter(id => id !== "root");
        const { rows } = await client.query(
          "SELECT id, title, content FROM files WHERE (folder_id IS NULL OR folder_id = ANY($1)) AND (creator_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN')",
          [folderFilters]
        );
        files = rows;
      } else {
        const { rows } = await client.query(
          "SELECT id, title, content FROM files WHERE folder_id = ANY($1) AND (creator_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN')",
          [safeFolderIds]
        );
        files = rows;
      }

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

      return {
        analysis,
        clauses: []
      };
    } catch (err: any) {
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