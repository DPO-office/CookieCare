// Plan-Phase 6 manual verification script — S4 ad hoc proposition authoring
// for a novel ask no S1/S2 source covers. Not a fixture asset; run once by
// hand and read the printed output.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase6-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildInventory } from "../build-inventory.js";
import { generatePropositions } from "../generate-propositions.js";
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
      sessionId: "plan_phase6_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase6_verify", documents: [] },
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
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  const novelAsk = "Does this DPA say anything about what happens if Cisco is acquired by another company?";

  const state = baseState({
    request: {
      sessionId: "plan_phase6_verify",
      instruction: novelAsk,
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(state);
  console.log("instruction:", novelAsk);
  console.log("intent.operation:", classified.intent?.operation);
  console.log("intent.partyPerspective:", classified.intent?.partyPerspective);

  const { state: withInventory, inventory } = await buildInventory(classified, "dpa");
  console.log(
    "\ninventory clause types found:",
    [...new Set(inventory.map((i) => i.clauseType))].join(", ")
  );

  const { propositions } = await generatePropositions(withInventory, inventory);

  console.log(`\n=========== GENERATED PROPOSITIONS (${propositions.length}) ===========`);
  for (const p of propositions) {
    console.log(`\n[${p.source}] priority=${p.priority} partyPerspective=${p.partyPerspective}`);
    console.log("hypothesis:", p.hypothesis);
    console.log("proofStandard:", p.proofStandard);
  }
}

main().catch((err) => {
  console.error("[phase6-verify] failed:", err);
  process.exitCode = 1;
});
