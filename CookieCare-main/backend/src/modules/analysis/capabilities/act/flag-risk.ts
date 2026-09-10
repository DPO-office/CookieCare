import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import type { FindingPerspective, FindingPolarity } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById, mergeSkillRiskCategories } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import { insufficient, stampFindingsByCapability, compileAuthoredRegex } from "./act-utils.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import { buildSectionCandidates } from "./select-candidates.js";
import { canonicalRequirementId } from "../../shared/requirement-identity.js";
import { pacLog } from "../../utils/pac-log.js";
import { normalizePartyPerspective } from "../../shared/finding-semantics.js";

async function flagRisk(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  // Document-first, open-vocabulary risk discovery (flagged). The closed-
  // taxonomy path below pre-decides which risk categories to look for at PLAN
  // time and crams every clause into one prompt; the open path instead reads
  // the whole document as sections and lets the model surface the risks that
  // are actually in the text — general purpose, no authored risk catalogue
  // required. Already stamps its own requirementId, so it bypasses the
  // category-based capability stamp.
  if (process.env.ANALYSIS_OPEN_RISK === "1") {
    return flagRiskOpen(state, unit, findings);
  }
  const result = await _flagRiskImpl(state, unit, findings);
  return {
    state: result.state,
    findings: stampFindingsByCapability(unit, findings, result.findings, (f) => [
      f.category,
    ]),
  };
}

interface OpenRisk {
  ref: string;
  title: string;
  explanation: string;
  severity: "low" | "medium" | "high";
  quote: string;
  polarity: Extract<FindingPolarity, "risk_present" | "control_present">;
  partyPerspective?: FindingPerspective;
}

const OPEN_RISK_SYSTEM = [
  "You are a contract risk analyst reviewing a document for the party who asked the question.",
  "Read the supplied clauses and surface the MATERIAL risks that actually arise from the text — the provisions a careful lawyer would flag on this specific document.",
  "For each item return: the clause ref, a short specific title, a plain-English explanation, severity (low/medium/high), polarity, partyPerspective, and the VERBATIM triggering quote.",
  "Use polarity=risk_present only when the quoted text creates adverse exposure. Use polarity=control_present when the text is a safeguard, restriction, or obligation that mitigates exposure; never relabel a protective control as a risk merely because it mentions a risky topic.",
  "risk_present requires a concrete adverse effect on the reviewing party stated in the explanation. If the explanation merely restates a safeguard or a duty imposed on the counterparty, classify it as control_present.",
  "Only genuine, material, text-grounded risks. Do not pad with generic boilerplate, do not invent, and never include a risk you cannot ground in a verbatim quote from the supplied text. Order by severity, most serious first. Aim for the 5–12 risks that matter, not an exhaustive list.",
].join(" ");

function riskCategorySlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "other_known_risk";
}

async function discoverOpenRisks(
  state: AnalysisState,
  instruction: string,
  sections: ReturnType<typeof buildSectionCandidates>
): Promise<OpenRisk[]> {
  if (sections.length === 0) return [];
  const clauseLines = sections
    .map(
      (s) =>
        `${s.ref} [${s.clauseType}${s.structuralPath ? ` · ${s.structuralPath}` : ""}] ${s.quotedText}`
    )
    .join("\n");
  const prompt = [
    `User question: ${instruction.slice(0, 400)}`,
    "",
    "Clauses (cite `ref` only from this list):",
    clauseLines,
  ].join("\n");
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        ref: { type: "string", enum: sections.map((s) => s.ref) },
        title: { type: "string" },
        explanation: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        quote: { type: "string" },
        polarity: { type: "string", enum: ["risk_present", "control_present"] },
        partyPerspective: {
          type: "string",
          enum: ["customer", "supplier", "controller", "processor", "mutual", "unspecified"],
        },
      },
      required: ["ref", "title", "explanation", "severity", "quote", "polarity", "partyPerspective"],
    },
  };
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  try {
    const out = await executeJsonCompletion<OpenRisk[]>(
      prompt,
      OPEN_RISK_SYSTEM,
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
    if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
    return Array.isArray(out) ? out : [];
  } catch (err) {
    console.warn("[flagRiskOpen] discovery failed:", err);
    return [];
  }
}

