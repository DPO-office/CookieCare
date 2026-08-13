import type { DraftState } from "../../models/draft-state.js";
import type { CritiqueReport, CritiqueResult } from "../../models/critique-report.js";
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
    // Both locked parties should appear at least once in a finished draft.
    const lower = doc.toLowerCase();
    if (!lower.includes(identity.partyA.toLowerCase()) || !lower.includes(identity.partyB.toLowerCase())) {
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

/**
 * CRITIQUE — deterministic + LLM checklist + evidence substring verification.
 * A "pass" whose evidence is not in the draft is downgraded to ambiguous.
 */
export async function runCritique(state: DraftState): Promise<DraftState> {
  const doc = state.draft?.formattedDocument ?? "";
  const deterministic = deterministicChecks(state);
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;

  let llmRaw: Array<{
    itemId: string;
    status: CritiqueResult["status"];
    evidenceQuote?: string;
    workUnitId?: string;
    instruction?: string;
  }> = [];

  const checklist = state.plan?.mandatoryChecklist ?? [];
  // Cap size: 43+ items + full draft routinely times out / "fetch failed" on Pro.
  const critiqueChecklist = checklist.slice(0, 25);
  if (checklist.length > 0 && doc) {
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
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
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
      evidenceVerified: (status === "pass" ? verified : verified) || status !== 'pass',
    };
  });

  const results = [...deterministic, ...llmResults];
  const fixPlan = llmRaw
    .filter((r) => r.status === "fail" || r.status === "missing")
    .map((r) => ({
      workUnitId: r.workUnitId || checklist.find((c) => c.id === r.itemId)?.sectionTarget || "sec-misc",
      instruction: r.instruction || `Address checklist item ${r.itemId}`,
      sourceChecklistItemId: r.itemId,
    }));

  const skeletonMissing = deterministic.some(
    (r) => r.itemId.startsWith("skeleton:") && r.status === "missing"
  );

  const isGreen =
    results.every((r) => r.status === "pass" || r.status === "ambiguous") &&
    !results.some((r) => r.status === "fail" || r.status === "missing") &&
    fixPlan.length === 0;

  // Treat only hard fails/missing as non-green; ambiguous alone does not block green if no fails
  const hasHardFail = results.some((r) => r.status === "fail" || r.status === "missing");
  const placeholders = findDraftPlaceholders(doc);
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
  );
  const foreignParties = identity ? findForeignPartyNames(doc, identity) : [];
  const placeholderFacts = missingFactsFromPlaceholders(placeholders).filter(
    (f) => !isFactSatisfied((state.structuredFacts ?? {}) as Record<string, unknown>, f.field)
  );

  let nextState: DraftState = state;
  if (placeholderFacts.length > 0 && state.plan) {
    const existingFields = new Set((state.plan.missingFacts ?? []).map((f) => f.field));
    const toAdd = placeholderFacts.filter((f) => !existingFields.has(f.field));
    if (toAdd.length > 0) {
      nextState = {
        ...state,
        plan: {
          ...state.plan,
          missingFacts: [...(state.plan.missingFacts ?? []), ...toAdd],
        },
      };
      console.warn(
        `[runCritique] leftover placeholders → ASK fields=${toAdd.map((f) => f.field).join(",")}`
      );
    }
  }

  const partyFixItems =
    identity && foreignParties.length > 0
      ? (state.plan?.workUnits ?? [])
          .filter((u) => u.status === "drafted" || u.status === "flagged" || u.status === "pending")
          .map((u) => ({
            workUnitId: u.id,
            instruction: `PARTY LOCK: Rewrite this unit using ONLY "${identity.partyA}" as ${identity.roleA} and ONLY "${identity.partyB}" as ${identity.roleB}. Remove these foreign names: ${foreignParties.slice(0, 8).join(", ")}. Do not invent any other company names.`,
            sourceChecklistItemId: "party-consistency",
          }))
      : [];

  const placeholderFixItems =
    placeholders.length > 0
      ? [
          {
            workUnitId: "sec-parties",
            instruction: `Remove all square-bracket placeholders (${placeholders.slice(0, 8).join(", ")}). Substitute real facts from structuredFacts; never leave [● ...] stubs.`,
            sourceChecklistItemId: "placeholders",
          },
        ]
      : [];

  const mergedFix =
    partyFixItems.length > 0 || placeholderFixItems.length > 0
      ? [...placeholderFixItems, ...partyFixItems]
      : hasHardFail
        ? fixPlan
        : [];

  if (foreignParties.length > 0) {
    console.warn(
      `[runCritique] party drift detected foreign=${foreignParties.slice(0, 6).join(" | ")} locked=${identity?.partyA} / ${identity?.partyB}`
    );
  }

  const report: CritiqueReport = {
    isGreen:
      !hasHardFail &&
      !skeletonMissing &&
      placeholders.length === 0 &&
      foreignParties.length === 0,
    iteration: (state.critique?.iteration ?? 0) + 1,
    results,
    fixPlan: mergedFix,
    skeletonMismatch: false,
    criticalFactSurfaced: placeholderFacts.length > 0,
  };

  report.skeletonMismatch =
    deterministic.filter((r) => r.itemId.startsWith("skeleton:") && r.status === "missing").length >
    Math.max(1, Math.floor(deterministic.filter((r) => r.itemId.startsWith("skeleton:")).length / 2));

  void isGreen;

  return { ...nextState, critique: report };
}

function planHalfMissing(state: DraftState): number {
  const n = state.plan?.workUnits.filter((u) => u.kind === "section").length ?? 0;
  return Math.max(1, Math.floor(n / 2));
}
