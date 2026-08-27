import type { DraftState } from "../../models/draft-state.js";
import type { CritiqueReport, CritiqueResult, FixItem } from "../../models/critique-report.js";
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import {
  findDraftPlaceholders,
  isFactSatisfied,
  missingFactsFromPlaceholders,
} from "../plan/core-deal-facts.js";
import {
  buildDealIdentity,
  findForeignPartyNames,
} from "../act/deal-identity.js";
import { runSkillValidationRules } from "./skill-validation.js";
import { applyDeterministicFixes } from "./apply-deterministic-fixes.js";
import {
  classifyFixItems,
  partitionClassifiedFixes,
} from "./classify-fix.js";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function evidenceVerified(quote: string | undefined, document: string): boolean {
  if (!quote) return false;
  return normalize(document).includes(normalize(quote));
}

function deterministicChecks(state: DraftState): CritiqueResult[] {
  const results: CritiqueResult[] = [];
  const doc = state.draft?.formattedDocument ?? "";
  const plan = state.plan;

  if (!plan) {
    return [
      {
        itemId: "no-plan",
        status: "fail",
        evidenceVerified: false,
      },
    ];
  }

  for (const unit of plan.workUnits.filter((u) => u.kind === "section")) {
    const present =
      doc.toLowerCase().includes(unit.heading.toLowerCase()) ||
      (state.draft?.sections ?? []).some((s) => s.workUnitId === unit.id);
    results.push({
      itemId: `skeleton:${unit.id}`,
      status: present ? "pass" : "missing",
      evidenceQuote: present ? unit.heading : undefined,
      evidenceVerified: present,
    });
  }

  const placeholders = findDraftPlaceholders(doc);
  if (placeholders.length > 0) {
    results.push({
      itemId: "placeholders",
      status: "fail",
      evidenceQuote: placeholders.slice(0, 5).join("; "),
      evidenceVerified: false,
    });
  }

  const identity = buildDealIdentity(
    state.structuredFacts ?? plan.structuredFacts,
    plan.documentType
  );
  if (identity) {
    const foreign = findForeignPartyNames(doc, identity);
    if (foreign.length > 0) {
      results.push({
        itemId: "party-consistency",
        status: "fail",
        evidenceQuote: `Locked parties: ${identity.partyA} / ${identity.partyB}. Foreign names found: ${foreign.slice(0, 6).join("; ")}`,
        evidenceVerified: false,
      });
    }
    const lower = doc.toLowerCase();
    if (
      !lower.includes(identity.partyA.toLowerCase()) ||
      !lower.includes(identity.partyB.toLowerCase())
    ) {
      results.push({
        itemId: "party-presence",
        status: "fail",
        evidenceQuote: `Expected both "${identity.partyA}" and "${identity.partyB}" to appear in the draft.`,
        evidenceVerified: false,
      });
    }
  }

  return results;
}

const CRITIQUE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      itemId: { type: "string" },
      status: { type: "string", enum: ["pass", "fail", "missing", "ambiguous"] },
      evidenceQuote: { type: "string" },
      workUnitId: { type: "string" },
      instruction: { type: "string" },
    },
    required: ["itemId", "status"],
  },
};

export const DRAFTING_CRITIQUE_MAX_ITER = Math.max(
  1,
  Number(process.env.DRAFTING_CRITIQUE_MAX_ITER || 2)
);

/**
 * CRITIQUE — deterministic scrub → skill rules → (optional) LLM checklist.
 * Fix plan only contains section_redraft items for targeted ACT.
 */
