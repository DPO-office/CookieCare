import { pool } from "../../../config/database.js";
import {
  LLMTask,
  LLMProvider,
  executeCompletion,
  executeJsonCompletion,
} from "../../../llm/index.js";
import { STAGE_1_STITCH_PROMPT, STAGE_2_EXTRACT_PROMPT } from "../prompts/playbook-ingest-template.js";

export interface ParsedPlaybookRule {
  id: string;
  contractType: string;
  topic: string;
  riskLevel: string;
  standardPosition: string;
  fallbackPositions: string[];
  walkAwayCondition: string;
  triggerPatterns: string[];
  remediationStrategy: string;
}

const SINGLE_RULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "contractType",
    "topic",
    "riskLevel",
    "standardPosition",
    "fallbackPositions",
    "walkAwayCondition",
    "triggerPatterns",
    "remediationStrategy",
  ],
  properties: {
    id: { type: "string" },
    contractType: { type: "string" },
    topic: { type: "string" },
    riskLevel: { type: "string" },
    standardPosition: { type: "string" },
    fallbackPositions: { type: "array", items: { type: "string" } },
    walkAwayCondition: { type: "string" },
    triggerPatterns: { type: "array", items: { type: "string" } },
    remediationStrategy: { type: "string" },
  }
} as const;

