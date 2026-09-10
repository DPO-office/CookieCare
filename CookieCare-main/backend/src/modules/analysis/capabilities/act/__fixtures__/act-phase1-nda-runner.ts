// ACT-Phase 1 verification — real NDA document through the production
// pipeline. Checks whether raw Finding[] all carry requirementId, and
// whether the Cisco baseline is unchanged (mechanical stamping should not
// touch scoring/content).
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase1-nda-runner.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText } from "../../../../../utils/extractText.js";
import { defaultPacCapabilities } from "../../index.js";
import { PacController } from "../../../pac/controller.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      sessionId: "act_phase1_nda",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "act_phase1_nda", documents: [] },
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

async function main() {
  const ndaText = await loadDocxText(
    `${DOWNLOADS}/mutual-nda-meridian-health-analytics-and-apex-software-solut.docx`
  );

  const state = baseState({
    request: {
      sessionId: "act_phase1_nda",
      instruction:
        "Review this NDA for structural completeness and risk, from the perspective of the receiving party.",
      documentIds: ["nda"],
      documentTexts: { nda: ndaText },
      documentTitles: { nda: "Mutual NDA — Meridian/Apex" },
    },
  });

  console.log("Running full PAC pipeline on real NDA document...");
  const controller = new PacController(defaultPacCapabilities);
  const finalState = await controller.run(state);

  const findings = finalState.findings;
  const withReqId = findings.filter((f) => f.requirementId);
  const withoutReqId = findings.filter((f) => !f.requirementId);

  console.log(`\nTotal findings: ${findings.length}`);
  console.log(`With requirementId: ${withReqId.length}`);
  console.log(`Without requirementId: ${withoutReqId.length}`);

  if (withoutReqId.length > 0) {
    console.log("\n--- Findings MISSING requirementId ---");
    for (const f of withoutReqId) {
      console.log(
        `  [${f.kind}] findingId=${f.findingId} category=${f.category} status=${f.status} workUnitId=${f.workUnitId}`
      );
    }
  }

  const output = {
    capturedAt: new Date().toISOString(),
    ask: state.request.instruction,
    findingsCount: findings.length,
    withRequirementId: withReqId.length,
    withoutRequirementId: withoutReqId.length,
    findings,
    requirementAssessments: finalState.requirementAssessments,
  };

  const jsonPath = path.join(__dirname, "act-phase1-nda-result.json");
  writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nWrote ${jsonPath}`);
}

main().catch((err) => {
  console.error("[act-phase1-nda-runner] failed:", err);
  process.exitCode = 1;
});
