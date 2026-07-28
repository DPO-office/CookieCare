import crypto from "crypto";
import { pool } from "../../../config/database.js";
import { LLMTask, LLMProvider } from "../config/model-specs.js";
import { executeJsonCompletion } from "../llm/index.js";
import {
  TEMPLATE_NORMALIZE_SYSTEM,
  TEMPLATE_NORMALIZE_USER_PREFIX,
} from "../prompts/vault-ingest-templates.js";

export interface ParsedTemplateRecord {
  name: string;
  jurisdiction: string;
  content: string;
}

const TEMPLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "jurisdiction", "content"],
  properties: {
    name: { type: "string" },
    jurisdiction: { type: "string" },
    content: { type: "string" },
  },
} as const;

/**
 * Normalizes an uploaded agreement into contract_templates + a vault library_items row.
 */
export class TemplateIngester {
  constructor(private readonly provider: LLMProvider = LLMProvider.GEMINI) {}

  async ingestTemplateText(
    rawText: string,
    options: {
      contractType: string;
      userId: string;
      sourceFileId?: string;
      fileTitle?: string;
      jurisdiction?: string;
      /** When set, update this processing placeholder instead of inserting a new row. */
      libraryItemId?: string;
    }
  ): Promise<{
    templateId: string;
    libraryItemId: string;
    name: string;
  }> {
    const snippet =
      rawText.length > 60_000 ? `${rawText.slice(0, 60_000)}…` : rawText;

    const prompt = [
      TEMPLATE_NORMALIZE_USER_PREFIX,
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

    let parsed: ParsedTemplateRecord;
    try {
      parsed = await executeJsonCompletion<ParsedTemplateRecord>(
        prompt,
        TEMPLATE_NORMALIZE_SYSTEM,
        TEMPLATE_SCHEMA,
        LLMTask.STRUCTURAL_JSON,
        this.provider
      );
    } catch (err) {
      console.warn(
        `[TemplateIngester] LLM normalize failed; storing raw text. ${(err as Error).message}`
      );
      parsed = {
        name: options.fileTitle || `${options.contractType} Template`,
        jurisdiction: options.jurisdiction || "Not specified",
        content: rawText,
      };
    }

    const content =
      typeof parsed.content === "string" && parsed.content.trim()
        ? parsed.content.trim()
        : rawText;
    const name =
      (typeof parsed.name === "string" && parsed.name.trim()) ||
      options.fileTitle ||
      `${options.contractType} Template`;
    const jurisdiction =
      (typeof parsed.jurisdiction === "string" && parsed.jurisdiction.trim()) ||
      options.jurisdiction ||
      "Not specified";

    const templateId = "tpl_" + crypto.randomUUID();
    const libraryItemId = options.libraryItemId || "lib_" + crypto.randomUUID();

    await pool.query(
      `INSERT INTO contract_templates (
         id, name, contract_type, jurisdiction, status, content
       ) VALUES ($1, $2, $3, $4, 'active', $5)`,
      [templateId, name, options.contractType, jurisdiction, content]
    );

    const libraryDetails = JSON.stringify({
      status: "ready",
      templateId,
      contractType: options.contractType,
      jurisdiction,
      sourceFileId: options.sourceFileId || null,
      contentPreview: content.slice(0, 500),
    });
    // Tags are short filter chips only — full jurisdiction lives in details.
    const shortJurisdiction = compactTagLabel(jurisdiction);
    const libraryTags = [options.contractType, shortJurisdiction]
      .filter(Boolean)
      .join(", ");
    const libraryDescription = shortJurisdiction
      ? `${options.contractType} template · ${shortJurisdiction}`
      : `${options.contractType} template`;

    if (options.libraryItemId) {
      await pool.query(
        `UPDATE library_items
         SET name = $1, description = $2, tags = $3, details = $4
         WHERE id = $5`,
        [name, libraryDescription, libraryTags, libraryDetails, libraryItemId]
      );
    } else {
      await pool.query(
        `INSERT INTO library_items (id, user_id, type, name, description, tags, details)
         VALUES ($1, $2, 'templates', $3, $4, $5, $6)`,
        [
          libraryItemId,
          options.userId,
          name,
          libraryDescription,
          libraryTags,
          libraryDetails,
        ]
      );
    }

    console.log(
      `[TemplateIngester] stored templateId=${templateId} libraryItemId=${libraryItemId}`
    );

    return { templateId, libraryItemId, name };
  }
}

/** Keep vault table tags short; long regulatory dumps belong in details.jurisdiction. */
function compactTagLabel(value: string | undefined, maxLen = 28): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  if (/^not\s*specified$/i.test(trimmed) || /^unspecified$/i.test(trimmed)) {
    return null;
  }
  if (trimmed.length <= maxLen) return trimmed;
  return null;
}
