import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import {
  executeCompletion,
  executeJsonCompletion,
} from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";
import { saveStep } from "../modules/drafting/steps/save.js";
import { pool } from "../config/database.js";
import { encrypt } from "../utils/crypto.js";
import crypto from "crypto";

const router = Router();
const orchestrator = new AgentOrchestrator();

// ── Existing: Full Negotiation Run ──────────────────────────────────────────
router.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    
    if (!documentContent) {
      return res.status(400).json({ error: "Document content is required for a negotiation run." });
    }

    const result = await orchestrator.runNegotiation(
      documentContent, 
      playbooks || [], 
      instructions || ""
    );
    res.json({ redlines: result });
  } catch (err: any) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── NEW: Multi-Agent Clause Evaluator ────────────────────────────────────────
router.post("/evaluate", authenticateToken, async (req, res) => {
  const { content, documentTitle = "Contract", documentType = "Agreement" } = req.body;

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }

  // Refactored for hyper-precise extraction, deterministic grading, and zero markdown wrapping
  const systemPrompt = `You are an elite Corporate Counsel and Multi-Agent Contract Risk Evaluator.
Your goal is to scan the contract, identify the highest-risk provisions, and recommend commercially realistic replacements.

CRITICAL EXTRACTION DIRECTIVES:
1. "original" MUST match character-for-character, verbatim text pulled directly from the [CONTRACT CONTENT] block. Do not modify, truncate, or paraphrase this text.
2. Focus strictly on key transaction vectors: Indemnity, Intellectual Property, Limitation of Liability Caps, Termination, and Governing Law.
3. Categorize "riskLevel" using these criteria:
   - RED: Uncapped liability, unilateral indemnities, broad IP transfers, non-domestic governing law.
   - YELLOW: Unbalanced terms, overly broad audit rights, long payment cycles, lack of mutual termination.
   - GREEN: Fair, balanced, or market-standard provisions requiring no modification.
4. Return EXACTLY valid JSON matching the schema provided. Do not include markdown wraps (like \`\`\`json), comments, or conversational text.`;

  const userPrompt = `Document Title: ${documentTitle}
Document Type: ${documentType}

[CONTRACT CONTENT]
${content.substring(0, 12000)}`; // Token overflow guard

  const evaluationSchema = {
    type: "object",
    properties: {
      markups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            clauseId: { type: "string" },
            original: { 
              type: "string",
              description: "The exact, verbatim clause text extracted from the document."
            },
            replacement: { 
              type: "string",
              description: "A commercially balanced, protective alternative clause."
            },
            reasoning: { 
              type: "string",
              description: "The strategic reason why this clause presents operational risk."
            },
            riskLevel: {
              type: "string",
              enum: ["RED", "YELLOW", "GREEN"],
            },
          },
          required: ["clauseId", "original", "replacement", "reasoning", "riskLevel"],
          additionalProperties: false,
        },
      },
    },
    required: ["markups"],
    additionalProperties: false,
  };

  try {
    console.log(`[negotiate/evaluate] Running AI evaluation for "${documentTitle}" via Gemini`);

    // Runs fast via our optimized low-latency JSON extraction model
    const parsed = await executeJsonCompletion<Record<string, any>>(
      userPrompt,
      systemPrompt,
      evaluationSchema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI
    );

    const markups = Array.isArray(parsed.markups) ? parsed.markups : [];
    console.log(`[negotiate/evaluate] Returned ${markups.length} markup(s)`);
    return res.json({ data: { markups } });
  } catch (err: any) {
    console.error("[negotiate/evaluate] AI error:", err.message);
    return res.json({ data: { markups: [] }, warning: err.message });
  }
});

// ── NEW: Lumi Compromise Drafter ─────────────────────────────────────────────
router.post("/compromise", authenticateToken, async (req, res) => {
  const { originalText, riskExplanation, userPrompt: customPrompt, playbookPreferred } = req.body;

  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }

  // Prevents conversational preambles and markdown syntax wrapping the output
  const systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a protective, commercially viable replacement for a risky contract clause.

DRAFTING STRATEGY:
${
  playbookPreferred
    ? "Maximize client protection. Draft strong, defensive, client-favorable language that holds the line on critical exposures."
    : "Draft a balanced, market-standard compromise that mitigates risk while facilitating a fast deal sign-off."
}

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the replacement clause.
- Do NOT wrap your output in markdown code blocks (e.g. no \`\`\`), quotation marks, introduction/explanatory preambles, or postscript notes. Begin immediately with the clause text.`;

  const userPrompt = `Original risky clause:
"${originalText}"

Risk Analysis: ${riskExplanation || "General legal risk detected."}
${customPrompt ? `Additional Instruction: ${customPrompt}` : ""}

Draft the replacement clause below:`;

  try {
    console.log(`[negotiate/compromise] Drafting ${playbookPreferred ? "playbook-preferred" : "balanced"} compromise`);

    const result = await executeCompletion(
      userPrompt,
      systemPrompt,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI
    );
    
    return res.json({ result: result.trim() });
  } catch (err: any) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── NEW: Save Negotiation Step Persistence Checkpoint ───────────────────────
router.post("/save-step", authenticateToken, async (req, res) => {
  const { documentId, content, version } = req.body;

  if (!documentId || typeof content !== "string") {
    return res.status(400).json({ error: "documentId and content are required." });
  }

  const userId = req.user!.id;

  try {
    // 1. Fetch current draft state from ledger or start clean
    let state: any = null;
    const snapshotLookup = await pool.query(
      `SELECT state_snapshot_json FROM draft_state_ledger WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
      [documentId]
    );

    if (snapshotLookup.rows.length > 0) {
      state = snapshotLookup.rows[0].state_snapshot_json;
    }

    if (!state) {
      state = {
        request: {
          intent: "REFINEMENT",
          payloadFields: { documentId }
        },
        requirements: null,
        retrieval: {
          matchedTemplate: null,
          applicablePlaybookRules: [],
          fallbackClauses: [],
          historicalReferences: []
        },
        context: null,
        draft: null,
        validation: null,
        riskReview: null,
        metadata: {
          generationParameters: {},
          playbookVersion: "1.0.0",
          timestamp: new Date().toISOString()
        }
      };
    }

    // Update state values for this save step
    state.draft = {
      rawOutput: content,
      formattedDocument: content,
      version: version || 1
    };
    if (!state.request) state.request = {};
    if (!state.request.payloadFields) state.request.payloadFields = {};
    state.request.payloadFields.documentId = documentId;

    // 2. Trigger saveStep pipeline
    const savedState = await saveStep(state);

    // 3. Update main files table and document_versions table so UI updates
    const encryptedContent = encrypt(content);
    
    await pool.query(
      "UPDATE files SET content = $1, updated_at = NOW() WHERE id = $2",
      [encryptedContent, documentId]
    );

    const versionId = "ver_" + crypto.randomUUID();
    await pool.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, documentId, encryptedContent]
    );

    console.log(`[negotiate/save-step] Successfully saved V${version} for document ${documentId}`);
    return res.json({ success: true, savedState });
  } catch (err: any) {
    console.error("[negotiate/save-step] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;