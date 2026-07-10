import { pool } from "../../../config/database.js";
import { LLMTask } from "../config/model-specs.js";
import { LLMProvider } from "../config/model-specs.js";
import { executeCompletion, executeJsonCompletion } from "../llm/index.js";

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

const PLAYBOOK_STITCHING_SYSTEM_INSTRUCTION = `
You are an elite legal playbook stitching assistant.
Read the entire multi-page legal playbook text block and reconstruct fragmented tables into a single consolidated Markdown document.
Rules may be split across pages, with IDs on one page, clause text on another, and remediation logic on a third.
Match each fragment to its correct Rule ID and preserve every clause, note, and remediation instruction without truncation.
Output only Markdown.
Group every rule entirely under its own heading in the form "## R-IP-001".
Do not summarize, omit, or shorten long contractual text.
Keep the output deterministic and structurally consistent.
`.trim();

const SINGLE_RULE_SYSTEM_INSTRUCTION = `
You are an elite legal parsing assistant.
Extract exactly one playbook rule from the provided Markdown block and return strict JSON that matches the supplied schema.
Do not add commentary, markdown, or extra keys.
Preserve the full text of each clause and remediation instruction.
If the block contains a rule heading, use it as the rule id.
`.trim();

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

function splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown: string): string[] {
  return stitchedMarkdown
    .split(/##?\s*(?=R-[A-Z]+-\d+)/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .filter((block) => /R-[A-Z]+-\d+/.test(block));
}

export class PlaybookIngester {
  private deafultProvider: LLMProvider;

  constructor(provider: LLMProvider = LLMProvider.GEMINI) {
    this.deafultProvider = provider
  }

  /**
   * Orchestrates the parsing and database persistence chain
   */
  async ingestPlaybookText(rawPdfText: string): Promise<{ processedRulesCount: number }> {
    console.log("[PlaybookIngester] Initiating structured AI parsing extraction loop...");

    const stitchedMarkdown = cleanMarkdownArtifacts(
      await executeCompletion(rawPdfText, PLAYBOOK_STITCHING_SYSTEM_INSTRUCTION,LLMTask.FAST_STITCH,this.deafultProvider)
    );

    const ruleBlocks = splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown);
    let successfullySavedCount = 0;

    for (const block of ruleBlocks) {
      try {
        const ruleMatch = block.match(/R-[A-Z]+-\d+/);
        const ruleId = ruleMatch?.[0] ?? "unknown";

        const parsedRule = await executeJsonCompletion<ParsedPlaybookRule>(
          block,
          SINGLE_RULE_SYSTEM_INSTRUCTION,
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
          throw new Error(`Invalid parsed rule payload for ${ruleId}.`);
        }
        const uniqueRowId = `rule_${crypto.randomUUID()}`;

        const sql = `
          INSERT INTO playbook_rules (
            id,
            contract_type,
            topic,
            risk_level,
            standard_position,
            fallback_positions,
            walk_away_condition,
            trigger_patterns,
            remediation_strategy
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
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
          uniqueRowId,
          parsedRule.id,
          parsedRule.contractType,
          parsedRule.topic,
          parsedRule.riskLevel,
          parsedRule.standardPosition,
          JSON.stringify(parsedRule.fallbackPositions),
          parsedRule.walkAwayCondition,
          JSON.stringify(parsedRule.triggerPatterns),
          parsedRule.remediationStrategy,
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

    return { processedRulesCount: successfullySavedCount };
  }
}