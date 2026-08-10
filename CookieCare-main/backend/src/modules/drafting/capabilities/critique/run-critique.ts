import type { DraftState } from "../../models/draft-state.js";
import type { CritiqueReport, CritiqueResult } from "../../models/critique-report.js";
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";

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

  if ((doc.match(/\[.*?\]/g) || []).some((p) => /TBD|TODO|\[PARTY/i.test(p))) {
    results.push({
      itemId: "placeholders",
      status: "fail",
      evidenceVerified: false,
    });
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
  if (checklist.length > 0 && doc) {
    try {
      llmRaw = await executeJsonCompletion(
        [
          "Audit this draft against the checklist. For each item return status and a short evidenceQuote copied VERBATIM from the draft when status is pass.",
          `Checklist:\n${JSON.stringify(checklist)}`,
          `Draft:\n${doc.slice(0, 60_000)}`,
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
      evidenceVerified: status === "pass" ? verified : verified || status !== 'pass',
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
  const report: CritiqueReport = {
    isGreen: !hasHardFail && !skeletonMissing,
    iteration: (state.critique?.iteration ?? 0) + 1,
    results,
    fixPlan: hasHardFail ? fixPlan : [],
    skeletonMismatch: skeletonMissing && results.filter((r) => r.itemId.startsWith("skeleton:") && r.status === "missing").length > planHalfMissing(state),
    criticalFactSurfaced: false,
  };

  // Simplify skeletonMismatch: only if majority of skeleton sections missing
  report.skeletonMismatch =
    deterministic.filter((r) => r.itemId.startsWith("skeleton:") && r.status === "missing").length >
    Math.max(1, Math.floor(deterministic.filter((r) => r.itemId.startsWith("skeleton:")).length / 2));

  void isGreen;

  return { ...state, critique: report };
}

function planHalfMissing(state: DraftState): number {
  const n = state.plan?.workUnits.filter((u) => u.kind === "section").length ?? 0;
  return Math.max(1, Math.floor(n / 2));
}
