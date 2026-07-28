import type { Pool } from "pg";
import {
  DraftState,
  PlaybookRule,
  RequirementContext,
} from "../models/draft-state.js";

/**
 * Deterministic playbook rule lookup by contract type.
 * Authoritative SQL source — not vector search (compliance must be complete).
 */
export class PlaybookRetriever {
  constructor(private readonly db: Pool) {}

  async retrieveRules(
    requirements: RequirementContext,
    state: DraftState
  ): Promise<PlaybookRule[]> {
    try {
      const { rows } = await this.db.query(
        `SELECT id, topic, standard_position, fallback_positions, walk_away_condition
         FROM playbook_rules
         WHERE contract_type = $1
            OR contract_type ILIKE $2
            OR LOWER(TRIM(contract_type)) IN ('general', 'all', 'any', 'company', 'global')
            OR contract_type IS NULL
            OR TRIM(contract_type) = ''
         ORDER BY
           CASE
             WHEN contract_type = $1 OR contract_type ILIKE $2 THEN 0
             ELSE 1
           END,
           created_at DESC
         LIMIT 40`,
        [requirements.contractType, `%${requirements.contractType}%`]
      );

      let rules: PlaybookRule[] = rows.map((row: any) => ({
        id: String(row.id),
        topic: String(row.topic ?? "General"),
        standardPosition: String(row.standard_position ?? ""),
        fallbackPositions: Array.isArray(row.fallback_positions)
          ? row.fallback_positions
          : typeof row.fallback_positions === "string"
            ? safeJsonArray(row.fallback_positions)
            : [],
        walkAwayCondition: String(row.walk_away_condition ?? ""),
      }));

      // Reactive: keep rules whose topics appear relevant in the uploaded contract.
      if (state.request.intent === "REACTIVE" && state.request.sourceText) {
        const sourceLower = state.request.sourceText.toLowerCase();
        rules = rules.filter((rule) => {
          const topicLower = rule.topic.toLowerCase();
          if (sourceLower.includes(topicLower)) return true;
          if (
            topicLower === "confidentiality" &&
            (sourceLower.includes("confidential") || sourceLower.includes("nda"))
          )
            return true;
          if (
            topicLower === "governing law" &&
            (sourceLower.includes("governing") ||
              sourceLower.includes("jurisdiction") ||
              sourceLower.includes("dispute"))
          )
            return true;
          if (
            topicLower === "termination" &&
            (sourceLower.includes("terminate") || sourceLower.includes("survival"))
          )
            return true;
          if (
            topicLower === "indemnity" &&
            (sourceLower.includes("indemnify") ||
              sourceLower.includes("indemnification") ||
              sourceLower.includes("hold harmless"))
          )
            return true;
          if (
            topicLower === "liability" &&
            (sourceLower.includes("liability") || sourceLower.includes("damages"))
          )
            return true;
          return false;
        });
      }

      console.log(
        `[PlaybookRetriever] contractType=${requirements.contractType} rules=${rules.length}`
      );
      return rules;
    } catch (err) {
      console.warn(
        `[PlaybookRetriever] lookup failed: ${(err as Error).message}`
      );
      return [];
    }
  }
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
