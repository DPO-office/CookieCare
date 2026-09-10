import type { Pool } from "pg";
import {
  DraftState,
  PlaybookRule,
  RequirementContext,
} from "../models/draft-state.js";

export interface PlaybookLookupResult {
  rules: PlaybookRule[];
  playbookId: string | null;
  source: "exact_id" | "contract_type_default" | "none";
  miss?: { id: string; reason: string };
}

/**
 * Deterministic playbook rule lookup.
 * Prefer exact library / playbook id; fall back to contract-type org default.
 */
export class PlaybookRetriever {
  constructor(private readonly db: Pool) {}

  async retrieveRules(
    requirements: RequirementContext,
    state: DraftState
  ): Promise<PlaybookLookupResult> {
    const playbookId = state.request.playbookId?.trim() || null;

    if (playbookId) {
      const exact = await this.fetchByPlaybookId(playbookId, state.organizationId);
      if (exact.rules.length > 0) {
        console.log(
          `[PlaybookRetriever] exact playbookId=${playbookId} rules=${exact.rules.length}`
        );
        return {
          rules: exact.rules,
          playbookId,
          source: "exact_id",
        };
      }
      console.warn(
        `[PlaybookRetriever] miss playbookId=${playbookId} reason=${exact.reason}`
      );
      const fallback = await this.fetchByContractType(requirements, state);
      return {
        rules: fallback,
        playbookId: null,
        source: fallback.length > 0 ? "contract_type_default" : "none",
        miss: { id: playbookId, reason: exact.reason },
      };
    }

    const rules = await this.fetchByContractType(requirements, state);
    return {
      rules,
      playbookId: null,
      source: rules.length > 0 ? "contract_type_default" : "none",
    };
  }

  /**
   * Resolve a selected library rulebook / playbook id into structured rules.
   * Tries: (1) library_items details as structured rules, (2) prose → single rule,
   * (3) playbook_rules row by id.
   */
  private async fetchByPlaybookId(
    playbookId: string,
    organizationId?: string | null
  ): Promise<{ rules: PlaybookRule[]; reason: string }> {
    try {
      const { rows } = await this.db.query(
        `SELECT id, name, details, type
         FROM library_items
         WHERE id = $1
           AND (type = 'rulebook' OR type = 'playbook')
         LIMIT 1`,
        [playbookId]
      );

      if (rows.length > 0) {
        const row = rows[0];
        const fromDetails = parseRulesFromLibraryDetails(
          row.details,
          String(row.name || "Playbook")
        );
        if (fromDetails.length > 0) {
          return { rules: fromDetails, reason: "ok" };
        }
        return {
          rules: [],
          reason: "library_item_found_but_no_parsable_rules",
        };
      }
    } catch (err) {
      console.warn(
        `[PlaybookRetriever] library_items lookup failed: ${(err as Error).message}`
      );
    }

    try {
      const orgId = organizationId?.trim() || null;
      const { rows } = await this.db.query(
        `SELECT id, topic, standard_position, fallback_positions, walk_away_condition
         FROM playbook_rules
         WHERE id = $1
           AND ($2::text IS NULL OR organization_id = $2 OR organization_id IS NULL)
         LIMIT 1`,
        [playbookId, orgId]
      );
      if (rows.length > 0) {
        return { rules: rows.map(mapRuleRow), reason: "ok" };
      }
    } catch (err) {
      console.warn(
        `[PlaybookRetriever] playbook_rules id lookup failed: ${(err as Error).message}`
      );
    }

    return { rules: [], reason: "playbook_id_not_found" };
  }

  private async fetchByContractType(
    requirements: RequirementContext,
    state: DraftState
  ): Promise<PlaybookRule[]> {
    try {
      const orgId = state.organizationId?.trim() || null;
      const { rows } = await this.db.query(
        `SELECT id, topic, standard_position, fallback_positions, walk_away_condition
         FROM playbook_rules
         WHERE (
            contract_type = $1
            OR contract_type ILIKE $2
            OR LOWER(TRIM(contract_type)) IN ('general', 'all', 'any', 'company', 'global')
            OR contract_type IS NULL
            OR TRIM(contract_type) = ''
         )
         AND ($3::text IS NULL OR organization_id = $3 OR organization_id IS NULL)
         ORDER BY
           CASE
             WHEN contract_type = $1 OR contract_type ILIKE $2 THEN 0
             ELSE 1
           END,
           CASE WHEN organization_id = $3 THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 40`,
        [requirements.contractType, `%${requirements.contractType}%`, orgId]
      );

      let rules: PlaybookRule[] = rows.map(mapRuleRow);

      if (state.request.sourceText) {
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

function mapRuleRow(row: any): PlaybookRule {
  return {
    id: String(row.id),
    topic: String(row.topic ?? "General"),
    standardPosition: String(row.standard_position ?? ""),
    fallbackPositions: Array.isArray(row.fallback_positions)
      ? row.fallback_positions
      : typeof row.fallback_positions === "string"
        ? safeJsonArray(row.fallback_positions)
        : [],
    walkAwayCondition: String(row.walk_away_condition ?? ""),
  };
}

function parseRulesFromLibraryDetails(
  details: unknown,
  playbookName: string
): PlaybookRule[] {
  if (details == null) return [];

  let parsed: unknown = details;
  if (typeof details === "string") {
    const trimmed = details.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Prose playbook — treat body as the standard position for a general topic.
      return [
        {
          id: `lib-${playbookName}`,
          topic: playbookName,
          standardPosition: trimmed.slice(0, 8000),
          fallbackPositions: [],
          walkAwayCondition: "",
        },
      ];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((item, idx) => coerceRule(item, `${playbookName}-${idx}`))
      .filter((r): r is PlaybookRule => r != null);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.rules)) {
      return obj.rules
        .map((item, idx) => coerceRule(item, `${playbookName}-${idx}`))
        .filter((r): r is PlaybookRule => r != null);
    }
    const single = coerceRule(obj, playbookName);
    if (single) return [single];
    if (typeof obj.content === "string" && obj.content.trim()) {
      return [
        {
          id: `lib-${playbookName}`,
          topic: playbookName,
          standardPosition: obj.content.trim().slice(0, 8000),
          fallbackPositions: [],
          walkAwayCondition: "",
        },
      ];
    }
  }

  return [];
}

function coerceRule(raw: unknown, fallbackId: string): PlaybookRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const topic = String(o.topic ?? o.name ?? "General");
  const standardPosition = String(
    o.standardPosition ?? o.standard_position ?? o.position ?? o.content ?? ""
  );
  if (!standardPosition.trim()) return null;
  const fallbacks = o.fallbackPositions ?? o.fallback_positions ?? [];
  return {
    id: String(o.id ?? fallbackId),
    topic,
    standardPosition,
    fallbackPositions: Array.isArray(fallbacks)
      ? fallbacks.map(String)
      : [],
    walkAwayCondition: String(
      o.walkAwayCondition ?? o.walk_away_condition ?? ""
    ),
  };
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
