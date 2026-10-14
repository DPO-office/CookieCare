/**
 * Doc-type classification + structural rubric (V2 Stage 2 prep).
 *
 * Uses the EXISTING analysis DPA skill (`dpaDocTypeSkill`) as the authoritative
 * structural rubric — presence/adequacy rules + expected clauses + doc-type
 * classifiers. It does NOT re-invent the DPA rubric. A small, explicitly-labeled
 * set of negotiation-adequacy ADJUNCTS covers dimensions the structural skill
 * does not (e.g. "is the sub-processor objection right actually enforceable").
 * A generic fallback rubric is used only when NO skill covers the document type.
 */
import { dpaDocTypeSkill } from "../../analysis/skills/doc-types/dpa/skill.config.js";

export interface RubricRule {
  ruleId: string;
  label: string;
  question: string;              // judgment question for the structural pass
  findingCategory: string;
  appliesToClauseTypes: string[];
  textSynonyms: string[];        // retrieval hints
  mustCatch: boolean;            // recall-protected: never dropped silently
  source: string;                // provenance (skill id or "negotiate-adjunct")
  severityHintIfAbsent?: "high" | "medium" | "low";
}

export interface DocTypeClassification {
  docType: string;
  confident: boolean;
  score: number;
  rubricSource: "skill" | "generic";
}

/** Classify by the skill's own regex classifiers; below τ → not confident. */
export function classifyDocType(text: string): DocTypeClassification {
  const hay = text.slice(0, 20000).toLowerCase();
  let best = { docType: "generic", score: 0 };
  for (const c of dpaDocTypeSkill.docTypeClassifiers ?? []) {
    let hits = 0;
    for (const p of c.patterns) { try { if (new RegExp(p, "i").test(hay)) hits++; } catch { /* ignore */ } }
    const score = c.patterns.length ? hits / c.patterns.length : 0;
    if (score > best.score) best = { docType: c.docTypeId, score };
  }
  const confident = best.score >= 0.5;
  return {
    docType: confident ? best.docType : "generic",
    confident,
    score: best.score,
    rubricSource: confident && best.docType === "dpa" ? "skill" : "generic",
  };
}

// Must-catch structural gaps (align with the gold set's must-catch absences).
const MUST_CATCH_CATEGORIES = new Set([
  "missing_limitation_of_liability",
  "dpa_subprocessor_gap",
  "dpa_deletion_gap",
]);

/** Negotiation-adequacy adjuncts NOT covered by the structural skill. */
const DPA_ADJUNCTS: RubricRule[] = [
  {
    ruleId: "neg.liability_cap_dp_breach_carveout",
    label: "Liability cap / DP-breach carve-out",
    question:
      "Does the DPA address limitation of liability for data-protection breaches — e.g. a cap, or a carve-out of GDPR/DP breaches from the master-agreement cap? Answer 'absent' if there is no liability provision at all.",
    findingCategory: "missing_limitation_of_liability",
    appliesToClauseTypes: ["limitation_of_liability", "indemnity"],
    textSynonyms: ["limitation of liability", "liability cap", "indemnif", "aggregate liability"],
    mustCatch: true,
    source: "negotiate-adjunct",
    severityHintIfAbsent: "high",
  },
  {
    ruleId: "neg.subprocessor_objection_has_teeth",
    label: "Sub-processor objection is enforceable",
    question:
      "If the controller objects to a new sub-processor, does it have a real remedy (block the sub-processor / withhold consent), or is the objection illusory (only 'reasonable efforts' + terminate-the-service)? Answer 'present_inadequate' if the remedy is illusory.",
    findingCategory: "dpa_subprocessor_gap",
    appliesToClauseTypes: ["subprocessor_flow_down", "data_protection"],
    textSynonyms: ["object", "sub-processor", "reasonable efforts", "terminate"],
    mustCatch: true,
    source: "negotiate-adjunct",
    severityHintIfAbsent: "medium",
  },
  {
    ruleId: "neg.audit_no_competitor_carveout",
    label: "Audit rights not neutralised",
    question:
      "Are the audit/inspection rights practically usable, or are they neutralised (competitor-auditor carve-out, controller pays regardless, no defined frequency)? Answer 'present_inadequate' if neutralised.",
    findingCategory: "dpa_audit_gap",
    appliesToClauseTypes: ["audit_rights"],
    textSynonyms: ["audit", "inspection", "reimburse", "competitor"],
    mustCatch: false,
    source: "negotiate-adjunct",
    severityHintIfAbsent: "medium",
  },
  {
    ruleId: "neg.breach_notification_deadline",
    label: "Breach notification has a fixed deadline",
    question:
      "Does the DPA require personal-data breach notification within a FIXED maximum time (e.g. 48 or 72 hours), or only 'without undue delay' with no fixed deadline? Answer 'present_inadequate' if there is no fixed deadline; 'absent' if breach notification is not addressed at all.",
    findingCategory: "dpa_breach_notification_gap",
    appliesToClauseTypes: ["breach_notification"],
    textSynonyms: ["breach", "notify", "without undue delay", "incident", "hours"],
    mustCatch: true,
    source: "negotiate-adjunct",
    severityHintIfAbsent: "medium",
  },
];

