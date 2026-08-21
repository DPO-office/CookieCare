import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { SkillRegimeRule } from "../../skills/runtime/catalog/types.js";
import type { RuleSource } from "../../models/rule-source.js";
import { tierFor } from "../../models/rule-source.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import { insufficient, stampRequirementIdsOnNewFindings, compileAuthoredRegex, interpolateMatch } from "./act-utils.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";

export function resolveRule(skillIds: string[], ruleId: string) {
  for (const id of skillIds) {
    const skill = getSkillById(id);
    const rule = skill?.regimeRules.find((r) => r.ruleId === ruleId);
    if (rule) return { rule, skillId: skill!.skillId, skillVersion: skill!.version };
  }
  return null;
}

/**
 * When unit.input.playbookPositionIndex is set, bind RuleSource from cached positions.
 * Returns "skip" if index is past extracted length (empty slot — no finding).
 */
function resolvePlaybookSlot(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): AnalysisWorkUnit | "skip" | null {
  if (unit.input.playbookPositionIndex === undefined || unit.input.playbookPositionIndex === null) {
    return null;
  }
  const index = Number(unit.input.playbookPositionIndex);
  const referenceDocId = String(unit.input.referenceDocId ?? "");
  const refDoc = state.workspace.documents.find((d) => d.docId === referenceDocId);
  const positions = refDoc?.playbookPositions ?? [];
  if (!Number.isFinite(index) || index < 0 || index >= positions.length) {
    return "skip";
  }
  const pos = positions[index];
  const ruleSource: RuleSource = {
    kind: "playbook_derived",
    positionId: pos.positionId,
    sourceDocId: referenceDocId,
    requirementText: pos.requirementText,
    sourceLocator: pos.sourceLocator,
    clauseType: pos.clauseType,
    severityIfViolated: pos.severityIfViolated,
  };
  return {
    ...unit,
    input: {
      ...unit.input,
      ruleSource,
    },
  };
}

function parseRuleSource(
  unit: AnalysisWorkUnit,
  skillIds: string[]
): { source: RuleSource; rule?: SkillRegimeRule } | { error: string } {
  const raw = unit.input.ruleSource as RuleSource | undefined;
  if (raw && typeof raw === "object" && "kind" in raw) {
    if (raw.kind === "authored") {
      const resolved = resolveRule(skillIds, raw.ruleId);
      if (!resolved) return { error: `Rule ${raw.ruleId} not found in active skill configuration` };
      return {
        source: {
          ...raw,
          skillId: resolved.skillId,
          ruleVersion: resolved.skillVersion,
          findingCategory: resolved.rule.findingCategory,
        },
        rule: resolved.rule,
      };
    }
    return { source: raw };
  }

  const ruleId = String(unit.input.ruleId ?? "");
  if (!ruleId) return { error: "No ruleId or ruleSource on work unit" };
  const resolved = resolveRule(skillIds, ruleId);
  if (!resolved) return { error: `Rule ${ruleId} not found in active skill configuration` };
  return {
    source: {
      kind: "authored",
      ruleId,
      skillId: resolved.skillId,
      ruleVersion: resolved.skillVersion,
      findingCategory: resolved.rule.findingCategory,
    },
    rule: resolved.rule,
  };
}

async function resolveRuleText(
  source: RuleSource,
  authoredRule?: SkillRegimeRule
): Promise<{ ruleText: string; legalHook?: string; label?: string }> {
  switch (source.kind) {
    case "authored": {
      const section = await loadSkillMdSection(source.skillId, `rule:${source.ruleId}`);
      return {
        ruleText: authoredRule?.ruleText ?? "",
        legalHook: authoredRule?.legalHook ?? section ?? undefined,
        label: authoredRule?.label,
      };
    }
    case "playbook_derived":
      return { ruleText: source.requirementText };
    case "web_derived":
      return {
        ruleText: source.retrievedText,
        legalHook: `Source: ${source.sourceUrl} (retrieved ${source.retrievedAt})`,
      };
  }
}

