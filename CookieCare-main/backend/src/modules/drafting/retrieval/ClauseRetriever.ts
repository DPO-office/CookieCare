import type { Pool } from "pg";
import { Clause, RequirementContext } from "../models/draft-state.js";

export type ClauseSource =
  | "library_items"
  | "clause_catalog"
  | "hardcoded_fallback"
  | "none";

export interface ClauseLookupResult {
  clauses: Clause[];
  source: ClauseSource;
}

/**
 * Clause library lookup for drafting prompts.
 * Prefers DB (clause_catalog when present, else library_items); hardcoded last resort.
 */
export class ClauseRetriever {
  constructor(private readonly db: Pool) {}

  async retrieveClauses(
    requirements: RequirementContext,
    playbookTopics: string[],
    intent: string,
    organizationId?: string | null
  ): Promise<ClauseLookupResult> {
    const requestedTypes = [
      ...(requirements.requiredClauses || []),
      ...(requirements.optionalClauses || []),
    ];

    const topicsToSearch =
      requestedTypes.length > 0
        ? requestedTypes
        : intent === "REACTIVE"
          ? playbookTopics
          : ["General"];

    const normalizedTypes = (
      topicsToSearch.length ? topicsToSearch : ["General"]
    ).slice(0, 6);

    const fromCatalog = await this.fromClauseCatalog(
      normalizedTypes,
      requirements,
      organizationId
    );
    if (fromCatalog.length > 0) {
      console.log(
        `[ClauseRetriever] clause_catalog hits=${fromCatalog.length} types=${normalizedTypes.join(",")}`
      );
      return { clauses: fromCatalog, source: "clause_catalog" };
    }

    const fromLibrary = await this.fromLibraryItems(
      normalizedTypes,
      requirements
    );
    if (fromLibrary.length > 0) {
      console.log(
        `[ClauseRetriever] library_items hits=${fromLibrary.length} types=${normalizedTypes.join(",")}`
      );
      return { clauses: fromLibrary, source: "library_items" };
    }

    console.log(
      `[ClauseRetriever] hardcoded_fallback types=${normalizedTypes.join(",")}`
    );
    return {
      clauses: this.buildFallbackClauses(normalizedTypes, requirements),
      source: "hardcoded_fallback",
    };
  }

  private async fromClauseCatalog(
    types: string[],
    requirements: RequirementContext,
    organizationId?: string | null
  ): Promise<Clause[]> {
    try {
      const orgId = organizationId?.trim() || null;
      const { rows } = await this.db.query(
        `SELECT id, clause_type, jurisdiction, raw_text, status
         FROM clause_catalog
         WHERE status = 'active'
           AND ($1::text IS NULL OR contract_type = $1 OR contract_type ILIKE $2)
           AND ($3::text IS NULL OR organization_id = $3 OR organization_id IS NULL)
         ORDER BY
           CASE WHEN organization_id = $3 THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 50`,
        [
          requirements.contractType || null,
          requirements.contractType ? `%${requirements.contractType}%` : null,
          orgId,
        ]
      );

      if (!rows.length) return [];

      return this.rankByType(
        rows.map((row: any) => ({
          id: String(row.id),
          clauseType: String(row.clause_type || "General"),
          jurisdiction: String(
            row.jurisdiction || requirements.jurisdiction || "Not specified"
          ),
          riskLevel: "Medium" as const,
          isApproved: true,
          text: String(row.raw_text || ""),
          haystack: `${row.clause_type || ""} ${row.raw_text || ""}`.toLowerCase(),
        })),
        types
      );
    } catch {
      // Table may not exist yet in prototype DBs.
      return [];
    }
  }

