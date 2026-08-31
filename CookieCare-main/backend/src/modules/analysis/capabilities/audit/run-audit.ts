import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import { groundFindings } from "./ground-findings.js";
import { logAuditInspect } from "./audit-inspect-log.js";
import { emitAnalysisToken, pacLog } from "../../utils/pac-log.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";

const VERIFY_TIMEOUT_MS = 15_000;

/**
 * Deep-only grounding pass. Deterministic first; optional one-shot LLM
 * verifier appends contradictions as Verification notes and never rewrites.
 */
export async function runAudit(state: AnalysisState): Promise<AnalysisState> {
  const started = Date.now();
  const before = state;
  let next = groundFindings(state);
  let verifierRan = false;
  let verifierSkippedReason: string | undefined;
  if (next.renderedOutput) {
    verifierRan = true;
    next = await maybeAppendVerificationNotes(next);
  } else {
    verifierSkippedReason = "no rendered memo yet";
  }
  pacLog("audit complete", {
    ms: Date.now() - started,
    findingDowngrades: next.auditReport?.findingsChanged.length ?? 0,
    assessmentDowngrades: next.auditReport?.assessmentsChanged.length ?? 0,
    contradictions: next.auditReport?.contradictions.length ?? 0,
  });
  logAuditInspect(before, next, { verifierRan, verifierSkippedReason });
  return next;
}

async function maybeAppendVerificationNotes(state: AnalysisState): Promise<AnalysisState> {
  const findings = (state.findings ?? [])
    .filter((f) => f.visibility !== "internal")
    .slice(0, 40)
    .map((f) => ({
      findingId: f.findingId,
      status: f.status,
      claim: f.claim.slice(0, 240),
      requirementId: f.requirementId,
    }));
  const schema = {
    type: "object",
    properties: {
      contradictions: { type: "array", items: { type: "string" } },
    },
    required: ["contradictions"],
  };
  try {
    const result = await Promise.race([
      executeJsonCompletion<{ contradictions: string[] }>(
        [
          "Compare the memo to the findings. Return only contradictions — claims in the memo that the findings do not support.",
          "MEMO:",
          (state.renderedOutput ?? "").slice(0, 12_000),
          "",
          "FINDINGS:",
          JSON.stringify(findings),
        ].join("\n"),
        "You verify legal analysis memos against findings. Return contradictions only. Do not rewrite the memo.",
        schema,
        LLMTask.STRUCTURAL_JSON_LITE,
        LLMProvider.GEMINI,
        {
          maxOutputTokens: 400,
          thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON_LITE),
        }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("audit_verify_timeout")), VERIFY_TIMEOUT_MS)
      ),
    ]);
    const contradictions = (result.contradictions ?? []).filter(Boolean).slice(0, 8);
    if (contradictions.length === 0) return state;
    const notes = ["## Verification notes", ...contradictions.map((c) => `- ${c}`)].join("\n");
    const appendix = `\n\n${notes}\n`;
    emitAnalysisToken(state, appendix);
    return {
      ...state,
      auditReport: {
        findingsChanged: state.auditReport?.findingsChanged ?? [],
        assessmentsChanged: state.auditReport?.assessmentsChanged ?? [],
        contradictions,
        notes: [...(state.auditReport?.notes ?? []), "LLM verifier appended verification notes."],
      },
      renderedOutput: `${state.renderedOutput.trim()}${appendix}`,
    };
  } catch (err) {
    pacLog("audit verifier skipped", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return state;
  }
}