/**
 * Evaluate target clauses against a RuleSource (authored / playbook / web).
 * Same LLM judgment; only the source of rule text changes.
 *
 * Playbook slot units pass `playbookPositionIndex` — resolved from cached positions
 * so the PLAN graph stays fixed-size without inventing tools at runtime.
 */
async function checkAgainstRule(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const result = await _checkAgainstRuleImpl(state, unit, findings);
  return {
    state: result.state,
    findings: stampRequirementIdsOnNewFindings(unit, findings, result.findings),
  };
}

async function _checkAgainstRuleImpl(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const hasFocus = Boolean(state.plan?.focus);

  const slotUnit = resolvePlaybookSlot(state, unit);
  if (slotUnit === "skip") {
    return { state, findings };
  }
  if (slotUnit) {
    unit = slotUnit;
  }

  const parsed = parseRuleSource(unit, skillIds);
  if ("error" in parsed) {
    return { state, findings: [...findings, insufficient(unit, parsed.error)] };
  }
  const { source, rule } = parsed;
  const tier = tierFor(source.kind);

  const { ruleText, legalHook, label } = await resolveRuleText(source, rule);
  if (!ruleText.trim()) {
    return {
      state,
      findings: [...findings, insufficient(unit, "Rule text empty for RuleSource")],
    };
  }

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for rule check`)],
    };
  }

  const appliesTo =
    source.kind === "playbook_derived" && source.clauseType
      ? [source.clauseType]
      : rule?.appliesToClauseTypes;

  const applicable = (doc.clauses ?? []).filter(
    (c) => !appliesTo?.length || appliesTo.includes(c.clauseType) || appliesTo.includes("uncategorized")
  );

  const ruleKey =
    source.kind === "authored"
      ? source.ruleId
      : source.kind === "playbook_derived"
        ? source.positionId
        : source.query;

  if (applicable.length === 0) {
    const playbookEvidence: EvidenceSpan[] =
      source.kind === "playbook_derived"
        ? [
            {
              locator: source.sourceLocator,
              quotedText: source.requirementText.slice(0, 400),
              sourceRole: "reference",
            },
          ]
        : [];
    return {
      state,
      findings: mergeFindings(findings, [
        {
          findingId: `f_rule_noclause_${ruleKey}_${unit.workUnitId}`,
          kind: "compliance",
          category:
            source.kind === "authored"
              ? source.findingCategory
              : source.kind === "playbook_derived"
                ? `playbook.${source.positionId}.gap`
                : `web.${slugCategory(source.query)}.unverified`,
          status: "insufficient_evidence",
          claim: label
            ? `No relevant clause text was available to evaluate ${label.toLowerCase()}.`
            : "No relevant clause text was available to evaluate this obligation.",
          evidence: playbookEvidence,
          ruleId: source.kind === "authored" ? source.ruleId : undefined,
          ruleVersion: source.kind === "authored" ? source.ruleVersion : undefined,
          severity: source.kind === "playbook_derived" ? source.severityIfViolated ?? "medium" : "medium",
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
          skillId: source.kind === "authored" ? source.skillId : undefined,
          visibility: "user_facing",
          ruleSourceTier: tier,
          playbookPositionId:
            source.kind === "playbook_derived" ? source.positionId : undefined,
          unverified: source.kind === "web_derived" || undefined,
          sourceUrl: source.kind === "web_derived" ? source.sourceUrl : undefined,
          retrievedAt: source.kind === "web_derived" ? source.retrievedAt : undefined,
        },
      ]),
    };
  }

  if (source.kind === "authored" && rule?.checkType === "pattern_then_llm_judgment") {
    const patternFinding = runMechanicalScan(
      unit,
      rule,
      applicable,
      source.skillId,
      source.ruleVersion
    );
    if (patternFinding) {
      patternFinding.ruleSourceTier = "B";
      if (patternFinding.status !== "present") {
        return { state, findings: mergeFindings(findings, [patternFinding]) };
      }
      const judged = await judgeByScope({
        state,
        unit,
        source,
        ruleScope: rule.ruleScope,
        ruleText,
        legalHook,
        label,
        applicable,
        instruction,
        hasFocus,
        checkType: rule.checkType,
      });
      return {
        state,
        findings: mergeFindings(
          findings,
          judged.length > 0 ? judged : [patternFinding]
        ),
      };
    }
  }

  const judged = await judgeByScope({
    state,
    unit,
    source,
    ruleScope: rule?.ruleScope ?? "per_document",
    ruleText,
    legalHook,
    label,
    applicable,
    instruction,
    hasFocus,
    checkType: rule?.checkType,
  });
  return { state, findings: mergeFindings(findings, judged) };
}

/**
 * Generic mechanical pre-scan driven entirely by `rule.mechanicalScan`.
 * Returns null when the rule did not opt in.
 */
export function runMechanicalScan(
  unit: AnalysisWorkUnit,
  rule: SkillRegimeRule,
  clauses: ClauseObject[],
  skillId: string,
  skillVersion: string
): Finding | null {
  const scan = rule.mechanicalScan;
  if (!scan || scan.kind !== "numeric_pattern_expected") return null;

  const numericRe = compileAuthoredRegex(scan.pattern);
  const vagueRe = compileAuthoredRegex(scan.vaguePattern);
  let hit: { kind: "numeric" | "vague" | "absent"; quote?: string; clause?: ClauseObject } = {
    kind: "absent",
  };
  if (numericRe) {
    for (const c of clauses) {
      const numeric = c.text.match(numericRe);
      if (numeric) {
        hit = { kind: "numeric", quote: numeric[0], clause: c };
        break;
      }
    }
  }
  if (hit.kind === "absent" && vagueRe) {
    for (const c of clauses) {
      const vague = c.text.match(vagueRe);
      if (vague) {
        hit = { kind: "vague", quote: vague[0], clause: c };
        break;
      }
    }
  }

  const category = rule.findingCategory;
  if (hit.kind === "numeric" && hit.clause && hit.quote) {
    return {
      findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
      kind: "compliance",
      category,
      status: "present",
      claim: interpolateMatch(scan.presentClaim, hit.quote),
      evidence: [
        { locator: hit.clause.locator, quotedText: hit.quote, sourceRole: "target" },
      ],
      ruleId: rule.ruleId,
      ruleVersion: skillVersion,
      severity: scan.severityPresent ?? "low",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
      ruleSourceTier: "B",
    };
  }

  if (hit.kind === "vague" && hit.clause && hit.quote) {
    return {
      findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
      kind: "compliance",
      category,
      status: "absent_expected",
      claim: interpolateMatch(scan.vagueClaim, hit.quote),
      evidence: [
        { locator: hit.clause.locator, quotedText: hit.quote, sourceRole: "target" },
      ],
      ruleId: rule.ruleId,
      ruleVersion: skillVersion,
      severity: scan.severityVague ?? "high",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
      gap: scan.vagueGap,
      ruleSourceTier: "B",
    };
  }

  return {
    findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
    kind: "compliance",
    category,
    status: "absent_expected",
    claim: scan.absentClaim,
    evidence: [],
    ruleId: rule.ruleId,
    ruleVersion: skillVersion,
    severity: scan.severityAbsent ?? "high",
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility: "user_facing",
    gap: scan.absentGap,
    ruleSourceTier: "B",
  };
}

async function judgeByScope(args: {
  state: AnalysisState;
  unit: AnalysisWorkUnit;
  source: RuleSource;
  ruleScope: SkillRegimeRule["ruleScope"];
  ruleText: string;
  legalHook?: string;
  label?: string;
  applicable: ClauseObject[];
  instruction: string;
  hasFocus: boolean;
  checkType?: string;
}): Promise<Finding[]> {
  if (args.ruleScope === "per_document") {
    return [
      await llmJudge({
        ...args,
        findingSuffix: "document",
      }),
    ];
  }

  return llmJudgeClauses(args);
}

/**
 * Per-clause rules are evaluated in ONE request covering every applicable
 * clause. Issuing one call per clause multiplied a single rule into dozens of
 * rate-limited round trips.
 */
async function llmJudgeClauses(args: {
  state: AnalysisState;
  unit: AnalysisWorkUnit;
  source: RuleSource;
  ruleScope: SkillRegimeRule["ruleScope"];
  ruleText: string;
  legalHook?: string;
  label?: string;
  applicable: ClauseObject[];
  instruction: string;
  hasFocus: boolean;
  checkType?: string;
}): Promise<Finding[]> {
  const { state, unit, source, ruleText, legalHook, label, applicable, instruction } = args;
  const ruleKey =
    source.kind === "authored"
      ? source.ruleId
      : source.kind === "playbook_derived"
        ? source.positionId
        : "web";

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseId: { type: "string" },
        status: {
          type: "string",
          enum: ["present", "absent_expected", "insufficient_evidence"],
        },
        claim: { type: "string" },
        quotedText: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        gap: { type: "string" },
      },
      required: ["clauseId", "status", "claim", "severity"],
    },
  };

  const tierNote =
    source.kind === "playbook_derived"
      ? "This rule text comes from an org-uploaded playbook (not statute). Judge the TARGET document against it."
      : source.kind === "web_derived"
        ? "This rule text is unverified web research. Judge carefully; do not over-claim."
        : "";

  let raw: Array<{
    clauseId: string;
    status: Finding["status"];
    claim: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    gap?: string;
  }>;

  try {
    raw = await executeJsonCompletion(
      [
        "Evaluate whether the extracted TARGET clauses satisfy the FIXED rule below.",
        "You must NOT reinterpret the rule — only assess compliance against the given rule text.",
        "Assess ALL supplied clauses in this single response.",
        "Return one entry ONLY for each clause that materially bears on the rule. Omit clauses that are irrelevant — do not pad the response.",
        "If no clause bears on the rule, return an empty array.",
        tierNote,
        unit.input.previousAttemptFeedback
          ? String(unit.input.previousAttemptFeedback)
          : "",
        `User instruction (scope the analysis to this question): ${instruction}`,
        `Rule (${ruleKey}${label ? ` — ${label}` : ""}): ${ruleText}`,
        legalHook ? `Authored legal hook / source note: ${legalHook}` : "",
        "When status is present or absent_expected with a quote, quotedText MUST be copied VERBATIM from that clause.",
        `Clauses:\n${JSON.stringify(
          applicable.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 3000),
          }))
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      "Compliance evaluator. Cite verbatim quotes when status is present. Assess every supplied clause in one response.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
  } catch (err) {
    console.warn("[checkAgainstRule] batched clause judgment failed:", err);
    raw = [];
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const byClause = new Map(applicable.map((c) => [c.clauseId, c]));
  const results = raw.filter((entry) => byClause.has(entry.clauseId));

  // LLM clause-judgment can occasionally return duplicate entries for the
  // same clauseId. Our findingId scheme keys off `clauseId`, so duplicates
  // must be resolved deterministically to avoid `finding-id` collisions in
  // Critique.
  const statusPriority: Partial<Record<Finding["status"], number>> = {
    present: 3,
    absent_expected: 2,
    insufficient_evidence: 1,
  };
  const bestByClauseId = new Map<string, (typeof results)[number]>();
  for (const entry of results) {
    const existing = bestByClauseId.get(entry.clauseId);
    if (!existing) {
      bestByClauseId.set(entry.clauseId, entry);
      continue;
    }
    if ((statusPriority[entry.status] ?? 0) > (statusPriority[existing.status] ?? 0)) {
      bestByClauseId.set(entry.clauseId, entry);
    }
  }
  const dedupedResults = [...bestByClauseId.values()];

  if (dedupedResults.length === 0) {
    return [
      judgeResultToFinding(args, {
        status: "insufficient_evidence",
        claim: label
          ? `The agreement does not provide enough verifiable language to confirm ${label.toLowerCase()}.`
          : "The agreement does not provide enough verifiable language to confirm this obligation.",
        gap: "No supplied clause materially addressed this obligation.",
        severity: "medium",
      }, "document"),
    ];
  }

  return dedupedResults.map((entry) =>
    judgeResultToFinding(
      args,
      {
        status: entry.status,
        claim: entry.claim,
        clauseId: entry.clauseId,
        quotedText: entry.quotedText,
        severity: entry.severity,
        gap: entry.gap,
      },
      entry.clauseId
    )
  );
}

