import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import type { AnalyticalSynthesis } from "../../models/analytical-synthesis.js";
import {
  ANALYTICAL_SYNTHESIS_SYSTEM_PROMPT,
  buildAnalyticalSynthesisUserPrompt,
  deterministicFactRollup,
} from "../../prompts/analytical-synthesis.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import { pacLog } from "../../utils/pac-log.js";

const SCHEMA = {
  type: "object",
  properties: {
    overallAssessment: { type: "string" },
    keyThemes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          citedRequirementIds: { type: "array", items: { type: "string" } },
          analysis: { type: "string" },
        },
        required: ["title", "citedRequirementIds", "analysis"],
      },
    },
    substantiveVsDrafting: { type: "string" },
    materialRisks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string" },
          whyItMatters: { type: "string" },
        },
        required: ["requirementId", "whyItMatters"],
      },
    },
    residualUncertainty: { type: "string" },
    citedRequirementIds: { type: "array", items: { type: "string" } },
  },
  required: [
    "overallAssessment",
    "keyThemes",
    "substantiveVsDrafting",
    "materialRisks",
    "residualUncertainty",
    "citedRequirementIds",
  ],
};

export function legalFrameworkSummary(state: AnalysisState): string {
  const intent = state.intent;
  const standard =
    intent?.standardConcept ||
    (intent?.standard && intent.standard !== "none" ? intent.standard : "");
  const skills = (state.activeSkills ?? [])
    .map((s) => s.label)
    .filter(Boolean)
    .slice(0, 4);
  const lines = [
    standard ? `Named standard: ${standard}` : "",
    skills.length ? `Active skills: ${skills.join("; ")}` : "",
  ].filter(Boolean);
  return lines.length > 0
    ? lines.join("\n")
    : "Infer the framework from the user request and locked findings only.";
}

function guardSynthesis(
  raw: AnalyticalSynthesis,
  assessments: RequirementAssessment[],
  factRollup: string
): AnalyticalSynthesis {
  const allowed = new Set(assessments.map((row) => row.requirementId));
  const riskEligible = new Set(
    assessments
      .filter((row) => {
        const c = row.judgement?.compliance;
        return c === "partial" || c === "gap" || c === "insufficient_evidence";
      })
      .map((row) => row.requirementId)
  );
  const cited = (raw.citedRequirementIds ?? []).filter((id) => allowed.has(id));
  const themes = (raw.keyThemes ?? [])
    .map((theme) => ({
      ...theme,
      citedRequirementIds: (theme.citedRequirementIds ?? []).filter((id) =>
        allowed.has(id)
      ),
    }))
    .filter((theme) => theme.citedRequirementIds.length > 0 || theme.analysis.trim());
  const materialRisks = (raw.materialRisks ?? []).filter((risk) =>
    riskEligible.has(risk.requirementId)
  );
  for (const theme of themes) {
    cited.push(...theme.citedRequirementIds);
  }
  for (const risk of materialRisks) cited.push(risk.requirementId);
  return {
    overallAssessment: String(raw.overallAssessment ?? "").trim(),
    keyThemes: themes.slice(0, 8),
    substantiveVsDrafting: String(raw.substantiveVsDrafting ?? "").trim(),
    materialRisks: materialRisks.slice(0, 8),
    residualUncertainty: String(raw.residualUncertainty ?? "").trim(),
    citedRequirementIds: [...new Set(cited)],
    factRollup,
  };
}

function fallbackSynthesis(
  assessments: RequirementAssessment[],
  factRollup: string
): AnalyticalSynthesis {
  const residual = assessments.filter((row) => {
    const c = row.judgement?.compliance;
    return c === "partial" || c === "gap" || c === "insufficient_evidence";
  });
  return {
    overallAssessment: factRollup,
    keyThemes: residual.slice(0, 6).map((row) => ({
      title: row.requirementId,
      citedRequirementIds: [row.requirementId],
      analysis: row.summary,
    })),
    substantiveVsDrafting:
      residual.length === 0
        ? "The locked findings do not distinguish a residual drafting issue from a substantive gap."
        : "Residual items are taken from locked judgements only.",
    materialRisks: residual.map((row) => ({
      requirementId: row.requirementId,
      whyItMatters: row.summary,
    })),
    residualUncertainty: assessments
      .filter(
        (row) =>
          row.judgement?.compliance === "insufficient_evidence" ||
          row.judgement?.evidenceState === "truncated" ||
          row.judgement?.evidenceState === "incorporated"
      )
      .map((row) => row.summary)
      .join(" ") || "No residual evidence uncertainty on the locked rows.",
    citedRequirementIds: assessments.map((row) => row.requirementId),
    factRollup,
  };
}

export async function runAnalyticalSynthesis(
  state: AnalysisState,
  assessments: RequirementAssessment[]
): Promise<AnalyticalSynthesis> {
  const factRollup = deterministicFactRollup(assessments);
  if (assessments.length === 0) {
    return fallbackSynthesis(assessments, factRollup);
  }
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const started = Date.now();
  try {
    const raw = await executeJsonCompletion<AnalyticalSynthesis>(
      buildAnalyticalSynthesisUserPrompt({
        instruction: state.request.instruction,
        legalFramework: legalFrameworkSummary(state),
        factRollup,
        rows: assessments,
      }),
      ANALYTICAL_SYNTHESIS_SYSTEM_PROMPT,
      SCHEMA,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      {
        tracker,
        thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON),
        maxOutputTokens: 1200,
      }
    );
    if (tracker && state.agent) state.agent.tokensUsed = tracker.tokensUsed;
    pacLog("analytical_synthesis", { ms: Date.now() - started, rows: assessments.length });
    return guardSynthesis(raw, assessments, factRollup);
  } catch (err) {
    pacLog("analytical_synthesis fallback", {
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackSynthesis(assessments, factRollup);
  }
}
