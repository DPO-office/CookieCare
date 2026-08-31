// Plan-Phase 2 manual verification script — document-role resolution (§5.1)
// and party-perspective resolution (§5.2). Not a fixture asset; run once by
// hand and read the printed output, per the phase's exit gate.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase2-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildPlan } from "../build-plan.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOWNLOADS = "C:/Users/abhinav.yadav_randst/Downloads";

async function loadDocxText(absPath: string): Promise<string> {
  return extractText(readFileSync(absPath), DOCX_MIME);
}

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "plan_phase2_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase2_verify", documents: [] },
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
  if (next.intent?.operation === "out_of_scope" || next.declineMessage) return next;
  next = await buildPlan(next);
  return next;
}

async function main() {
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );
  const ndaText = await loadDocxText(
    `${DOWNLOADS}/mutual-nda-meridian-health-analytics-and-apex-software-solut.docx`
  );

  console.log("\n=========== CHECK 1: compare two agreements ===========");
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase2_verify",
        instruction: "Compare these two agreements.",
        documentIds: ["dpa", "nda"],
        documentTexts: { dpa: dpaText, nda: ndaText },
        documentTitles: { dpa: "Cisco DPA", nda: "Meridian/Apex Mutual NDA" },
      },
    });
    const result = await runPlanOnly(state);
    console.log("intent.operation:", result.intent?.operation);
    console.log(
      "documentRoleResolution:",
      JSON.stringify(result.plan?.documentRoleResolution ?? result.documentRoleResolution, null, 2)
    );
  }

  console.log("\n=========== CHECK 2: what should I negotiate (DPA) ===========");
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase2_verify",
        instruction: "What should I negotiate in this agreement?",
        documentIds: ["dpa"],
        documentTexts: { dpa: dpaText },
        documentTitles: { dpa: "Cisco DPA" },
      },
    });
    const result = await runPlanOnly(state);
    console.log("intent.operation:", result.intent?.operation);
    console.log("intent.partyPerspective:", result.intent?.partyPerspective);
    console.log(
      "plan.missingClarifications:",
      JSON.stringify(result.plan?.missingClarifications, null, 2)
    );
  }

  console.log("\n=========== CHECK 3: ambiguous perspective (no party framing) ===========");
  {
    const ambiguousText = `Statement of Work — Cloud Migration Services

    This document describes the scope of work for migrating application
    servers to the cloud. Tasks include inventory, staging, cutover, and
    validation. Timeline: 6 weeks. Deliverables are listed in Schedule A.
    What should we negotiate to make this more favorable to us?`;
    const state = baseState({
      request: {
        sessionId: "plan_phase2_verify",
        instruction: "What should we negotiate to make this more favorable to us?",
        documentIds: ["sow"],
        documentTexts: { sow: ambiguousText },
        documentTitles: { sow: "Statement of Work (no party framing)" },
      },
    });
    const result = await runPlanOnly(state);
    console.log("intent.operation:", result.intent?.operation);
    console.log("intent.partyPerspective:", result.intent?.partyPerspective);
    console.log(
      "plan.missingClarifications:",
      JSON.stringify(result.plan?.missingClarifications, null, 2)
    );
  }
}

main().catch((err) => {
  console.error("[phase2-verify] failed:", err);
  process.exitCode = 1;
});
