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
import { loadSkillMdSection } from "../../skills/load-skill-md.js";
import { insufficient } from "./act-utils.js";

async function flagRisk(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? ["_global"];
  const focusIds = (unit.input.riskCategoryIds as string[] | undefined) ?? state.plan?.focus?.riskCategoryIds;
  const relatedNotRequested = unit.input.relatedNotRequested === true;
  const comparativeGuidance = unit.input.comparativeGuidance
    ? String(unit.input.comparativeGuidance)
    : "";
  const comparativeCheckId = unit.input.comparativeCheckId
    ? String(unit.input.comparativeCheckId)
    : "";
  const clauseTypesFocus = (unit.input.clauseTypesFocus as string[] | undefined) ?? [];

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  let clauses = doc?.clauses ?? [];
  if (clauseTypesFocus.length) {
    const focused = clauses.filter((c) => clauseTypesFocus.includes(c.clauseType));
    if (focused.length) clauses = focused;
  }

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

  const riskSections: string[] = [];
  for (const cat of riskCats.slice(0, 12)) {
    for (const skill of skills) {
      const section = await loadSkillMdSection(skill.skillId, `risk:${cat.category}`);
      if (section) {
        riskSections.push(`### risk:${cat.category}\n${section.slice(0, 800)}`);
        break;
      }
    }
  }
  const skillMdOneSection = riskSections[0] ?? "";

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
        comparativeGuidance
          ? `Jurisdiction comparative check (${comparativeCheckId}):\n${comparativeGuidance}`
          : "",
        `Allowed categories:\n${riskCats.map((r) => `- ${r.category}: ${r.guidance}`).join("\n")}`,
        skillMdOneSection
          ? `Authored risk section (one section only):\n${skillMdOneSection}`
          : "",
        "Every finding must include quotedText copied VERBATIM from the clause — the specific triggering language, not a paraphrase of the concern.",
        "If you cannot quote triggering language from a clause, omit that finding.",
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

  const riskFindings: Finding[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const clause = byId.get(r.clauseId);
    if (!clause) continue;
    const quoteOk =
      Boolean(r.quotedText) &&
      clause.text.toLowerCase().includes(r.quotedText.toLowerCase().slice(0, 80));
    if (!quoteOk) {
      // Reject findings whose quote is not in the clause (avoid CRITIQUE churn).
      continue;
    }
    const category = allowed.has(r.category) ? r.category : "other_known_risk";
    const evidence: EvidenceSpan[] = [
      { locator: clause.locator, quotedText: r.quotedText, sourceRole: "target" },
    ];
    riskFindings.push({
      findingId: `f_risk_${unit.workUnitId}_${i}`,
      kind: "risk",
      category,
      status: "present",
      claim: r.claim,
      evidence,
      severity: r.severity,
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId: primarySkillId,
      visibility: "user_facing",
      relatedNotRequested: relatedNotRequested || undefined,
      ruleSourceTier: comparativeCheckId ? "B" : undefined,
    });
  }

  const costSilence = costAllocationSilenceFinding(
    unit,
    clauses,
    allowed,
    primarySkillId,
    riskFindings
  );
  if (costSilence) riskFindings.push(costSilence);

  return {
    state,
    findings: [...findings, ...riskFindings, ...orgPlaybookRisks(state, unit, clauses, findings)],
  };
}

function costAllocationSilenceFinding(
  unit: AnalysisWorkUnit,
  clauses: ClauseObject[],
  allowed: Set<string>,
  skillId: string | undefined,
  existing: Finding[]
): Finding | null {
  const category = "cost_allocation_silent";
  if (!allowed.has(category) || existing.some((finding) => finding.category === category)) {
    return null;
  }

  const evidenceClause = findAssistanceClauseWithSilentCost(clauses);
  if (!evidenceClause) return null;

  return {
    findingId: `f_risk_${unit.workUnitId}_cost-allocation-silent`,
    kind: "risk",
    category,
    status: "absent_expected",
    claim:
      "The agreement creates a data-subject-rights assistance duty but does not allocate the cost of providing that assistance.",
    evidence: [
      {
        locator: evidenceClause.locator,
        quotedText: evidenceClause.text.slice(0, 400),
        sourceRole: "target",
      },
    ],
    severity: "medium",
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility: "user_facing",
    ruleSourceTier: "B",
  };
}

export function findAssistanceClauseWithSilentCost(
  clauses: ClauseObject[]
): ClauseObject | null {
  const assistanceClauses = clauses.filter(
    (clause) =>
      clause.clauseType === "processor_assistance_obligation" ||
      clause.clauseType === "data_subject_request_handling" ||
      /\bassist(?:ance|s|ing)?\b[\s\S]{0,180}\b(data subject|chapter iii|controller)\b/i.test(
        clause.text
      )
  );
  if (assistanceClauses.length === 0) return null;

  const allocatesCost = assistanceClauses.some((clause) =>
    /\b(costs?|fees?|charges?|expenses?|rates?|no additional charge|at no charge)\b/i.test(
      clause.text
    )
  );
  if (allocatesCost) return null;
  return assistanceClauses[0];
}

function orgPlaybookRisks(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  clauses: ClauseObject[],
  existing: Finding[]
): Finding[] {
  if (unit.input.relatedNotRequested === true) return [];
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const overrides = state.orgMemory?.playbookOverrides ?? [];
  const out: Finding[] = [];
  for (const rule of overrides) {
    if (existing.some((f) => f.orgPlaybook && f.orgPlaybookNote === rule.overrideNote)) {
      continue;
    }
    if (rule.appliesToSkillIds.length && !rule.appliesToSkillIds.some((id) => skillIds.includes(id))) {
      continue;
    }
    const clause = clauses.find((c) => c.clauseType === rule.clauseType);
    out.push({
      findingId: `f_org_risk_${rule.ruleId}_${unit.workUnitId}`,
      kind: "risk",
      category: "other_known_risk",
      status: clause ? "present" : "absent_expected",
      claim: `Org playbook: ${rule.overrideNote}`,
      evidence: clause
        ? [{ locator: clause.locator, quotedText: clause.text.slice(0, 400), sourceRole: "target" }]
        : [],
      severity: rule.overrideSeverity ?? "medium",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      visibility: "user_facing",
      orgPlaybook: true,
      orgPlaybookNote: rule.overrideNote,
    });
  }
  return out;
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
