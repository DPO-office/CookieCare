import type { DraftState } from "../../models/draft-state.js";
import type { CritiqueResult } from "../../models/critique-report.js";
import type { SkillValidationRule } from "../../packs/skill-contract.js";
import type { StructuredFacts } from "../../models/structured-facts.js";

function unitPresent(state: DraftState, workUnitId: string): boolean {
  const plan = state.plan;
  if (!plan) return false;
  const unit = plan.workUnits.find((u) => u.id === workUnitId);
  if (!unit) return false;
  const doc = state.draft?.formattedDocument ?? "";
  if (unit.kind === "exhibit") {
    return (state.exhibits ?? []).some((e) => e.workUnitId === workUnitId);
  }
  return (
    doc.toLowerCase().includes(unit.heading.toLowerCase()) ||
    (state.draft?.sections ?? []).some((s) => s.workUnitId === workUnitId)
  );
}

function sectionBody(state: DraftState, workUnitId: string): string {
  const section = (state.draft?.sections ?? []).find(
    (s) => s.workUnitId === workUnitId
  );
  if (section?.body) return section.body;
  const exhibit = (state.exhibits ?? []).find((e) => e.workUnitId === workUnitId);
  if (exhibit?.body) return exhibit.body;
  return state.draft?.formattedDocument ?? "";
}

function factValueInDraft(
  state: DraftState,
  factId: string,
  facts: StructuredFacts
): boolean {
  const raw = (facts as Record<string, unknown>)[factId];
  if (raw == null) return true; // nothing to reflect
  const needle = String(raw).trim();
  if (!needle || needle.length < 3) return true;
  const doc = (state.draft?.formattedDocument ?? "").toLowerCase();
  return doc.includes(needle.toLowerCase());
}

/**
 * Deterministic skill validationRules — no LLM.
 * Failures prefer section-only fix plans (workUnitId = sectionTarget).
 */
export function runSkillValidationRules(state: DraftState): {
  results: CritiqueResult[];
  fixItems: Array<{
    workUnitId: string;
    instruction: string;
    sourceChecklistItemId: string;
  }>;
} {
  const rules: SkillValidationRule[] =
    state.draftingContext?.validationRules ?? [];
  const facts = (state.structuredFacts ??
    state.plan?.structuredFacts ??
    {}) as StructuredFacts;
  const results: CritiqueResult[] = [];
  const fixItems: Array<{
    workUnitId: string;
    instruction: string;
    sourceChecklistItemId: string;
  }> = [];

  for (const rule of rules) {
    if (rule.when && !rule.when(facts)) continue;

    let status: CritiqueResult["status"] = "pass";
    let evidenceQuote: string | undefined;

    switch (rule.checkKind) {
      case "section_present":
      case "exhibit_present":
      case "conditional_exhibit": {
        const target = rule.sectionTarget;
        if (!target) {
          status = "ambiguous";
          break;
        }
        const present = unitPresent(state, target);
        status = present ? "pass" : "missing";
        evidenceQuote = present ? target : undefined;
        if (!present && rule.severity === "critical") {
          fixItems.push({
            workUnitId: target,
            instruction: `SKILL RULE ${rule.id}: ${rule.requirement}. Draft or restore this unit with the required legal content.`,
            sourceChecklistItemId: rule.id,
          });
        }
        break;
      }
      case "required_phrase": {
        const target = rule.sectionTarget;
        const phrase = rule.requiredPhrase?.toLowerCase();
        if (!phrase) {
          status = "ambiguous";
          break;
        }
        const body = (
          target ? sectionBody(state, target) : state.draft?.formattedDocument ?? ""
        ).toLowerCase();
        const ok = body.includes(phrase);
        status = ok ? "pass" : "fail";
        evidenceQuote = ok ? rule.requiredPhrase : undefined;
        if (!ok && rule.severity === "critical") {
          fixItems.push({
            workUnitId: target || "sec-misc",
            instruction: `SKILL RULE ${rule.id}: ${rule.requirement}. Ensure the draft includes the concept/phrase: "${rule.requiredPhrase}".`,
            sourceChecklistItemId: rule.id,
          });
        }
        break;
      }
      case "fact_reflected": {
        const ok = rule.factId
          ? factValueInDraft(state, rule.factId, facts)
          : true;
        status = ok ? "pass" : "fail";
        if (!ok && rule.severity === "critical" && rule.factId) {
          fixItems.push({
            workUnitId: rule.sectionTarget || "sec-parties",
            instruction: `SKILL RULE ${rule.id}: Reflect fact "${rule.factId}" exactly from structuredFacts in this unit.`,
            sourceChecklistItemId: rule.id,
          });
        }
        break;
      }
      default:
        status = "ambiguous";
    }

    results.push({
      itemId: `skill:${rule.id}`,
      status,
      evidenceQuote,
      evidenceVerified: status === "pass",
    });
  }

  if (fixItems.length > 0) {
    console.log(
      `[skillValidation] fails=${fixItems.map((f) => f.sourceChecklistItemId).join(",")}`
    );
  }

  return { results, fixItems };
}
