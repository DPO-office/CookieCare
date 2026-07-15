import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { openRouterComplete } from "../services/openRouterClient.js";

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
Analyze the provided contract and identify clauses that carry legal risk.
Return ONLY a valid JSON object — no markdown fences, no commentary.

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
- Extract between 2 and 6 high-value risk clauses
- "original" MUST be verbatim text that appears in the document
- "original" must be at least 15 characters
- Focus on: indemnity, IP ownership, termination rights, liability caps, data protection
- If no significant risks exist, return { "markups": [] }`;

  const userPrompt = `Document Title: ${documentTitle}
Document Type: ${documentType}

[CONTRACT CONTENT]
${content.substring(0, 12000)}`; // cap to avoid token overflow

  try {
    console.log(`[negotiate/evaluate] Running AI evaluation for "${documentTitle}" via OpenRouter`);

    // Replaceing this with draft temaplte model calling for MVP working
    let responseText = await openRouterComplete(systemPrompt, userPrompt, { jsonMode: true });
    responseText = responseText.trim();

    // Strip accidental markdown fences
    if (responseText.startsWith("```")) {
      responseText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    const parsed = JSON.parse(responseText);
    const markups = Array.isArray(parsed.markups) ? parsed.markups : [];

    console.log(`[negotiate/evaluate] Returned ${markups.length} markup(s)`);
    return res.json({ data: { markups } });
  } catch (err: any) {
    console.error("[negotiate/evaluate] AI error:", err.message);
    // Graceful degradation: return empty markups rather than crashing the UI
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
    ? "Favour the client's position strongly — prioritise their protections."
    : "Draft a balanced, commercially fair compromise that both parties can accept."}

Return ONLY the replacement clause text — no preamble, no explanation, no quotes.`;

  const userPrompt = `Original risky clause:
"${originalText}"

Risk analysis: ${riskExplanation || "General clause risk detected."}
${customPrompt ? `\nAdditional instruction: ${customPrompt}` : ""}

Draft the improved replacement clause:`;

  try {
    console.log(`[negotiate/compromise] Drafting ${playbookPreferred ? "playbook-preferred" : "balanced"} compromise via OpenRouter`);

    const result = await openRouterComplete(systemPrompt, userPrompt, { temperature: 0.4 });
    return res.json({ result: result.trim() });
  } catch (err: any) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
