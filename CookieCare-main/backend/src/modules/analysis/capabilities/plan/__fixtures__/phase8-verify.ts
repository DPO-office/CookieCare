// Plan-Phase 8 manual verification script — reasoning-ask decomposition.
// Checks that comparison-shaped asks produce paired sub-propositions.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase8-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildInventory } from "../build-inventory.js";
import { generatePropositions, decomposeReasoningAsk } from "../generate-propositions.js";
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
      sessionId: "plan_phase8_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase8_verify", documents: [] },
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

async function runCase(label: string, instruction: string, dpaText: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`CASE: ${label}`);
  console.log(`Instruction: "${instruction}"`);
  console.log("=".repeat(60));

  const state = baseState({
    request: {
      sessionId: "plan_phase8_verify",
      instruction,
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(state);
  console.log("intent.operation:", classified.intent?.operation);

  const targetDocId =
    classified.documentRoleResolution?.targetDocId ?? "dpa";
  const { state: inventoried, inventory } = await buildInventory(
    classified,
    targetDocId
  );
  console.log(`Inventory: ${inventory.length} clause types found`);

  const { propositions } = await generatePropositions(inventoried, inventory);

  console.log(`\nPropositions generated: ${propositions.length}`);
  for (const p of propositions) {
    console.log(`\n  [${p.source}] priority=${p.priority}`);
    console.log(`  hypothesis: ${p.hypothesis}`);
    console.log(`  proofStandard: ${p.proofStandard}`);
    if (p.compareGroup) {
      console.log(`  compareGroup: ${p.compareGroup}`);
      console.log(`  compareRole: ${p.compareRole}`);
    }
  }

  // Check pairing
  const grouped = new Map<string, typeof propositions>();
  for (const p of propositions) {
    if (p.compareGroup) {
      const arr = grouped.get(p.compareGroup) ?? [];
      arr.push(p);
      grouped.set(p.compareGroup, arr);
    }
  }

  if (grouped.size > 0) {
    console.log("\n--- COMPARE GROUPS ---");
    for (const [group, members] of grouped) {
      console.log(`  ${group}: ${members.length} members (${members.map((m) => m.compareRole).join(", ")})`);
    }
    console.log("RESULT: Paired sub-propositions generated correctly.");
  } else {
    console.log("\nRESULT: No paired sub-propositions found.");
  }
}

async function main() {
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  // Primary test case from the spec
  await runCase(
    "Termination balance",
    "Is termination balanced?",
    dpaText
  );

  // Additional reasoning-ask cases
  await runCase(
    "Liability fairness",
    "Is the liability cap fair and balanced for both parties?",
    dpaText
  );

  await runCase(
    "Non-comparison ask (should NOT decompose)",
    "What are the biggest weaknesses in this contract?",
    dpaText
  );
}

main().catch((err) => {
  console.error("[phase8-verify] failed:", err);
  process.exitCode = 1;
});
