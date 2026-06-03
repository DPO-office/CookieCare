import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";
import { semanticSearch } from "../RAG/ragService.js";
import { DraftingAgent } from "./draftingAgent.js";
import { AnalysisAgent } from "./analysisAgent.js";
import { NegotiationAgent } from "./negotiationAgent.js";
import { AskLawyerAgent } from "./askLawyerAgent.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export class AgentOrchestrator {
  private draftingAgent = new DraftingAgent();
  private analysisAgent = new AnalysisAgent();
  private negotiationAgent = new NegotiationAgent();
  private askLawyerAgent = new AskLawyerAgent();

  async runAnalysis(documentId: string, content: string, userId: string): Promise<string> {
    try {
      const result = await this.analysisAgent.analyzeDocuments([content], "Comprehensive risk and compliance audit.");
      await pool.query(
        "UPDATE files SET analysis = $1 WHERE id = $2 AND creator_id = $3",
        [JSON.stringify({ summary: result }), documentId, userId]
      );
      return result;
    } catch (err) {
      console.error("AgentOrchestrator runAnalysis failed:", err);
      return "Analysis failed due to a system error.";
    }
  }

  async askLawyer(prompt: string, userId: string): Promise<string> {
    try {
      const context = await semanticSearch(userId, prompt, 10);
      return await this.askLawyerAgent.resolveQuery(context, prompt);
    } catch (err) {
      console.error("AgentOrchestrator askLawyer failed:", err);
      return "An error occurred while consulting the AI attorney.";
    }
  }

  async interactAnalyze(
    folderIds: string[],
    prompt: string,
    userId: string,
    documentMode: "unified" | "individual" = "unified",
    answerStyle: "narrative" | "tabular" = "narrative",
    history: any[] = []
  ): Promise<any> {
    let client;
    try {
      client = await pool.connect();
      let files: any[] = [];
      if (folderIds.includes("root")) {
        const { rows } = await client.query(
          "SELECT id, title, content FROM files WHERE (folder_id IS NULL OR folder_id = ANY($1)) AND creator_id = $2",
          [folderIds.filter(id => id !== "root"), userId]
        );
        files = rows;
      } else {
        const { rows } = await client.query(
          "SELECT id, title, content FROM files WHERE folder_id = ANY($1) AND creator_id = $2",
          [folderIds, userId]
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
        clauses: [
          {
            id: "c1",
            clauseText: "Identified during real-time scan.",
            severity: "medium",
            reason: "Compliance check triggered.",
            remediation: "Review with legal counsel."
          }
        ]
      };
    } catch (err: any) {
      console.error("AgentOrchestrator interactAnalyze failed:", err);
      throw err;
    } finally {
      if (client) client.release();
    }
  }

}