function cleanMarkdownArtifacts(rawText: string): string {
  let cleanedText = rawText.trim();

  if (cleanedText.startsWith("```markdown")) {
    cleanedText = cleanedText.replace(/^```markdown\s*/i, "");
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```\s*/, "");
  }

  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.replace(/\s*```$/, "");
  }

  return cleanedText.trim();
}

/**
 * Split the stitched Markdown into one block per rule.
 *
 * Primary strategy: split on the canonical `R-<AREA>-<NNN>` rule headings that
 * Stage 1 is asked to emit. Many real playbooks, however, do not use that ID
 * convention, and if Stage 1 fails to coerce them the strict split silently
 * returns zero blocks (→ "0 rules structured", no error). To avoid that
 * dead-end we fall back progressively:
 *   1. canonical R-XX-NNN headings,
 *   2. any Markdown heading (`#`/`##`) if no canonical ids were found,
 *   3. the whole document as a single block (last resort).
 * Callers without an explicit id get a synthetic `R-GEN-NNN` ref assigned later.
 */
function splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown: string): string[] {
  const canonical = stitchedMarkdown
    .split(/##?\s*(?=R-[A-Z]+-\d+)/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .filter((block) => /R-[A-Z]+-\d+/.test(block));

  if (canonical.length > 0) return canonical;

  // Fallback: split on any markdown heading so playbooks that don't use the
  // R-XX-NNN convention still yield per-rule blocks instead of nothing.
  const byHeading = stitchedMarkdown
    .split(/\n(?=#{1,3}\s+\S)/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 20);

  if (byHeading.length > 1) return byHeading;

  // Last resort: treat the entire (non-empty) document as one rule block.
  const whole = stitchedMarkdown.trim();
  return whole.length > 20 ? [whole] : [];
}

/** Normalize free-text risk labels to a small controlled set. */
function normalizeRiskLevel(raw: string | undefined): string {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "medium";
  if (/(critical|severe|show-?stopper|walk-?away)/.test(v)) return "critical";
  if (/(high|major|serious)/.test(v)) return "high";
  if (/(low|minor|trivial)/.test(v)) return "low";
  if (/(medium|moderate|standard)/.test(v)) return "medium";
  return "medium";
}

export class PlaybookIngester {
  private deafultProvider: LLMProvider;

  constructor(provider: LLMProvider = LLMProvider.GEMINI) {
    this.deafultProvider = provider
  }

  /**
   * Orchestrates the parsing and database persistence chain.
   *
   * @param opts.libraryItemId - The source rulebook's library_items id. When
   *   provided, each rule is stored with a namespaced primary key
   *   ("<libraryItemId>::<ruleRef>") and a `library_item_id` link, so rules are
   *   isolated per rulebook (no cross-playbook id collisions) and retrievable by
   *   the exact rulebook the user selects in Negotiate. Omitting it preserves
   *   the legacy global-id behaviour for non-rulebook callers.
   */
  async ingestPlaybookText(
    rawPdfText: string,
    opts: { libraryItemId?: string; userId?: string; organizationId?: string } = {}
  ): Promise<{ processedRulesCount: number }> {
    console.log("[PlaybookIngester] Initiating structured AI parsing extraction loop...");

    const stitchedMarkdown = cleanMarkdownArtifacts(
      await executeCompletion(rawPdfText, STAGE_1_STITCH_PROMPT,LLMTask.FAST_STITCH,this.deafultProvider)
    );

    const ruleBlocks = splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown);
    let successfullySavedCount = 0;
    let syntheticSeq = 0;

    for (const block of ruleBlocks) {
      try {
        const ruleMatch = block.match(/R-[A-Z]+-\d+/);
        // A rule ref is required for a stable primary key. When the block has no
        // canonical id (fallback split path), synthesize a deterministic one.
        const ruleRef = ruleMatch?.[0] ?? `R-GEN-${String(++syntheticSeq).padStart(3, "0")}`;
        // Namespace the stored id by the source rulebook so the same rule ref in
        // two different playbooks no longer overwrites one another.
        const storedId = opts.libraryItemId ? `${opts.libraryItemId}::${ruleRef}` : ruleRef;

        const parsedRule = await executeJsonCompletion<ParsedPlaybookRule>(
          block,
          STAGE_2_EXTRACT_PROMPT,
          SINGLE_RULE_SCHEMA,
          LLMTask.STRUCTURAL_JSON,
          this.deafultProvider
        );

        if (
          !parsedRule ||  
          typeof parsedRule.id !== "string" ||
          typeof parsedRule.contractType !== "string" ||
          typeof parsedRule.topic !== "string" ||
          typeof parsedRule.riskLevel !== "string" ||
          typeof parsedRule.standardPosition !== "string" ||
          !Array.isArray(parsedRule.fallbackPositions) ||
          typeof parsedRule.walkAwayCondition !== "string" ||
          !Array.isArray(parsedRule.triggerPatterns) ||
          typeof parsedRule.remediationStrategy !== "string"
        ) {
          throw new Error(`Invalid parsed rule payload for ${ruleRef}.`);
        }

        const sql = `
          INSERT INTO playbook_rules (
            id,
            rule_ref,
            library_item_id,
            user_id,
            organization_id,
            contract_type,
            topic,
            risk_level,
            standard_position,
            fallback_positions,
            walk_away_condition,
            trigger_patterns,
            remediation_strategy
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            rule_ref = EXCLUDED.rule_ref,
            library_item_id = EXCLUDED.library_item_id,
            user_id = EXCLUDED.user_id,
            organization_id = EXCLUDED.organization_id,
            contract_type = EXCLUDED.contract_type,
            topic = EXCLUDED.topic,
            risk_level = EXCLUDED.risk_level,
            standard_position = EXCLUDED.standard_position,
            fallback_positions = EXCLUDED.fallback_positions,
            walk_away_condition = EXCLUDED.walk_away_condition,
            trigger_patterns = EXCLUDED.trigger_patterns,
            remediation_strategy = EXCLUDED.remediation_strategy;
        `;

        const params = [
          storedId,                                     // $1 -> namespaced id
          ruleRef,                                      // $2 -> rule_ref (e.g. 'R-IP-001')
          opts.libraryItemId ?? null,                   // $3 -> library_item_id
          opts.userId ?? null,                          // $4 -> user_id
          opts.organizationId ?? null,                  // $5 -> organization_id
          normalizePlaybookContractType(parsedRule.contractType), // $6 -> contract_type
          parsedRule.topic,                             // $7 -> topic
          normalizeRiskLevel(parsedRule.riskLevel),     // $8 -> risk_level
          parsedRule.standardPosition,                  // $9 -> standard_position
          JSON.stringify(parsedRule.fallbackPositions), // $10 -> fallback_positions
          parsedRule.walkAwayCondition,                 // $11 -> walk_away_condition
          JSON.stringify(parsedRule.triggerPatterns),   // $12 -> trigger_patterns
          parsedRule.remediationStrategy,               // $13 -> remediation_strategy
        ];

        await pool.query(sql, params);
        successfullySavedCount += 1;


      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const ruleMatch = block.match(/R-[A-Z]+-\d+/);
        console.warn(
          `[PlaybookIngester] Skipping rule block ${ruleMatch?.[0] ?? "unknown"}: ${errorMessage}`
        );
      }
    }

    return { processedRulesCount: successfullySavedCount , };
  }
}

/**
 * Company playbooks often apply across agreement types. Normalize vague / all-scope
 * labels to General so retrieval can always include them alongside type-specific rules.
 */
function normalizePlaybookContractType(raw: string | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "General";
  const lower = value.toLowerCase();
  if (
    lower === "general" ||
    lower === "all" ||
    lower === "any" ||
    lower === "company" ||
    lower === "global" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unspecified" ||
    lower === "not specified"
  ) {
    return "General";
  }
  return value;
}