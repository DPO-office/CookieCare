import type { Pool } from "pg";
import { decryptData } from "../../../utils/crypto.js";
import { DraftState, RequirementContext } from "../models/draft-state.js";

export type TemplateSource =
  | "vault" // for proactive mode (vault feature)
  | "default_type"
  | "reactive_upload" // for reactive mode document upladation
  | "none";

export interface TemplateLookupResult {
  content: string | null;
  source: TemplateSource;
}

/**
 * Resolves baseline template text for drafting.
 * Order: reactive upload → vault documentId → contract_templates by type (soft jurisdiction).
 */
export class TemplateRetriever {
  constructor(private readonly db: Pool) {}

  async retrieveTemplate(
    requirements: RequirementContext,
    state: DraftState
  ): Promise<TemplateLookupResult> {
    // REACTIVE: the uploaded vendor agreement is the working document.
    if (state.request.intent === "REACTIVE") {
      const source = state.request.sourceText?.trim() || null;
      return {
        content: source,
        source: source ? "reactive_upload" : "none",
      };
    }

    // PROACTIVE: vault selection wins when present.
    const vaultId =
      state.request.intent === "PROACTIVE"
        ? state.request.vaultDocumentId || state.request.templateId
        : state.request.templateId;

    if (vaultId && String(vaultId).trim()) {
      const fromVault = await this.resolveById(String(vaultId).trim());
      if (fromVault) {
        console.log(`[TemplateRetriever] vault hit id=${vaultId}`);
        return { content: fromVault, source: "vault" };
      }
      console.log(`[TemplateRetriever] vault miss id=${vaultId}; falling back to type`);
    }

    // BASIC / fallback: type-based lookup with soft jurisdiction.
    const byType = await this.resolveByContractType(
      requirements.contractType,
      requirements.jurisdiction
    );
    if (byType) {
      console.log(
        `[TemplateRetriever] default_type hit contractType=${requirements.contractType}`
      );
      return { content: byType, source: "default_type" };
    }

    console.log(
      `[TemplateRetriever] none contractType=${requirements.contractType} jurisdiction=${requirements.jurisdiction}`
    );
    return { content: null, source: "none" };
  }
  // Used in proactive and reactive mode in above retrieveTemplate method
  private async resolveById(id: string): Promise<string | null> {
    try {
      // Prefer structured templates table.
      const isUuidLike = id.length === 36 || id.includes("-");
      const templateSql = isUuidLike
        ? `SELECT content FROM contract_templates WHERE id = $1 AND status = 'active' LIMIT 1`
        : `SELECT content FROM contract_templates WHERE (id = $1 OR name ILIKE $2) AND status = 'active' LIMIT 1`;
      const templateParams = isUuidLike ? [id] : [id, `%${id}%`];
      const templateRes = await this.db.query(templateSql, templateParams);
      if (templateRes.rows[0]?.content) {
        return String(templateRes.rows[0].content);
      }

      // library_items (templates tab) may store body in details.
      const libRes = await this.db.query(
        `SELECT details, id FROM library_items
         WHERE (id = $1 OR details::text ILIKE $2)
           AND type = 'templates'
         LIMIT 1`,
        [id, `%"templateId":"${id}"%`]
      );
      if (libRes.rows[0]) {
        const details = libRes.rows[0].details;
        if (typeof details === "string" && details.trim()) {
          // details may be plain text or JSON with content/templateId
          try {
            const parsed = JSON.parse(details);
            if (parsed?.content) return String(parsed.content);
            if (parsed?.templateId) {
              const nested = await this.db.query(
                `SELECT content FROM contract_templates WHERE id = $1 AND status = 'active' LIMIT 1`,
                [parsed.templateId]
              );
              if (nested.rows[0]?.content) return String(nested.rows[0].content);
            }
          } catch {
            return details;
          }
        }
      }

      // Raw vault file content.
      const fileRes = await this.db.query(
        `SELECT content, is_encrypted FROM files WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (fileRes.rows[0]?.content) {
        const row = fileRes.rows[0];
        return row.is_encrypted
          ? decryptData(row.content)
          : String(row.content);
      }

      return null;
    } catch (err) {
      console.warn(`[TemplateRetriever] resolveById failed: ${(err as Error).message}`);
      return null;
    }
  }

  // Basic mode template loading for reference
  private async resolveByContractType(
    contractType: string,
    jurisdiction: string
  ): Promise<string | null> {
    try {
      const jurisdictionUsable =
        jurisdiction &&
        jurisdiction.trim() &&
        !/^not\s*specified$/i.test(jurisdiction.trim()) &&
        !/^unspecified$/i.test(jurisdiction.trim());

      // Soft match: try type + jurisdiction first when usable, then type-only.
      if (jurisdictionUsable) {
        const exact = await this.db.query(
          `SELECT content FROM contract_templates
           WHERE status = 'active'
             AND (contract_type = $1 OR contract_type ILIKE $2)
             AND (jurisdiction = $3 OR jurisdiction ILIKE $4)
           ORDER BY created_at DESC
           LIMIT 1`,
          [
            contractType,
            `%${contractType}%`,
            jurisdiction,
            `%${jurisdiction}%`,
          ]
        );
        if (exact.rows[0]?.content) return String(exact.rows[0].content);
      }

      const byType = await this.db.query(
        `SELECT content FROM contract_templates
         WHERE status = 'active'
           AND (contract_type = $1 OR contract_type ILIKE $2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [contractType, `%${contractType}%`]
      );
      return byType.rows[0]?.content
        ? String(byType.rows[0].content)
        : null;
    } catch (err) {
      console.warn(
        `[TemplateRetriever] resolveByContractType failed: ${(err as Error).message}`
      );
      return null;
    }
  }
}