async function llmJudge(args: {
  state: AnalysisState;
  unit: AnalysisWorkUnit;
  source: RuleSource;
  ruleScope: SkillRegimeRule["ruleScope"];
  ruleText: string;
  legalHook?: string;
  label?: string;
  applicable: ClauseObject[];
  instruction: string;
  hasFocus: boolean;
  checkType?: string;
  findingSuffix?: string;
}): Promise<Finding> {
  const {
    state,
    unit,
    source,
    ruleText,
    legalHook,
    label,
    applicable,
    instruction,
    hasFocus,
    findingSuffix,
  } = args;
  const tier = tierFor(source.kind);
  const ruleKey =
    source.kind === "authored"
      ? source.ruleId
      : source.kind === "playbook_derived"
        ? source.positionId
        : "web";

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["present", "absent_expected", "insufficient_evidence"],
      },
      claim: { type: "string" },
      clauseId: { type: "string" },
      quotedText: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high"] },
      gap: { type: "string" },
    },
    required: ["status", "claim", "severity"],
  };

  let result: {
    status: Finding["status"];
    claim: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    gap?: string;
  };

  const tierNote =
    source.kind === "playbook_derived"
      ? "This rule text comes from an org-uploaded playbook (not statute). Judge the TARGET document against it."
      : source.kind === "web_derived"
        ? "This rule text is unverified web research. Judge carefully; do not over-claim."
        : "";

  try {
    result = await executeJsonCompletion(
      [
        "Evaluate whether the extracted TARGET clauses satisfy the FIXED rule below.",
        "You must NOT reinterpret the rule — only assess compliance against the given rule text.",
        args.ruleScope === "per_document"
          ? "This is a PER-DOCUMENT assessment. Evaluate the clause set once as a whole and return exactly one result."
          : "This is a PER-CLAUSE assessment. Evaluate only the single supplied clause.",
        tierNote,
        unit.input.previousAttemptFeedback
          ? String(unit.input.previousAttemptFeedback)
          : "",
        `User instruction (scope the analysis to this question): ${instruction}`,
        `Rule (${ruleKey}${label ? ` — ${label}` : ""}): ${ruleText}`,
        legalHook ? `Authored legal hook / source note: ${legalHook}` : "",
        "When status is present or absent_expected with a quote, quotedText MUST be copied VERBATIM from a clause.",
        `Clauses:\n${JSON.stringify(
          applicable.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 3000),
          }))
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      "Compliance evaluator. Cite verbatim quotes when status is present.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
  } catch (err) {
    console.warn("[checkAgainstRule] LLM failed:", err);
    result = {
      status: "insufficient_evidence",
      claim: label
        ? `This obligation could not be evaluated because analysis was temporarily unavailable (${label.toLowerCase()}).`
        : "This obligation could not be evaluated because analysis was temporarily unavailable.",
      severity: "medium",
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  return judgeResultToFinding(args, result, findingSuffix ?? "result");
}

function judgeResultToFinding(
  args: {
    unit: AnalysisWorkUnit;
    source: RuleSource;
    label?: string;
    applicable: ClauseObject[];
    instruction: string;
    hasFocus: boolean;
    ruleText: string;
  },
  input: {
    status: Finding["status"];
    claim: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    gap?: string;
  },
  findingSuffix: string
): Finding {
  const { unit, source, label, applicable, instruction, hasFocus, ruleText } = args;
  const tier = tierFor(source.kind);
  const ruleKey =
    source.kind === "authored"
      ? source.ruleId
      : source.kind === "playbook_derived"
        ? source.positionId
        : "web";

  let result = input;

  const evidence: EvidenceSpan[] = [];
  if (source.kind === "playbook_derived") {
    evidence.push({
      locator: source.sourceLocator,
      quotedText: source.requirementText.slice(0, 400),
      sourceRole: "reference",
    });
  }

  if (result.clauseId && result.quotedText) {
    const clause = applicable.find((c) => c.clauseId === result.clauseId);
    if (clause && clause.text.includes(result.quotedText)) {
      evidence.push({
        locator: clause.locator,
        quotedText: result.quotedText,
        sourceRole: "target",
      });
    }
  }

  const hasTargetEvidence = evidence.some((item) => item.sourceRole === "target");
  if (result.status === "present" && !hasTargetEvidence) {
    result = {
      ...result,
      status: "insufficient_evidence",
      claim: label
        ? `The agreement does not provide enough verifiable language to confirm ${label.toLowerCase()}.`
        : "The agreement does not provide enough verifiable language to confirm this obligation.",
      gap:
        "The available document language was not specific enough to support a confirmed assessment.",
      severity: "medium",
    };
  }

  const restatementOnly =
    source.kind === "authored" && result.status === "present" && !hasFocus && !instruction.trim();
  const visibility: Finding["visibility"] =
    restatementOnly ||
    (source.kind === "authored" &&
      result.status === "present" &&
      !hasFocus &&
      isGenericRestatement(result.claim, ruleText))
      ? "internal"
      : "user_facing";

  return {
    findingId: `f_compliance_${ruleKey}_${unit.workUnitId}_${findingSuffix}`,
    kind: "compliance",
    category:
      source.kind === "authored"
        ? source.findingCategory
        : source.kind === "playbook_derived"
          ? `playbook.${source.positionId}.gap`
          : `web.${slugCategory(source.query)}.unverified`,
    status: result.status,
    claim: result.claim,
    evidence,
    ruleId: source.kind === "authored" ? source.ruleId : undefined,
    ruleVersion: source.kind === "authored" ? source.ruleVersion : undefined,
    severity:
      result.severity ??
      (source.kind === "playbook_derived" ? source.severityIfViolated ?? "medium" : "medium"),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId: source.kind === "authored" ? source.skillId : undefined,
    visibility,
    gap: result.gap,
    ruleSourceTier: tier,
    playbookPositionId: source.kind === "playbook_derived" ? source.positionId : undefined,
    unverified: source.kind === "web_derived" || undefined,
    sourceUrl: source.kind === "web_derived" ? source.sourceUrl : undefined,
    retrievedAt: source.kind === "web_derived" ? source.retrievedAt : undefined,
  };
}

function slugCategory(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "reference"
  );
}

function mergeFindings(existing: Finding[], next: Finding[]): Finding[] {
  const nextIds = new Set(next.map((finding) => finding.findingId));
  return [
    ...existing.filter((finding) => !nextIds.has(finding.findingId)),
    ...next,
  ];
}

function isGenericRestatement(claim: string, ruleText: string): boolean {
  const c = claim.toLowerCase();
  const r = ruleText.toLowerCase().slice(0, 40);
  return c.includes(r) || c.includes("complies with") || c.includes("satisfies the rule");
}

export { checkAgainstRule };