/** Minimal generic rubric used only when no skill covers the document type. */
const GENERIC_RUBRIC: RubricRule[] = [
  { ruleId: "gen.limitation_of_liability", label: "Limitation of liability present", question: "Is there a limitation-of-liability clause? Answer 'absent' if none.", findingCategory: "missing_limitation_of_liability", appliesToClauseTypes: ["limitation_of_liability"], textSynonyms: ["limitation of liability", "liability cap"], mustCatch: true, source: "generic" },
  { ruleId: "gen.termination", label: "Termination rights present", question: "Are termination rights and notice addressed? Answer 'absent' if none.", findingCategory: "other_known_risk", appliesToClauseTypes: ["termination"], textSynonyms: ["termination", "terminate", "notice period"], mustCatch: false, source: "generic" },
  { ruleId: "gen.confidentiality", label: "Confidentiality present", question: "Is confidentiality addressed? Answer 'absent' if none.", findingCategory: "other_known_risk", appliesToClauseTypes: ["confidentiality"], textSynonyms: ["confidential"], mustCatch: false, source: "generic" },
  { ruleId: "gen.indemnity", label: "Indemnity scope", question: "Is there an uncapped/one-sided indemnity? Answer 'present_inadequate' if so.", findingCategory: "other_known_risk", appliesToClauseTypes: ["indemnity"], textSynonyms: ["indemnif", "hold harmless"], mustCatch: false, source: "generic" },
];

/** Build the rubric for a classified document. */
export function getRubric(classification: DocTypeClassification): RubricRule[] {
  if (classification.rubricSource !== "skill") return GENERIC_RUBRIC;

  const skill = dpaDocTypeSkill;
  const skillId = "skill:" + skill.skillId;
  const rules: RubricRule[] = [];

  // Presence rules from the skill's regimeRules.
  for (const r of skill.regimeRules ?? []) {
    rules.push({
      ruleId: r.ruleId,
      label: r.label,
      question: `${r.ruleText} Answer 'absent' if the document does not address this, 'present_inadequate' if it does but weakly.`,
      findingCategory: r.findingCategory,
      appliesToClauseTypes: r.appliesToClauseTypes ?? [],
      textSynonyms: [],
      mustCatch: MUST_CATCH_CATEGORIES.has(r.findingCategory),
      source: skillId,
    });
  }
  // Expected clauses (with severityIfMissing) → absence checks.
  for (const ec of skill.expectedClauses ?? []) {
    rules.push({
      ruleId: `expected.${ec.clauseType}`,
      label: `Expected clause: ${ec.clauseType}`,
      question: `Does the document contain a ${ec.clauseType.replace(/_/g, " ")} clause? Answer 'absent' if missing.`,
      findingCategory: ec.findingCategory,
      appliesToClauseTypes: [ec.clauseType],
      textSynonyms: ec.textSynonyms ?? [],
      mustCatch: MUST_CATCH_CATEGORIES.has(ec.findingCategory) || ec.severityIfMissing === "high",
      source: skillId,
      severityHintIfAbsent: ec.severityIfMissing as any,
    });
  }
  // Negotiation adequacy adjuncts (not covered by the structural skill).
  rules.push(...DPA_ADJUNCTS);

  // De-dup by ruleId (skill + expected can overlap on a category).
  const seen = new Set<string>();
  return rules.filter((r) => (seen.has(r.ruleId) ? false : (seen.add(r.ruleId), true)));
}

export const mustCatchRuleIds = (rules: RubricRule[]): Set<string> =>
  new Set(rules.filter((r) => r.mustCatch).map((r) => r.ruleId));
