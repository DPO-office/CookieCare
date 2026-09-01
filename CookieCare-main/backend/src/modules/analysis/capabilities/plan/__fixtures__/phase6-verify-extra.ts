// Plan-Phase 6 extra manual spot-checks — two more novel asks, run at the
// user's request before moving to Plan-Phase 7. Not a fixture asset.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase6-verify-extra.ts
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
      sessionId: "plan_phase6_verify_extra",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase6_verify_extra", documents: [] },
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

async function runAsk(dpaText: string, instruction: string) {
  const state = baseState({
    request: {
      sessionId: "plan_phase6_verify_extra",
      instruction,
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(state);
  console.log("instruction:", instruction);
  console.log("intent.operation:", classified.intent?.operation);

  const { state: withInventory, inventory } = await buildInventory(classified, "dpa");
  const { propositions } = await generatePropositions(withInventory, inventory);

  console.log(`GENERATED PROPOSITIONS (${propositions.length})`);
  for (const p of propositions) {
    console.log(`\n[${p.source}] priority=${p.priority} partyPerspective=${p.partyPerspective}`);
    console.log("hypothesis:", p.hypothesis);
    console.log("proofStandard:", p.proofStandard);
  }
  console.log("\n" + "=".repeat(80) + "\n");
}

async function main() {
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  console.log("=========== SCENARIO A: audit cost allocation ===========\n");
  await runAsk(dpaText, "Who bears the cost of an audit if we request one under this DPA?");

  console.log("=========== SCENARIO B: dispute jurisdiction (not in doc at all) ===========\n");
  await runAsk(
    dpaText,
    "Does this agreement specify which courts have jurisdiction over disputes between the parties?"
  );
}

main().catch((err) => {
  console.error("[phase6-verify-extra] failed:", err);
  process.exitCode = 1;
});