export async function runCritique(state: DraftState): Promise<DraftState> {
  // Deterministic scrub first — avoid spending Pro on placeholders / party scrub.
  let working = applyDeterministicFixes(state);

  const doc = working.draft?.formattedDocument ?? "";
  const deterministic = deterministicChecks(working);
  const skillCheck = runSkillValidationRules(working);
  const tracker = working.agent ? { tokensUsed: working.agent.tokensUsed } : undefined;

  const detHardFail = deterministic.some(
    (r) => r.status === "fail" || r.status === "missing"
  );
  const skillHardFail = skillCheck.results.some(
    (r) => r.status === "fail" || r.status === "missing"
  );

  let llmRaw: Array<{
    itemId: string;
    status: CritiqueResult["status"];
    evidenceQuote?: string;
    workUnitId?: string;
    instruction?: string;
  }> = [];

  const checklist = working.plan?.mandatoryChecklist ?? [];
  const critiqueChecklist = checklist.slice(0, 25);

  // LLM checklist only when deterministic + skill validation are clean (or only ambiguous).
  const shouldRunLlm =
    checklist.length > 0 &&
    doc &&
    !detHardFail &&
    !skillHardFail;

  if (shouldRunLlm) {
    try {
      llmRaw = await executeJsonCompletion(
        [
          "Audit this draft against the checklist. For each item return status and a short evidenceQuote copied VERBATIM from the draft when status is pass.",
          `Checklist (${critiqueChecklist.length} of ${checklist.length} items):\n${JSON.stringify(critiqueChecklist)}`,
          `Draft:\n${doc.slice(0, 40_000)}`,
        ].join("\n\n"),
        "You are a legal contract checklist auditor. Never invent evidence quotes.",
        CRITIQUE_SCHEMA,
        LLMTask.CRITIQUE_CHECKLIST,
        LLMProvider.GEMINI,
        tracker
      );
    } catch (err) {
      console.warn("[runCritique] LLM checklist failed; using deterministic only:", err);
    }
  } else if (checklist.length > 0 && (detHardFail || skillHardFail)) {
    console.log(
      "[runCritique] skipping LLM checklist — deterministic/skill fails present"
    );
  }

  if (working.agent && tracker) {
    working.agent.tokensUsed = tracker.tokensUsed;
  }

  const llmResults: CritiqueResult[] = llmRaw.map((r) => {
    const verified = evidenceVerified(r.evidenceQuote, doc);
    let status = r.status;
    if (status === "pass" && !verified) {
      status = "ambiguous";
    }
    return {
      itemId: r.itemId,
      status,
      evidenceQuote: r.evidenceQuote,
      evidenceVerified: status === "pass" ? verified : verified || status !== "pass",
    };
  });

  const results = [...deterministic, ...skillCheck.results, ...llmResults];

  const llmFixPlan: FixItem[] = llmRaw
    .filter((r) => r.status === "fail" || r.status === "missing")
    .map((r) => ({
      workUnitId:
        r.workUnitId ||
        checklist.find((c) => c.id === r.itemId)?.sectionTarget ||
        "sec-misc",
      instruction: r.instruction || `Address checklist item ${r.itemId}`,
      sourceChecklistItemId: r.itemId,
    }));

  const skeletonMissing = deterministic.some(
    (r) => r.itemId.startsWith("skeleton:") && r.status === "missing"
  );

  const hasHardFail = results.some(
    (r) => r.status === "fail" || r.status === "missing"
  );
  const placeholders = findDraftPlaceholders(doc);
  const identity = buildDealIdentity(
    working.structuredFacts ?? working.plan?.structuredFacts,
    working.plan?.documentType
  );
  const foreignParties = identity ? findForeignPartyNames(doc, identity) : [];
  const placeholderFacts = missingFactsFromPlaceholders(placeholders).filter(
    (f) =>
      !isFactSatisfied(
        (working.structuredFacts ?? {}) as Record<string, unknown>,
        f.field
      )
  );

  let nextState: DraftState = working;
  if (placeholderFacts.length > 0 && working.plan) {
    const existingFields = new Set(
      (working.plan.missingFacts ?? []).map((f) => f.field)
    );
    const toAdd = placeholderFacts.filter((f) => !existingFields.has(f.field));
    if (toAdd.length > 0) {
      nextState = {
        ...working,
        plan: {
          ...working.plan,
          missingFacts: [...(working.plan.missingFacts ?? []), ...toAdd],
        },
      };
      console.warn(
        `[runCritique] leftover placeholders → ASK fields=${toAdd.map((f) => f.field).join(",")}`
      );
    }
  }

  // Build candidate fixes, then classify — only section_redraft goes to ACT.
  const partyFixItems: FixItem[] =
    identity && foreignParties.length > 0
      ? (working.plan?.workUnits ?? [])
          .filter(
            (u) =>
              u.status === "drafted" ||
              u.status === "flagged" ||
              u.status === "pending"
          )
          .slice(0, 3) // surgical: at most a few units, not all 13
          .map((u) => ({
            workUnitId: u.id,
            instruction: `PARTY LOCK: Rewrite this unit using ONLY "${identity.partyA}" as ${identity.roleA} and ONLY "${identity.partyB}" as ${identity.roleB}. Remove these foreign names: ${foreignParties.slice(0, 8).join(", ")}. Do not invent any other company names.`,
            sourceChecklistItemId: "party-consistency",
          }))
      : [];

  const placeholderFixItems: FixItem[] =
    placeholders.length > 0
      ? [
          {
            workUnitId: "sec-parties",
            instruction: `Remove all square-bracket placeholders (${placeholders.slice(0, 8).join(", ")}). Substitute real facts from structuredFacts; never leave [● ...] stubs.`,
            sourceChecklistItemId: "placeholders",
          },
        ]
      : [];

  const candidateFix: FixItem[] =
    placeholderFixItems.length > 0 || partyFixItems.length > 0
      ? [...placeholderFixItems, ...partyFixItems]
      : skillCheck.fixItems.length > 0
        ? skillCheck.fixItems
        : hasHardFail
          ? llmFixPlan
          : [];

  const classified = classifyFixItems(candidateFix, results);
  const { deterministic: detFixes, sectionRedraft, planChange } =
    partitionClassifiedFixes(classified);

  // Deterministic items were already scrubbed via applyDeterministicFixes;
  // if they still fail after scrub they become section_redraft.
  const stillNeedAct: FixItem[] = [
    ...sectionRedraft.map((c) => c.item),
    // If deterministic scrub didn't clear placeholders/parties, escalate those units.
    ...detFixes
      .filter((c) => {
        if (c.item.sourceChecklistItemId === "placeholders") {
          return findDraftPlaceholders(doc).length > 0;
        }
        if (c.item.sourceChecklistItemId === "party-consistency") {
          return foreignParties.length > 0;
        }
        return false;
      })
      .map((c) => c.item),
  ];

  // Deduplicate by workUnitId
  const seenUnits = new Set<string>();
  const mergedFix: FixItem[] = [];
  for (const item of stillNeedAct) {
    if (seenUnits.has(item.workUnitId)) continue;
    seenUnits.add(item.workUnitId);
    mergedFix.push(item);
  }

  if (foreignParties.length > 0) {
    console.warn(
      `[runCritique] party drift detected foreign=${foreignParties.slice(0, 6).join(" | ")} locked=${identity?.partyA} / ${identity?.partyB}`
    );
  }

  const iteration = (working.critique?.iteration ?? 0) + 1;
  const hitCap = iteration >= DRAFTING_CRITIQUE_MAX_ITER;

  const report: CritiqueReport = {
    isGreen:
      !hasHardFail &&
      !skeletonMissing &&
      placeholders.length === 0 &&
      foreignParties.length === 0,
    iteration,
    results,
    fixPlan: hitCap ? [] : mergedFix,
    skeletonMismatch: planChange.length > 0 && skeletonMissing,
    criticalFactSurfaced: placeholderFacts.length > 0,
  };

  report.skeletonMismatch =
    deterministic.filter(
      (r) => r.itemId.startsWith("skeleton:") && r.status === "missing"
    ).length >
    Math.max(
      1,
      Math.floor(
        deterministic.filter((r) => r.itemId.startsWith("skeleton:")).length / 2
      )
    );

  if (hitCap && !report.isGreen) {
    console.warn(
      `[runCritique] critique iteration cap (${DRAFTING_CRITIQUE_MAX_ITER}) reached — stopping redraft loop`
    );
  }

  console.log(
    `[runCritique] iter=${iteration} green=${report.isGreen} sectionFixes=${mergedFix.length} detScrubbed=${detFixes.length} llm=${llmRaw.length}`
  );

  return {
    ...nextState,
    critique: report,
    fixPlan:
      !hitCap && mergedFix.length > 0
        ? { items: mergedFix, targetedOnly: true }
        : nextState.fixPlan,
    metadata: {
      ...nextState.metadata,
      critiqueCap: hitCap,
      critiqueClassification: {
        deterministic: detFixes.length,
        sectionRedraft: sectionRedraft.length,
        planChange: planChange.length,
      },
    },
  };
}
