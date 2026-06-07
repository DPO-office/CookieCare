import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

router.post("/evaluate", authenticateToken, async (req: Request, res: Response) => {
  const { content, documentTitle, documentType } = req.body;
  if (!content) return res.status(400).json({ error: "Document content is required" });

  try {
    const auditResult = await orchestrator.analysisAgent.runAudit(content, documentType || "NDA");
    if (!auditResult || !auditResult.risks) {
      throw new Error("MALFORMED_AGENT_RESPONSE");
    }
    const markups = (auditResult.risks || []).map((risk: any, index: number) => ({
      clauseId: `risk_${index + 1}`,
      original: risk.clause || "",
      replacement: risk.remediation || "Standard compliant clause.",
      reasoning: risk.explanation || "Identified legal risk.",
      riskLevel: risk.severity || "YELLOW"
    }));
    res.json({ data: { markups } });
  } catch (err: any) {
    console.error("Negotiate evaluation error:", err);
    const status = err.message === "MALFORMED_AGENT_RESPONSE" ? 502 : 500;
    res.status(status).json({ error: "Audit engine failed to parse document risks. Please ensure the text is clear legal prose." });
  }
});

router.post("/compromise", authenticateToken, async (req: Request, res: Response) => {
  const { originalText, riskExplanation } = req.body;
  if (!originalText) return res.status(400).json({ error: "Original clause text is required." });

  try {
    const result = await orchestrator.negotiationAgent.draftRedline(originalText, riskExplanation);
    res.json({ result: result.proposedText || "Standard protection clause applied as compromise." });
  } catch (err: any) {
    console.error("Negotiate compromise error:", err);
    res.status(500).json({ error: "Negotiation agent failed to draft a compromise. Please adjust the risk explanation." });
  }
});

export default router;
