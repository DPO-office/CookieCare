import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import { addJobToQueue } from "../services/jobQueue.js";

const router = Router();
const orchestrator = new AgentOrchestrator();

// router.post("/generate", authenticateToken, async (req, res) => {
//   try {
//     const { mode, detailLevel, instructions, formFields, templateId, sourceText, playbookText } = req.body;
//     const result = await orchestrator.runDrafting({
//       mode,
//       detailLevel,
//       instructions,
//       formFields,
//       templateId,
//       sourceText,
//       playbookText
//     });
//     res.json({ content: result });
//   } catch (err: any) {
//     res.status(500).json({ error: err.message });
//   }
// });



router.post("/generate-stream", authenticateToken, async (req, res) => {
  try {

    // req.body = payload
    const job = await addJobToQueue(req.user!.id, "template_drafting", req.body);
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});




router.post("/refine", authenticateToken, async (req, res) => {
  try {
    const { text, type, param } = req.body;
    const job = await addJobToQueue(req.user!.id, "template_drafting", {
      type: "refine",
      text,
      refineType: type,
      param
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/process-uploaded-template", authenticateToken, async (req, res) => {
  const templateText = typeof req.body.templateText === "string" ? req.body.templateText : "";
  if (!templateText.trim()) {
    return res.status(400).json({ error: "Template text is required" });
  }

  const placeholders = Array.from(templateText.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g));
  const fields = placeholders.map((match, index) => ({
    id: match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || `field_${index + 1}`,
    name: match[1].trim(),
    defaultValue: "",
    description: "Template field"
  }));

  res.json({ data: { redactedText: templateText, fields } });
});

export default router;
