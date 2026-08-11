import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CritiqueReport,
  CritiqueResult,
  FixItem,
} from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";
import { isRiskTaxonomyId } from "../../taxonomies/index.js";
import { getSpanFromState } from "../act/execute-act-plan.js";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * CRITIQUE — stricter than Drafting:
 * 1) locator existence 2) entailment 3) taxonomy 4) completeness 5) two-branch fix
 */
export async function runCritique(state: AnalysisState): Promise<AnalysisState> {
  const results: CritiqueResult[] = [];
  const fixPlan: FixItem[] = [];
  const findings = state.findings;
  const workUnits = state.plan?.workUnits ?? [];

  // 1+2 Existence + substring gate (quotedText must appear in resolved span or doc)
  for (const f of findings) {
    if (f.status === "absent_expected" || f.status === "insufficient_evidence") {
      results.push({
        itemId: `status:${f.findingId}`,
        status: "pass",
        evidenceVerified: true,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: `Explicit ${f.status} is a valid first-class state`,
      });
      continue;
    }

    if (!f.evidence.length && f.kind === "risk" && f.status === "present") {
      results.push({
        itemId: `evidence-missing:${f.findingId}`,
        status: "fail",
        evidenceVerified: false,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: "Present risk finding lacks EvidenceSpan",
      });
      if (f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Re-extract evidence for finding ${f.findingId}`,
          sourceItemId: f.findingId,
        });
      }
      continue;
    }

    for (const ev of f.evidence) {
      const resolved = getSpanFromState(state, ev.locator);
      const exists = resolved !== null;
      const quoteInSpan =
        exists &&
        (normalize(resolved!).includes(normalize(ev.quotedText)) ||
          normalize(ev.quotedText).includes(normalize(resolved!.slice(0, 80))));
      const doc = state.workspace.documents.find((d) => d.docId === ev.locator.docId);
      const quoteInDoc =
        doc && normalize(doc.fullText).includes(normalize(ev.quotedText));

      const verified = Boolean(exists && (quoteInSpan || quoteInDoc));
      results.push({
        itemId: `locator:${f.findingId}:${ev.locator.structuralPath}`,
        status: verified ? "pass" : "fail",
        evidenceQuote: ev.quotedText,
        evidenceVerified: verified,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: !exists
          ? "Locator does not resolve"
          : !verified
            ? "quotedText not found in document"
            : undefined,
      });

      if (!verified && f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Fix evidence for ${f.findingId}: locator/quote mismatch`,
          sourceItemId: f.findingId,
        });
      }
    }
  }

  // 3 Taxonomy conformance
  for (const f of findings) {
    if (f.kind === "risk" || f.kind === "compliance") {
      const ok = isRiskTaxonomyId(f.category);
      results.push({
        itemId: `taxonomy:${f.findingId}`,
        status: ok ? "pass" : "fail",
        evidenceVerified: ok,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: ok ? undefined : `Unknown category ${f.category}`,
      });
      if (!ok && f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Reclassify finding ${f.findingId} into risk taxonomy`,
          sourceItemId: f.findingId,
        });
      }
    }
  }

  // 4 Completeness — every scheduled work unit must have at least one Finding
  for (const wu of workUnits) {
    const has = findings.some((f) => f.workUnitId === wu.workUnitId);
    results.push({
      itemId: `complete:${wu.workUnitId}`,
      status: has ? "pass" : "missing",
      evidenceVerified: has,
      workUnitId: wu.workUnitId,
      detail: has ? undefined : "Silent gap — work unit produced no Finding",
    });
    if (!has) {
      fixPlan.push({
        workUnitId: wu.workUnitId,
        instruction: `Re-run ${wu.tool}; prior run produced no findings`,
        sourceItemId: `complete:${wu.workUnitId}`,
      });
    }
  }

  // 5 Entailment check (LLM) for present risk claims with evidence
  const entailCandidates = findings.filter(
    (f) => f.kind === "risk" && f.status === "present" && f.evidence.length > 0
  );
  if (entailCandidates.length > 0) {
    const entailResults = await runEntailment(state, entailCandidates);
    for (const r of entailResults) {
      results.push(r.result);
      if (r.fix) fixPlan.push(r.fix);
    }
  }

  const hasHardFail = results.some(
    (r) => r.status === "fail" || r.status === "missing"
  );

  // skeletonMismatch = intent/plan structure wrong (majority of work units missing findings)
  const completenessFails = results.filter(
    (r) => r.itemId.startsWith("complete:") && r.status === "missing"
  ).length;
  const skeletonMismatch =
    workUnits.length > 0 &&
    completenessFails > Math.max(1, Math.floor(workUnits.length / 2));

  const uniqueFixes = dedupeFixes(fixPlan);

  const report: CritiqueReport = {
    isGreen: !hasHardFail,
    iteration: (state.critique?.iteration ?? 0) + 1,
    results,
    fixPlan: hasHardFail && !skeletonMismatch ? uniqueFixes : skeletonMismatch ? [] : uniqueFixes,
    skeletonMismatch,
    criticalFactSurfaced: false,
  };

  return { ...state, critique: report };
}

async function runEntailment(
  state: AnalysisState,
  findings: Finding[]
): Promise<Array<{ result: CritiqueResult; fix?: FixItem }>> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        findingId: { type: "string" },
        entails: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["findingId", "entails"],
    },
  };

  try {
    const raw = await executeJsonCompletion<
      Array<{ findingId: string; entails: boolean; reason?: string }>
    >(
      [
        "For each finding, does the quoted evidence actually support (entail) the claim?",
        "Return entails=false if the quote is unrelated, contradictory, or insufficient.",
        JSON.stringify(
          findings.map((f) => ({
            findingId: f.findingId,
            claim: f.claim,
            quotedText: f.evidence[0]?.quotedText ?? "",
          }))
        ),
      ].join("\n\n"),
      "You verify entailment only. Do not invent new claims.",
      schema,
      LLMTask.CRITIQUE_CHECKLIST,
      LLMProvider.GEMINI,
      tracker
    );

    if (state.agent && tracker) {
      state.agent.tokensUsed = tracker.tokensUsed;
    }

    return raw.map((r) => {
      const f = findings.find((x) => x.findingId === r.findingId);
      const result: CritiqueResult = {
        itemId: `entail:${r.findingId}`,
        status: r.entails ? "pass" : "fail",
        evidenceVerified: r.entails,
        findingId: r.findingId,
        workUnitId: f?.workUnitId,
        detail: r.reason,
      };
      const fix =
        !r.entails && f?.workUnitId
          ? {
              workUnitId: f.workUnitId,
              instruction: `Evidence does not entail claim for ${r.findingId}; re-flag with supporting quote`,
              sourceItemId: r.findingId,
            }
          : undefined;
      return { result, fix };
    });
  } catch (err) {
    console.warn("[runCritique] entailment LLM failed; skipping:", err);
    return findings.map((f) => ({
      result: {
        itemId: `entail:${f.findingId}`,
        status: "ambiguous" as const,
        evidenceVerified: true,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: "Entailment check skipped (LLM unavailable)",
      },
    }));
  }
}

function dedupeFixes(fixes: FixItem[]): FixItem[] {
  const seen = new Set<string>();
  const out: FixItem[] = [];
  for (const f of fixes) {
    const key = `${f.workUnitId}:${f.sourceItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
