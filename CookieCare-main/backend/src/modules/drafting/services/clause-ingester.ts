// IMPROVMENT IN CODEBASE FOLDER STUCTURE
// we can transfer this whole service folder to a seprate vault folder and if we need to use the llm then we can also make a llm migrate that as well from the moduels based to a centralized way to use getTestModel from the folder and user it in all the moduels for the brain work
import crypto from "crypto";
import { pool } from "../../../config/database.js";
import { LLMTask, LLMProvider } from "../config/model-specs.js";
import { executeJsonCompletion } from "../llm/index.js";
import {
  CLAUSE_EXTRACT_SYSTEM,
  CLAUSE_EXTRACT_USER_PREFIX,
} from "../prompts/vault-ingest-templates.js";

export interface ParsedClauseUnit {
  clauseType: string;
  rawText: string;
  riskLevel: string;
  tags: string[];
}

const CLAUSE_BATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clauses"],
  properties: {
    clauses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["clauseType", "rawText", "riskLevel", "tags"],
        properties: {
          clauseType: { type: "string" },
          rawText: { type: "string" },
          riskLevel: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

/**
 * Parses an uploaded clause pack / agreement excerpt into library_items (type=clauses).
 * Mirrors PlaybookIngester: LLM structure → DB upsert.
 */
export class ClauseIngester {
  constructor(private readonly provider: LLMProvider = LLMProvider.GEMINI) {}

  async ingestClauseText(
    rawText: string,
    options: {
      contractType: string;
      userId: string;
      sourceFileId?: string;
      jurisdiction?: string;
    }
  ): Promise<{ processedClausesCount: number; libraryItemIds: string[] }> {
    const snippet =
      rawText.length > 40_000 ? `${rawText.slice(0, 40_000)}…` : rawText;

    const prompt = [
      CLAUSE_EXTRACT_USER_PREFIX,
      "",
      `Contract type context: ${options.contractType}`,
      options.jurisdiction
        ? `Jurisdiction hint: ${options.jurisdiction}`
        : "",
      "",
      "DOCUMENT TEXT:",
      snippet,
    ]
      .filter(Boolean)
      .join("\n");

    const extracted = await executeJsonCompletion<{ clauses: ParsedClauseUnit[] }>(
      prompt,
      CLAUSE_EXTRACT_SYSTEM,
      CLAUSE_BATCH_SCHEMA,
      LLMTask.STRUCTURAL_JSON,
      this.provider
    );

    const clauses = Array.isArray(extracted?.clauses) ? extracted.clauses : [];
    const libraryItemIds: string[] = [];
    let saved = 0;

    for (const clause of clauses) {
      if (
        !clause ||
        typeof clause.clauseType !== "string" ||
        typeof clause.rawText !== "string" ||
        !clause.rawText.trim()
      ) {
        continue;
      }

      const id = "lib_" + crypto.randomUUID();
      const tags = [
        options.contractType,
        ...(Array.isArray(clause.tags) ? clause.tags : []),
        clause.riskLevel || "Medium",
      ]
        .filter(Boolean)
        .join(", ");

      const details = JSON.stringify({
        rawText: clause.rawText.trim(),
        clauseType: clause.clauseType.trim(),
        contractType: options.contractType,
        jurisdiction: options.jurisdiction || "Not specified",
        riskLevel: clause.riskLevel || "Medium",
        sourceFileId: options.sourceFileId || null,
      });

      try {
        await pool.query(
          `INSERT INTO library_items (id, user_id, type, name, description, tags, details)
           VALUES ($1, $2, 'clauses', $3, $4, $5, $6)`,
          [
            id,
            options.userId,
            clause.clauseType.trim(),
            `${options.contractType} — ${clause.clauseType.trim()}`,
            tags,
            details,
          ]
        );

        // Best-effort mirror into clause_catalog when that table exists.
        await this.tryInsertClauseCatalog({
          id: `cc_${crypto.randomUUID()}`,
          clauseType: clause.clauseType.trim(),
          contractType: options.contractType,
          jurisdiction: options.jurisdiction,
          rawText: clause.rawText.trim(),
        });

        libraryItemIds.push(id);
        saved += 1;
      } catch (err) {
        console.warn(
          `[ClauseIngester] skip clause "${clause.clauseType}": ${(err as Error).message}`
        );
      }
    }

    return { processedClausesCount: saved, libraryItemIds };
  }

  private async tryInsertClauseCatalog(row: {
    id: string;
    clauseType: string;
    contractType: string;
    jurisdiction?: string;
    rawText: string;
  }): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO clause_catalog (
           id, clause_type, contract_type, jurisdiction, status, raw_text
         ) VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.clauseType,
          row.contractType,
          row.jurisdiction || null,
          row.rawText,
        ]
      );
    } catch {
      console.log(
        "[ClauseIngester] DB doesn't found"
      )
    }
  }
}
