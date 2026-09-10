// Plan-Phase 0 baseline harness.
//
// Runs the LEGACY classifyIntent + buildPlan implementation against 5 fixed
// asks and saves each `{ intent, clarificationRequest, plan }` snapshot to
// `baseline-<name>-BEFORE.json`. These are the real diff targets every later
// PLAN phase is checked against — see docs-legacy/rebuild/IMPLEMENTATION_PHASE_PLAN.md.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/baseline-runner.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildPlan } from "../build-plan.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DOWNLOADS = "C:/Users/abhinav.yadav_randst/Downloads";

async function loadDocxText(absPath: string): Promise<string> {
  const buf = readFileSync(absPath);
  return extractText(buf, DOCX_MIME);
}

// No real negotiation playbook doc was found on disk (the only "playbook"
// asset in Downloads is an AI-prompt-engineering repository, not a set of
// negotiated positions) — so this is a short, clearly-synthetic fixture
// authored for Plan-Phase 0 only, in the shape a real playbook would take.
const SYNTHETIC_PLAYBOOK_TEXT = `Vendor DPA Negotiation Playbook (fixture)

1. Subprocessor changes: Vendor must give Customer at least 30 days' prior
   written notice before engaging a new subprocessor, with the right to
   object on reasonable data-protection grounds.
2. Liability cap: Aggregate liability for data-protection breaches must not
   be capped below 12 months' fees paid under the agreement.
3. Breach notification: Vendor must notify Customer of a confirmed personal
   data breach within 48 hours of becoming aware of it.
4. Audit rights: Customer (or an independent auditor on Customer's behalf)
   must be permitted to audit Vendor's data-processing controls at least
   once per year, on reasonable notice.
5. Data return/deletion: On termination, Vendor must return or delete all
   Customer personal data within 30 days, and certify deletion in writing.
`;

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "plan_phase0_baseline",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase0_baseline", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
    ...overrides,
  };
}

async function runPlanOnly(state: AnalysisState): Promise<AnalysisState> {
  let next = await classifyIntent(state);
  if (next.intent?.operation === "out_of_scope" || next.declineMessage) {
    return next;
  }
  next = await buildPlan(next);
  return next;
}

function snapshot(state: AnalysisState) {
  return {
    intent: state.intent ?? null,
    clarificationRequest: state.clarificationRequest ?? null,
    declineMessage: state.declineMessage ?? null,
    plan: state.plan ?? null,
  };
}

function save(name: string, data: unknown) {
  const outPath = path.join(__dirname, `baseline-${name}-BEFORE.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[baseline-runner] wrote ${outPath}`);
}

async function main() {
  const ciscoDpaText = await loadDocxText(
    path.join(
      DOWNLOADS,
      "cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx"
    )
  );

  // 1. GDPR Article 28 compliance review (control case — expected to work)
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase0_baseline",
        instruction: "Perform a GDPR Article 28 compliance review of this DPA.",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
    });
    const result = await runPlanOnly(state);
    save("gdpr-art28", snapshot(result));
  }

  // 2. Biggest weaknesses / negotiation recommendation (expected gap)
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase0_baseline",
        instruction:
          "What are the biggest weaknesses in this contract? What should I negotiate?",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
    });
    const result = await runPlanOnly(state);
    save("biggest-weaknesses", snapshot(result));
  }

  // 3. "Is termination balanced?" (expected: no paired decomposition)
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase0_baseline",
        instruction: "Is termination balanced in this agreement?",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
    });
    const result = await runPlanOnly(state);
    save("termination-balanced", snapshot(result));
  }

  // 4. Playbook alignment (expected: zero propositions from the playbook)
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase0_baseline",
        instruction: "Does this agreement align with our playbook?",
        documentIds: ["dpa", "playbook"],
        documentTexts: { dpa: ciscoDpaText, playbook: SYNTHETIC_PLAYBOOK_TEXT },
        documentTitles: {
          dpa: "Cisco Master Data Protection Agreement",
          playbook: "Vendor DPA Negotiation Playbook (fixture)",
        },
        documentRoles: { dpa: "target", playbook: "reference" },
      },
    });
    const result = await runPlanOnly(state);
    save("playbook-alignment", snapshot(result));
  }

  // 5. Follow-up chain — 3 turns, carrying priorAnalysis forward each time
  {
    const turns: unknown[] = [];

    const turn1State = baseState({
      request: {
        sessionId: "plan_phase0_baseline_followup",
        instruction: "Analyze GDPR compliance.",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
    });
    const turn1Result = await runPlanOnly(turn1State);
    turns.push({ turn: 1, instruction: turn1State.request.instruction, ...snapshot(turn1Result) });

    const turn2State = baseState({
      request: {
        sessionId: "plan_phase0_baseline_followup",
        instruction: "Focus on subprocessors.",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
      priorAnalysis: {
        instruction: turn1State.request.instruction,
        intent: turn1Result.intent,
        findings: turn1Result.findings ?? [],
        requirementAssessments: turn1Result.requirementAssessments ?? [],
      },
    });
    const turn2Result = await runPlanOnly(turn2State);
    turns.push({ turn: 2, instruction: turn2State.request.instruction, ...snapshot(turn2Result) });

    const turn3State = baseState({
      request: {
        sessionId: "plan_phase0_baseline_followup",
        instruction: "Can we object to a subprocessor change?",
        documentIds: ["dpa"],
        documentTexts: { dpa: ciscoDpaText },
        documentTitles: { dpa: "Cisco Master Data Protection Agreement" },
      },
      priorAnalysis: {
        instruction: turn2State.request.instruction,
        intent: turn2Result.intent,
        findings: turn2Result.findings ?? [],
        requirementAssessments: turn2Result.requirementAssessments ?? [],
      },
    });
    const turn3Result = await runPlanOnly(turn3State);
    turns.push({ turn: 3, instruction: turn3State.request.instruction, ...snapshot(turn3Result) });

    save("followup-chain", turns);
  }

  console.log("[baseline-runner] done — 5 baseline files written.");
}

main().catch((err) => {
  console.error("[baseline-runner] failed:", err);
  process.exitCode = 1;
});
