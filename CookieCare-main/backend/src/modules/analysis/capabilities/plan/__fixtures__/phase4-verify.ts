// Plan-Phase 4 manual verification script — inventory pass (§4 step 8a). Not
// a fixture asset; run once by hand and read the printed output.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase4-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildInventory } from "../build-inventory.js";
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
      sessionId: "plan_phase4_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase4_verify", documents: [] },
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

async function inventoryFor(instruction: string, docId: string, text: string, title: string) {
  const state = baseState({
    request: {
      sessionId: "plan_phase4_verify",
      instruction,
      documentIds: [docId],
      documentTexts: { [docId]: text },
      documentTitles: { [docId]: title },
    },
  });
  const classified = await classifyIntent(state);
  const { inventory } = await buildInventory(classified, docId);
  return inventory;
}

async function main() {
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );
  const ndaText = await loadDocxText(
    `${DOWNLOADS}/mutual-nda-meridian-health-analytics-and-apex-software-solut.docx`
  );

  console.log("\n=========== INVENTORY: Cisco DPA ===========");
  const dpaInventory = await inventoryFor(
    "What are the biggest weaknesses in this contract?",
    "dpa",
    dpaText,
    "Cisco DPA"
  );
  for (const item of dpaInventory) {
    console.log(`${item.clauseType.padEnd(35)} ${item.section.padEnd(20)} [${item.evidenceStatus}] ${item.brief.replace(/\s+/g, " ")}`);
  }

  console.log("\n=========== INVENTORY: Meridian/Apex NDA ===========");
  const ndaInventory = await inventoryFor(
    "What are the biggest weaknesses in this contract?",
    "nda",
    ndaText,
    "Meridian/Apex Mutual NDA"
  );
  for (const item of ndaInventory) {
    console.log(`${item.clauseType.padEnd(35)} ${item.section.padEnd(20)} [${item.evidenceStatus}] ${item.brief.replace(/\s+/g, " ")}`);
  }
}

main().catch((err) => {
  console.error("[phase4-verify] failed:", err);
  process.exitCode = 1;
});
