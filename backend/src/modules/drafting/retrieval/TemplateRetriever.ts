import type { Pool } from "pg";
import { decryptData } from "../../../utils/crypto.js";
import { DraftState, RequirementContext } from "../models/draft-state.js";

export type TemplateSource =
  | "vault"
  | "default_type"
  | "source_upload"
  | "none";

export interface TemplateLookupResult {
  content: string | null;
  source: TemplateSource;
}

/**
 * Resolves baseline template text for PAC CREATE.
 * Order: source upload → vault documentId → contract_templates by type (soft jurisdiction).
 */
export class TemplateRetriever {
  constructor(private readonly db: Pool) {}

  async retrieveTemplate(
    requirements: RequirementContext,
    state: DraftState
  ): Promise<TemplateLookupResult> {
    // Uploaded counterparty / source agreement is the working document when present.
    if (state.request.sourceText?.trim()) {
      const source = state.request.sourceText.trim();
      return {
        content: source,
        source: "source_upload",
      };
    }

    // Vault / library template when selected.
    const vaultId = state.request.vaultDocumentId || state.request.templateId;

    if (vaultId && String(vaultId).trim()) {
      const fromVault = await this.resolveById(String(vaultId).trim());
      if (fromVault) {
        console.log(`[TemplateRetriever] vault hit id=${vaultId}`);
        return { content: fromVault, source: "vault" };
      }
      console.log(`[TemplateRetriever] vault miss id=${vaultId}; falling back to type`);
    }

    // Type-based lookup with soft jurisdiction.
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
  private async resolveById(id: string): Promise<string | null> {
    try {
      const trimmedId = id.trim();

      // 1. Direct hit in contract_templates table
      const templateRes = await this.db.query(
        `SELECT content FROM contract_templates WHERE (id = $1 OR name ILIKE $2) AND status = 'active' LIMIT 1`,
        [trimmedId, `%${trimmedId}%`]
      );
      if (templateRes.rows[0]?.content) {
        return String(templateRes.rows[0].content);
      }

      // 2. Lookup in library_items (templates tab or vault asset)
      const libRes = await this.db.query(
        `SELECT details, id FROM library_items
         WHERE (id = $1 OR details::text ILIKE $2 OR details::text ILIKE $3)
         LIMIT 1`,
        [trimmedId, `%"templateId":"${trimmedId}"%`, `%"sourceFileId":"${trimmedId}"%`]
      );

      let targetSourceFileId: string | undefined;

      if (libRes.rows[0]?.details) {
        const details = libRes.rows[0].details;
        if (typeof details === "string" && details.trim()) {
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
            if (parsed?.sourceFileId) {
              targetSourceFileId = String(parsed.sourceFileId);
            }
          } catch {
            if (details.length > 50) return details;
          }
        } else if (typeof details === "object" && details !== null) {
          const parsed = details as any;
          if (parsed.content) return String(parsed.content);
          if (parsed.templateId) {
            const nested = await this.db.query(
              `SELECT content FROM contract_templates WHERE id = $1 AND status = 'active' LIMIT 1`,
              [parsed.templateId]
            );
            if (nested.rows[0]?.content) return String(nested.rows[0].content);
          }
          if (parsed.sourceFileId) {
            targetSourceFileId = String(parsed.sourceFileId);
          }
        }
      }

      const lookupFileId = targetSourceFileId || trimmedId;

      // 3. Lookup in document_structure_artifacts (Docling structural graph)
      const artifactRes = await this.db.query(
        `SELECT encrypted_payload FROM document_structure_artifacts WHERE file_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [lookupFileId]
      );
      if (artifactRes.rows[0]?.encrypted_payload) {
        try {
          const decrypted = decryptData(artifactRes.rows[0].encrypted_payload);
          const graph = JSON.parse(decrypted);
          if (graph?.canonicalText?.trim()) {
            return graph.canonicalText.trim();
          }
        } catch (err) {
          console.warn(`[TemplateRetriever] artifact decrypt failed for ${lookupFileId}: ${(err as Error).message}`);
        }
      }

      // 4. Fallback lookup in files table
      const fileRes = await this.db.query(
        `SELECT content, is_encrypted, original_file, mime_type FROM files WHERE id = $1 LIMIT 1`,
        [lookupFileId]
      );
      if (fileRes.rows[0]) {
        const row = fileRes.rows[0];
        const rawContent = row.is_encrypted ? decryptData(row.content) : String(row.content ?? "");
        if (rawContent.trim()) {
          return rawContent.trim();
        }
        if (row.original_file && row.mime_type) {
          const { extractText } = await import("../../../utils/extractText.js");
          const buffer = Buffer.from(row.original_file, "base64");
          const extracted = await extractText(buffer, row.mime_type);
          if (extracted.text?.trim()) {
            return extracted.text.trim();
          }
        }
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
