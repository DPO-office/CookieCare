// TODO : Migrate this from raw sql to ORM/ Prisma
// create schemas there


// model ClauseCatalog {
//   id             String                  @id @default(uuid())
//   organizationId String?                 @map("organization_id")
//   clauseType     String                  @map("clause_type")    // e.g., 'indemnity'
//   contractType   String?                 @map("contract_type")  // e.g., 'NDA'
//   jurisdiction   String?
//   industry       String?
//   status         String                  @default("active")     // 'active' | 'archived'
//   rawText        String                  @map("raw_text")

//   templates      TemplateClauseMapping[]

//   @@map("clause_catalog")
// }

// model TemplateClauseMapping {
//   templateId String   @map("template_id")
//   clauseId   String   @map("clause_id")

//   clause     ClauseCatalog @relation(fields: [clauseId], references: [id])

//   @@id([templateId, clauseId])
//   @@map("template_clause_mappings")
// }



import type { Pool } from "pg";

export interface ClauseCatalogFilters {
  contractType?: string;
  jurisdiction?: string;
  industry?: string;
  templateId?: string;
  clauseIds?: string[];
  organizationId?: string;
}

/**
 * Deterministic metadata filter against the clause catalog.
 * Used before LLM extraction so baseline required clauses come from the database.
 */
export class ClauseCatalogRetriever {
  constructor(private readonly db: Pool) {}

  async fetchBaselineClauseTypes(filters: ClauseCatalogFilters): Promise<string[]> {
    if (filters.clauseIds && filters.clauseIds.length > 0) {
      return this.fetchByClauseIds(filters.clauseIds, filters.organizationId);
    }

    if (filters.templateId) {
      const templateClauses = await this.fetchByTemplateId(
        filters.templateId,
        filters.organizationId
      );
      if (templateClauses.length > 0) {
        return templateClauses;
      }
    }

    return this.fetchByMetadata(filters);
  }

  private async fetchByClauseIds(
    clauseIds: string[],
    organizationId?: string
  ): Promise<string[]> {
    const { rows } = await this.db.query<{ clause_type: string }>(
      `
        SELECT DISTINCT clause_type
        FROM clause_catalog
        WHERE status = 'active'
          AND id = ANY($1::text[])
          AND ($2::text IS NULL OR organization_id = $2)
        ORDER BY clause_type
      `,
      [clauseIds, organizationId ?? null]
    );

    return rows.map((row) => row.clause_type);
  }

  private async fetchByTemplateId(
    templateId: string,
    organizationId?: string
  ): Promise<string[]> {
    const { rows } = await this.db.query<{ clause_type: string }>(
      `
        SELECT DISTINCT cc.clause_type
        FROM template_clause_mappings tcm
        INNER JOIN clause_catalog cc ON cc.id = tcm.clause_id
        WHERE tcm.template_id = $1
          AND cc.status = 'active'
          AND ($2::text IS NULL OR cc.organization_id = $2)
        ORDER BY cc.clause_type
      `,
      [templateId, organizationId ?? null]
    );

    return rows.map((row) => row.clause_type);
  }

  private async fetchByMetadata(filters: ClauseCatalogFilters): Promise<string[]> {
    const { rows } = await this.db.query<{ clause_type: string }>(
      `
        SELECT DISTINCT clause_type
        FROM clause_catalog
        WHERE status = 'active'
          AND ($1::text IS NULL OR contract_type = $1)
          AND ($2::text IS NULL OR jurisdiction = $2)
          AND ($3::text IS NULL OR industry = $3)
          AND ($4::text IS NULL OR organization_id = $4)
        ORDER BY clause_type
      `,
      [
        filters.contractType ?? null,
        filters.jurisdiction ?? null,
        filters.industry ?? null,
        filters.organizationId ?? null,
      ]
    );

    return rows.map((row) => row.clause_type);
  }
}
