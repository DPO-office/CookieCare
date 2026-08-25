import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import type { SectionActContext } from "../../models/drafting-context.js";
import {
  formatExhibitBrief,
  formatSectionBrief,
} from "../../packs/skill-contract.js";
import {
  buildPlaybookSection,
  buildClauseSection,
} from "../../prompts/system-templates.js";
import {
  buildDealIdentity,
  formatDealIdentityLock,
} from "./deal-identity.js";

const TEMPLATE_SLICE_CAP = 3500;
const TEMPLATE_FALLBACK_CAP = 2500;

function relevantFactsForUnit(
  state: DraftState,
  unit: WorkUnit
): Record<string, unknown> {
  const facts = {
    ...(state.structuredFacts ?? {}),
    ...(state.plan?.structuredFacts ?? {}),
  } as Record<string, unknown>;
  const brief =
    state.draftingContext?.sectionBriefs[unit.id] ||
    state.draftingContext?.exhibitBriefs[unit.id];
  const keys = new Set<string>([
    "partyA",
    "partyB",
    "parties",
    "roleA",
    "roleB",
    "effectiveDate",
    "principalAgreementDate",
    "governingLaw",
    "documentType",
    ...(brief?.requiredFacts ?? []),
  ]);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (facts[key] !== undefined && facts[key] !== null) {
      out[key] = facts[key];
    }
  }
  // Always include transfer / PHI when present for conditional sections.
  for (const extra of [
    "transferMechanism",
    "sccModule",
    "ukIdta",
    "phiInvolved",
    "processingPurpose",
    "dataCategories",
    "dataSubjects",
    "breachNotification",
    "deletionReturn",
  ]) {
    if (facts[extra] !== undefined && facts[extra] !== null) {
      out[extra] = facts[extra];
    }
  }
  return out;
}

function filterPlaybookRules(state: DraftState, unit: WorkUnit) {
  const rules = state.draftingContext?.playbook?.rules ??
    state.retrieval.applicablePlaybookRules ??
    [];
  if (rules.length === 0) return [];
  const topics = new Set(
    [...unit.clauseTypes, unit.heading, unit.id].map((t) =>
      t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    )
  );
  const matched = rules.filter((rule) => {
    const topic = rule.topic.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const t of topics) {
      if (!t) continue;
      if (topic.includes(t) || t.includes(topic)) return true;
    }
    // Broad privacy topics for DPA units
    if (
      (topic.includes("data") ||
        topic.includes("privacy") ||
        topic.includes("security") ||
        topic.includes("transfer") ||
        topic.includes("sub")) &&
      (unit.id.includes("process") ||
        unit.id.includes("security") ||
        unit.id.includes("transfer") ||
        unit.id.includes("sub") ||
        unit.id.includes("breach") ||
        unit.id.includes("hipaa"))
    ) {
      return true;
    }
    return false;
  });
  // If nothing matched, pass a small cap of all rules so playbook is not silent.
  return matched.length > 0 ? matched : rules.slice(0, 4);
}

function templateBlockForUnit(state: DraftState, unit: WorkUnit): string {
  const tpl = state.draftingContext?.template;
  if (!tpl?.content) {
    return "# BASELINE TEMPLATE\nNo template — follow skill skeleton and section brief.";
  }
  const slice =
    tpl.sectionSlices?.[unit.id] ||
    undefined;
  if (slice) {
    return `# BASELINE TEMPLATE SLICE (${tpl.id})\n${slice.slice(0, TEMPLATE_SLICE_CAP)}`;
  }
  return `# BASELINE TEMPLATE (truncated — no exact heading match for ${unit.heading})\nSource: ${tpl.id}\n${tpl.content.slice(0, TEMPLATE_FALLBACK_CAP)}`;
}

/**
 * Build the ACT context package for one work unit.
 * Precedence (documented in prompt): skill elements > user instructions >
 * playbook > template > approved clauses > safe defaults > connective tissue.
 */
export function buildSectionContext(
  state: DraftState,
  unit: WorkUnit
): SectionActContext {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType || state.draftingContext?.documentType
  );
  const identityLock = identity ? formatDealIdentityLock(identity) : "";

  const sectionBrief = state.draftingContext?.sectionBriefs[unit.id];
  const exhibitBrief = state.draftingContext?.exhibitBriefs[unit.id];
  let sectionBriefBlock = "";
  if (unit.kind === "exhibit" && exhibitBrief) {
    sectionBriefBlock = formatExhibitBrief(exhibitBrief);
  } else if (sectionBrief) {
    sectionBriefBlock = formatSectionBrief(sectionBrief);
  } else {
    sectionBriefBlock = `# SECTION BRIEF — ${unit.heading}\nNo authored brief; follow document-type skeleton and deal facts.`;
  }

  const playbookRules = filterPlaybookRules(state, unit);
  const playbookBlock = buildPlaybookSection(playbookRules);

  const approved = (state.draftingContext?.clauses ?? state.retrieval.fallbackClauses ?? [])
    .filter((c) => unit.clauseTypes.includes(c.clauseType) && c.isApproved);
  const approvedClausesBlock = approved.length
    ? buildClauseSection(approved)
    : "";

  const fixInstructions =
    state.fixPlan?.items
      .filter((f) => f.workUnitId === unit.id)
      .map((f) => f.instruction) ?? [];

  return {
    workUnitId: unit.id,
    heading: unit.heading,
    kind: unit.kind,
    identityLock,
    relevantFacts: relevantFactsForUnit(state, unit),
    sectionBriefBlock,
    playbookBlock,
    templateBlock: templateBlockForUnit(state, unit),
    approvedClausesBlock,
    fixInstructions,
    skillIds: state.draftingContext?.skillIds ?? [],
    templateId: state.draftingContext?.template?.id ?? state.retrieval.templateId,
    playbookId:
      state.draftingContext?.playbook?.id ?? state.retrieval.playbookId,
  };
}

/** Precedence legend injected once per ACT prompt. */
export const DRAFTING_PRECEDENCE_BLOCK = `
# DRAFTING PRECEDENCE (deterministic)
1. Skill mandatory legal elements (cannot omit without CONFLICT)
2. Explicit user instructions / exclusions
3. Playbook preferred / fallback positions
4. Template wording / structure
5. Approved clauses (verbatim where provided)
6. Safe defaults (assumed facts)
7. Model connective tissue only
`.trim();