async function flagRiskOpen(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? ["_global"];
  const reqId = Array.isArray(unit.input.requirementIds)
    ? String((unit.input.requirementIds as string[])[0] ?? "")
    : "";
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for risk flag`)],
    };
  }

  const sections = buildSectionCandidates(doc);
  const started = Date.now();
  const risks = await discoverOpenRisks(state, instruction, sections);
  const byRef = new Map(sections.map((s) => [s.ref, s]));

  const riskFindings: Finding[] = [];
  const seen = new Set<string>();
  risks.forEach((r, i) => {
    const sec = byRef.get(r.ref);
    if (!sec || !r.quote?.trim()) return;
    // Verbatim-quote gate — same discipline as the compliance VERIFY path.
    if (!sec.quotedText.toLowerCase().includes(r.quote.toLowerCase().slice(0, 80))) return;
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    riskFindings.push({
      findingId: `f_risk_open_${unit.workUnitId}_${i}`,
      kind: "risk",
      category: riskCategorySlug(r.title),
      status: "present",
      claim: r.explanation?.trim() || r.title.trim(),
      evidence: [
        {
          locator: {
            docId,
            structuralPath: sec.structuralPath,
            charRange: sec.charRange,
          },
          quotedText: r.quote,
          sourceRole: "target",
        },
      ],
      severity: r.severity,
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId: skillIds[0],
      visibility: "user_facing",
      // Preserve the PLAN lane boundary. Related checks may be useful context,
      // but they must not be promoted into the primary risk verdict/report.
      relatedNotRequested: unit.input.relatedNotRequested === true || undefined,
      requirementId: reqId ? canonicalRequirementId(reqId) : undefined,
      polarity: r.polarity,
      partyPerspective:
        r.partyPerspective ?? normalizePartyPerspective(state.intent?.partyPerspective),
    });
  });

  pacLog("[VERIFY] open risk discovery", {
    docId,
    sections: sections.length,
    proposed: risks.length,
    kept: riskFindings.length,
    ms: Date.now() - started,
  });

  return { state, findings: [...findings, ...riskFindings] };
}

async function _flagRiskImpl(
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
        polarity: { type: "string", enum: ["risk_present", "control_present"] },
        partyPerspective: {
          type: "string",
          enum: ["customer", "supplier", "controller", "processor", "mutual", "unspecified"],
        },
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
    polarity?: Extract<FindingPolarity, "risk_present" | "control_present">;
    partyPerspective?: FindingPerspective;
  }> = [];

  try {
    raw = await executeJsonCompletion(
      [
        "Flag contractual risks against the closed risk taxonomy for the active analysis skill.",
        `User instruction: ${instruction}`,
        unit.input.previousAttemptFeedback
          ? String(unit.input.previousAttemptFeedback)
          : "",
        comparativeGuidance
          ? `Jurisdiction comparative check (${comparativeCheckId}):\n${comparativeGuidance}`
          : "",
        `Allowed categories:\n${riskCats.map((r) => `- ${r.category}: ${r.guidance}`).join("\n")}`,
        skillMdOneSection
          ? `Authored risk section (one section only):\n${skillMdOneSection}`
          : "",
        "Every finding must include quotedText copied VERBATIM from the clause - the specific triggering language, not a paraphrase of the concern.",
        "For each item set polarity=risk_present only for adverse exposure, or polarity=control_present when the quote is a safeguard/restriction/obligation that mitigates exposure. A control is not a risk merely because it discusses a risky topic.",
        "risk_present requires a concrete adverse effect on the reviewing party stated in the claim. If the claim merely restates a safeguard or a duty imposed on the counterparty, classify it as control_present.",
        `Reviewing-party perspective: ${state.intent?.partyPerspective ?? "unspecified"}.`,
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
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
  } catch (err) {
    console.warn("[flagRisk] LLM failed; heuristic risks:", err);
    raw = heuristicRisks(clauses, riskCats.filter((cat) => allowed.has(cat.category)));
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
      polarity: r.polarity ?? "risk_present",
      partyPerspective:
        r.partyPerspective ?? normalizePartyPerspective(state.intent?.partyPerspective),
    });
  }

  const collapsed = collapseRisksByCategory(riskFindings);
  const silenceRisks = evaluateSilencePatterns(
    unit,
    clauses,
    riskCats,
    allowed,
    primarySkillId,
    collapsed
  );

  return {
    state,
    findings: [
      ...findings,
      ...collapsed,
      ...silenceRisks,
      ...orgPlaybookRisks(state, unit, clauses, findings),
    ],
  };
}

/** One finding per risk category — same gap on five clauses is still one conclusion. */
export function collapseRisksByCategory(findings: Finding[]): Finding[] {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.category}:${finding.polarity ?? "risk_present"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }
  const severityRank = { high: 3, medium: 2, low: 1 } as const;
  return [...grouped.values()].map((group) => {
    const selected = [...group].sort(
      (a, b) =>
        (severityRank[b.severity ?? "low"] ?? 0) -
        (severityRank[a.severity ?? "low"] ?? 0)
    )[0]!;
    const evidence = group
      .flatMap((finding) => finding.evidence)
      .filter(
        (candidate, index, all) =>
          all.findIndex(
            (item) =>
              item.locator.docId === candidate.locator.docId &&
              item.locator.structuralPath === candidate.locator.structuralPath &&
              item.quotedText === candidate.quotedText
          ) === index
      );
    return { ...selected, evidence };
  });
}

/**
 * Run every authored silencePattern on the active risk categories.
 * A finding fires when a trigger clause exists and none of those clauses
 * satisfy the authored satisfyRegex.
 */
export function evaluateSilencePatterns(
  unit: AnalysisWorkUnit,
  clauses: ClauseObject[],
  riskCats: Array<{
    category: string;
    silencePattern?: {
      triggerClauseTypes?: string[];
      triggerRegex?: string;
      satisfyRegex: string;
      claim: string;
      severity: "low" | "medium" | "high";
    };
  }>,
  allowed: Set<string>,
  skillId: string | undefined,
  existing: Finding[]
): Finding[] {
  const out: Finding[] = [];
  for (const cat of riskCats) {
    const pattern = cat.silencePattern;
    if (!pattern || !allowed.has(cat.category)) continue;
    if (existing.some((finding) => finding.category === cat.category)) continue;
    const evidenceClause = findSilenceEvidence(clauses, pattern);
    if (!evidenceClause) continue;
    out.push({
      findingId: `f_risk_${unit.workUnitId}_silence_${cat.category}`,
      kind: "risk",
      category: cat.category,
      status: "absent_expected",
      claim: pattern.claim,
      evidence: [
        {
          locator: evidenceClause.locator,
          quotedText: evidenceClause.text.slice(0, 400),
          sourceRole: "target",
        },
      ],
      severity: pattern.severity,
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
      ruleSourceTier: "B",
      polarity: "risk_present",
    });
  }
  return out;
}

export function findSilenceEvidence(
  clauses: ClauseObject[],
  pattern: {
    triggerClauseTypes?: string[];
    triggerRegex?: string;
    satisfyRegex: string;
  }
): ClauseObject | null {
  const triggerRe = compileAuthoredRegex(pattern.triggerRegex);
  const types = pattern.triggerClauseTypes ?? [];
  const candidates = clauses.filter((clause) => {
    if (types.includes(clause.clauseType)) return true;
    return triggerRe ? triggerRe.test(clause.text) : false;
  });
  if (candidates.length === 0) return null;
  const satisfyRe = compileAuthoredRegex(pattern.satisfyRegex);
  if (satisfyRe && candidates.some((clause) => satisfyRe.test(clause.text))) {
    return null;
  }
  return candidates[0];
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
      polarity: "risk_present",
    });
  }
  return out;
}

export function heuristicRisks(
  clauses: ClauseObject[],
  riskCats: Array<{
    category: string;
    heuristic?: Array<{
      clauseType?: string;
      regex: string;
      excludeRegex?: string;
      claim: string;
      severity: "low" | "medium" | "high";
      quoteLen?: number;
    }>;
  }>
): Array<{
  clauseId: string;
  category: string;
  claim: string;
  severity: "low" | "medium" | "high";
  quotedText: string;
}> {
  const out: ReturnType<typeof heuristicRisks> = [];
  for (const cat of riskCats) {
    for (const rule of cat.heuristic ?? []) {
      const re = compileAuthoredRegex(rule.regex);
      if (!re) continue;
      const exclude = compileAuthoredRegex(rule.excludeRegex);
      for (const c of clauses) {
        if (rule.clauseType && c.clauseType !== rule.clauseType) continue;
        if (!re.test(c.text)) continue;
        if (exclude && exclude.test(c.text)) continue;
        out.push({
          clauseId: c.clauseId,
          category: cat.category,
          claim: rule.claim,
          severity: rule.severity,
          quotedText: c.text.slice(0, rule.quoteLen ?? 300),
        });
      }
    }
  }
  return out;
}

export { flagRisk };
