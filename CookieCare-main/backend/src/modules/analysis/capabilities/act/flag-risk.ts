import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById, mergeSkillRiskCategories } from "../../skills/registry.js";
import { insufficient } from "./act-utils.js";

async function flagRisk(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? ["general-review"];
  const focusIds = (unit.input.riskCategoryIds as string[] | undefined) ?? state.plan?.focus?.riskCategoryIds;

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];

  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for risk flag`)],
    };
  }

  if (clauses.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        {
          findingId: `f_risk_empty_${unit.workUnitId}`,
          kind: "risk",
          category: "other_known_risk",
          status: "insufficient_evidence",
          claim: "Cannot flag clause-level risks because no clauses were extracted.",
          evidence: [],
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
          visibility: "user_facing",
        },
      ],
    };
  }

  const skills = skillIds.map((id) => getSkillById(id)).filter(Boolean) as NonNullable<
    ReturnType<typeof getSkillById>
  >[];
  const merged = mergeSkillRiskCategories(skills);
  const scoped =
    focusIds?.length ? merged.filter((r) => focusIds.includes(r.category)) : merged;
  const riskCats = scoped.length > 0 ? scoped : merged;
  const allowed = new Set(riskCats.map((r) => r.category));
  allowed.add("other_known_risk");
  const riskIds = [...allowed];
  const skillMd = skills
    .map((s) => state.skillMarkdown?.[s.skillId] ?? "")
    .join("\n")
    .slice(0, 5000);

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseId: { type: "string" },
        category: { type: "string", enum: riskIds },
        claim: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        quotedText: { type: "string" },
      },
      required: ["clauseId", "category", "claim", "severity", "quotedText"],
    },
  };

  let raw: Array<{
    clauseId: string;
    category: string;
    claim: string;
    severity: "low" | "medium" | "high";
    quotedText: string;
  }> = [];

  try {
    raw = await executeJsonCompletion(
      [
        "Flag contractual risks against the closed risk taxonomy for the active analysis skill.",
        `User instruction: ${instruction}`,
        `Allowed categories:\n${riskCats.map((r) => `- ${r.category}: ${r.guidance}`).join("\n")}`,
        skillMd ? `Skill narrative (context only):\n${skillMd}` : "",
        "Every finding must include quotedText copied VERBATIM from the clause.",
        `Clauses:\n${JSON.stringify(
          clauses.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 2000),
          }))
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      "You are a risk flagger. Never invent taxonomy categories. Focus on the user instruction.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[flagRisk] LLM failed; heuristic risks:", err);
    raw = heuristicRisks(clauses, [...allowed]);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const byId = new Map(clauses.map((c) => [c.clauseId, c]));
  const primarySkillId = skillIds[0];

  const riskFindings: Finding[] = raw.map((r, i) => {
    const clause = byId.get(r.clauseId);
    const category = allowed.has(r.category) ? r.category : "other_known_risk";
    const evidence: EvidenceSpan[] = [];
    if (clause) {
      const quote =
        r.quotedText && clause.text.includes(r.quotedText)
          ? r.quotedText
          : clause.text.slice(0, 400);
      evidence.push({ locator: clause.locator, quotedText: quote });
    }
    return {
      findingId: `f_risk_${unit.workUnitId}_${i}`,
      kind: "risk" as const,
      category,
      status: "present" as const,
      claim: r.claim,
      evidence,
      severity: r.severity,
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId: primarySkillId,
      visibility: "user_facing" as const,
    };
  });

  return { state, findings: [...findings, ...riskFindings] };
}

function heuristicRisks(
  clauses: ClauseObject[],
  allowedCategories: string[]
): Array<{
  clauseId: string;
  category: string;
  claim: string;
  severity: "low" | "medium" | "high";
  quotedText: string;
}> {
  const out: ReturnType<typeof heuristicRisks> = [];
  for (const c of clauses) {
    if (
      c.clauseType === "limitation_of_liability" &&
      /unlimited|without limit/i.test(c.text) &&
      allowedCategories.includes("uncapped_liability")
    ) {
      out.push({
        clauseId: c.clauseId,
        category: "uncapped_liability",
        claim: "Limitation of liability appears uncapped or effectively unlimited.",
        severity: "high",
        quotedText: c.text.slice(0, 300),
      });
    }
    if (
      c.clauseType === "indemnity" &&
      /customer shall indemnify|you shall indemnify/i.test(c.text) &&
      allowedCategories.includes("one_sided_indemnity")
    ) {
      out.push({
        clauseId: c.clauseId,
        category: "one_sided_indemnity",
        claim: "Indemnity appears one-sided against the customer.",
        severity: "medium",
        quotedText: c.text.slice(0, 300),
      });
    }
    if (
      /data subject (request|right)/i.test(c.text) &&
      !/\b(access|erasure|rectification|portability|article 1[5-9]|article 2[0-2])\b/i.test(c.text) &&
      allowedCategories.includes("dsr_generic_no_named_rights")
    ) {
      out.push({
        clauseId: c.clauseId,
        category: "dsr_generic_no_named_rights",
        claim: "Data-subject request language is generic and does not name Chapter III rights.",
        severity: "medium",
        quotedText: c.text.slice(0, 300),
      });
    }
  }
  return out;
}

export { flagRisk };
