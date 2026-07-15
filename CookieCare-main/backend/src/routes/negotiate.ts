import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import {
  executeCompletion,
  executeJsonCompletion,
} from "../modules/drafting/llm/index.js";
import { LLMProvider, LLMTask } from "../modules/drafting/config/model-specs.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

// ── Existing: full negotiation run ──────────────────────────────────────────
router.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    const result = await orchestrator.runNegotiation(documentContent, playbooks, instructions);
    res.json({ redlines: result });
  } catch (err: any) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── NEW: Multi-agent clause evaluator ────────────────────────────────────────
// Called by NegotiateHub on document load.
// Returns structured JSON: { data: { markups: AgentMarkup[] } }
router.post("/evaluate", authenticateToken, async (req, res) => {
  const { content, documentTitle = "Contract", documentType = "Agreement" } = req.body;

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }

  const systemPrompt = `You are a Multi-Agent Contract Risk Evaluator.
Identify the highest-risk clauses in the provided contract and recommend safer replacement language.
Return EXACTLY valid JSON only — no markdown, no commentary, no additional keys.

Use this exact schema:
{
  "markups": [
    {
      "clauseId": "clause_1",
      "original": "exact verbatim text from the document (min 15 chars)",
      "replacement": "safer alternative clause text",
      "reasoning": "explanation of why this clause is risky",
      "riskLevel": "RED | YELLOW | GREEN"
    }
  ]
}

Rules:
- Identify 2 to 6 highest-value risk clauses.
- "original" MUST be verbatim text drawn from the document and at least 15 characters.
- Provide a concise, safer "replacement" clause for each risk.
- Use RED for highly unacceptable risk, YELLOW for moderate risk, GREEN for acceptable language.
- Focus on indemnity, IP ownership, termination, liability caps, data protection, audit / compliance, and confidentiality.
- If no significant risks are present, return { "markups": [] }.`;

  const userPrompt = `Document Title: ${documentTitle}
Document Type: ${documentType}

[CONTRACT CONTENT]
${content.substring(0, 12000)}`; // cap to avoid token overflow

  const evaluationSchema = {
    type: "object",
    properties: {
      markups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            clauseId: { type: "string" },
            original: { type: "string" },
            replacement: { type: "string" },
            reasoning: { type: "string" },
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

    const parsed = await executeJsonCompletion(
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

// ── NEW: Lumi compromise drafter ─────────────────────────────────────────────
// Called by NegotiateHub Lumi terminal for auto-negotiation.
// Returns: { result: string }
router.post("/compromise", authenticateToken, async (req, res) => {
  const { originalText, riskExplanation, userPrompt: customPrompt, playbookPreferred } = req.body;

  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }

  const systemPrompt = `You are Lumi, an expert AI negotiation counsel.
Your task is to draft an improved replacement for a risky contract clause.
${playbookPreferred
    ? "Prioritise the client's protections while remaining commercially fair and defensible."
    : "Draft a balanced and commercially acceptable compromise that reduces risk for the client."}

Return ONLY the replacement clause text. Do not include any preamble, explanation, quotes, markdown, or extra sections.`;

  const userPrompt = `Original risky clause:
"${originalText}"

Risk analysis: ${riskExplanation || "General clause risk detected."}
${customPrompt ? `\nAdditional instruction: ${customPrompt}` : ""}

Draft the improved replacement clause exactly as the final clause text:`;

  try {
    console.log(`[negotiate/compromise] Drafting ${playbookPreferred ? "playbook-preferred" : "balanced"} compromise via Gemini`);

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

export default router;
