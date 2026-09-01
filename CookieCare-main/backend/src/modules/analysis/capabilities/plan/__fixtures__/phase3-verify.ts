// Plan-Phase 3 manual verification script — frame-fit check (§5.3). Not a
// fixture asset; run once by hand and read the printed output.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase3-verify.ts
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
      sessionId: "plan_phase3_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase3_verify", documents: [] },
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

  console.log("\n=========== CHECK A: NDA asked about GDPR Art 28 (mismatch expected) ===========");
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase3_verify",
        instruction: "Perform a GDPR Article 28 compliance review of this agreement.",
        documentIds: ["nda"],
        documentTexts: { nda: ndaText },
        documentTitles: { nda: "Meridian/Apex Mutual NDA" },
      },
    });
    const result = await runPlanOnly(state);
    console.log("intent.docTypeHint:", result.intent?.docTypeHint);
    console.log("intent.standard:", result.intent?.standard);
    console.log(
      "plan.missingClarifications:",
      JSON.stringify(result.plan?.missingClarifications, null, 2)
    );
  }

  console.log("\n=========== CHECK B: DPA asked about GDPR Art 28 (matched — should be unaffected) ===========");
  {
    const state = baseState({
      request: {
        sessionId: "plan_phase3_verify",
        instruction: "Perform a GDPR Article 28 compliance review of this DPA.",
        documentIds: ["dpa"],
        documentTexts: { dpa: dpaText },
        documentTitles: { dpa: "Cisco DPA" },
      },
    });
    const result = await runPlanOnly(state);
    console.log("intent.docTypeHint:", result.intent?.docTypeHint);
    console.log("intent.standard:", result.intent?.standard);
    console.log(
      "plan.missingClarifications:",
      JSON.stringify(result.plan?.missingClarifications, null, 2)
    );
  }
}

main().catch((err) => {
  console.error("[phase3-verify] failed:", err);
  process.exitCode = 1;
});