  private async fromLibraryItems(
    types: string[],
    requirements: RequirementContext
  ): Promise<Clause[]> {
    try {
      const { rows } = await this.db.query(
        `SELECT id, name, details, tags
         FROM library_items
         WHERE type = 'clauses'
         ORDER BY created_at DESC
         LIMIT 50`
      );

      if (!rows.length) return [];

      return this.rankByType(
        rows.map((row: any) => {
          const detailsRaw =
            typeof row.details === "string"
              ? row.details
              : JSON.stringify(row.details || {});
          let clauseText = detailsRaw;
          let clauseType = String(row.name || "General");
          try {
            const parsed = JSON.parse(detailsRaw);
            if (parsed?.rawText) clauseText = String(parsed.rawText);
            if (parsed?.clauseType) clauseType = String(parsed.clauseType);
          } catch {
            /* plain-text details */
          }
          const tagsText =
            typeof row.tags === "string"
              ? row.tags
              : JSON.stringify(row.tags || []);
          return {
            id: String(row.id),
            clauseType,
            jurisdiction: requirements.jurisdiction || "Not specified",
            riskLevel: "Medium" as const,
            isApproved: true,
            text: clauseText,
            haystack: `${row.name || ""} ${clauseType} ${clauseText} ${tagsText}`.toLowerCase(),
          };
        }),
        types
      );
    } catch {
      return [];
    }
  }

  private rankByType(
    candidates: Array<Clause & { haystack: string }>,
    types: string[]
  ): Clause[] {
    const lowered = types.map((t) => t.toLowerCase());
    const ranked: Clause[] = [];

    for (const candidate of candidates) {
      const matchingType = lowered.find(
        (t) =>
          candidate.haystack.includes(t) ||
          candidate.clauseType.toLowerCase().includes(t)
      );
      if (!matchingType) continue;

      ranked.push({
        id: candidate.id,
        clauseType: matchingType,
        jurisdiction: candidate.jurisdiction,
        riskLevel: candidate.riskLevel,
        isApproved: candidate.isApproved,
        text: candidate.text,
      });

      if (ranked.length >= 8) break;
    }

    return ranked;
  }

  // Just for testing purposes
  private buildFallbackClauses(
    clauseTypes: string[],
    requirements: RequirementContext
  ): Clause[] {
    const fallbackLibrary: Record<string, string> = {
      Confidentiality:
        "Each Party shall keep Confidential Information strictly confidential, use it only for performance under this Agreement, and apply reasonable safeguards no less protective than those used for its own confidential materials.",
      Liability:
        "Neither Party shall be liable for indirect, incidental, special, or consequential damages. Aggregate liability under this Agreement shall not exceed the total fees paid in the twelve (12) months preceding the event giving rise to liability.",
      Indemnity:
        "Each Party shall defend, indemnify, and hold harmless the other Party from third-party claims arising from its breach of law, gross negligence, or willful misconduct, subject to prompt notice and cooperation.",
      Termination:
        "Either Party may terminate this Agreement for material breach not cured within thirty (30) days after written notice. Upon termination, accrued payment obligations and clauses intended to survive shall remain in effect.",
      DataProtection:
        "Where personal data is processed, the Parties shall comply with applicable data protection laws, process data only on documented instructions, and implement appropriate technical and organizational security measures.",
      GoverningLaw: `This Agreement shall be governed by the laws of ${requirements.jurisdiction}, excluding conflict-of-law rules, and disputes shall be resolved in the competent courts of that jurisdiction.`,
      General:
        "This clause is a temporary approved placeholder and should be replaced by a clause from the managed clause library once vault ingestion has populated library_items.",
    };

    return clauseTypes.map((rawType, index) => {
      const cleanType = String(rawType || "General").trim() || "General";
      const normalized = cleanType.replace(/\s+/g, "");
      const text =
        fallbackLibrary[normalized] ||
        fallbackLibrary[cleanType] ||
        fallbackLibrary.General;

      return {
        id: `fallback_clause_${index + 1}`,
        clauseType: cleanType,
        jurisdiction: requirements.jurisdiction,
        riskLevel: index < 2 ? ("Low" as const) : ("Medium" as const),
        isApproved: true,
        text,
      };
    });
  }
}
