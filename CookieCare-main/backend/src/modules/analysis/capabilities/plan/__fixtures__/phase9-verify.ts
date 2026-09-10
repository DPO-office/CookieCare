// Plan-Phase 9 manual verification script — exhaustiveness parsing + priority trim.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase9-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent, parseExhaustiveness } from "../classify-intent.js";
import { buildInventory } from "../build-inventory.js";
import { generatePropositions, generateS2Propositions } from "../generate-propositions.js";
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
      sessionId: "plan_phase9_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase9_verify", documents: [] },
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
  // --- Unit tests for parseExhaustiveness ---
  console.log("=== parseExhaustiveness unit tests ===");
  const cases: [string, string | undefined][] = [
    ["What are the top 3 risks?", "user_capped:3"],
    ["Give me the top 5 weaknesses", "user_capped:5"],
    ["Just the first 2 issues", "user_capped:2"],
    ["Show me only 3 biggest concerns", "user_capped:3"],
    ["3 most important risks", "user_capped:3"],
    ["Analyze this contract thoroughly", undefined],
    ["What are the risks?", undefined],
    ["GDPR Article 28 compliance review", undefined],
  ];
  for (const [input, expected] of cases) {
    const result = parseExhaustiveness(input);
    const actual = result ? `${result.mode}:${result.limit}` : undefined;
    const pass = actual === expected ? "PASS" : "FAIL";
    console.log(`  ${pass} "${input}" → ${actual ?? "(none)"} (expected: ${expected ?? "(none)"})`);
  }

  // --- Full pipeline test ---
  console.log("\n=== Full pipeline: 'What are the top 2 biggest weaknesses in this contract?' ===");
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  const state = baseState({
    request: {
      sessionId: "plan_phase9_verify",
      instruction: "What are the top 2 biggest weaknesses in this contract?",
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(state);
  console.log("intent.operation:", classified.intent?.operation);
  console.log("intent.exhaustiveness:", JSON.stringify(classified.intent?.exhaustiveness));

  const targetDocId = classified.documentRoleResolution?.targetDocId ?? "dpa";
  const { state: inventoried, inventory } = await buildInventory(classified, targetDocId);
  console.log(`Inventory: ${inventory.length} clause types`);

  // Show UNTRIMMED list first
  const untrimmed = generateS2Propositions(inventoried, inventory);
  console.log(`\n--- UNTRIMMED S2 propositions (${untrimmed.length}) ---`);
  for (const p of untrimmed) {
    console.log(`  priority=${p.priority} hypothesis="${p.hypothesis.slice(0, 80)}..."`);
  }

  // Show TRIMMED list
  const { propositions: trimmed } = await generatePropositions(inventoried, inventory);
  console.log(`\n--- TRIMMED propositions (${trimmed.length}) ---`);
  for (const p of trimmed) {
    console.log(`  priority=${p.priority} hypothesis="${p.hypothesis}"`);
    console.log(`  proofStandard: ${p.proofStandard.slice(0, 120)}...`);
  }

  // Verification
  const ex = inventoried.intent?.exhaustiveness;
  if (ex?.mode === "user_capped" && ex.limit) {
    if (trimmed.length <= ex.limit) {
      console.log(`\nRESULT: Correctly trimmed to ${trimmed.length} (limit=${ex.limit})`);
      if (untrimmed.length > trimmed.length) {
        console.log(`  Dropped ${untrimmed.length - trimmed.length} lower-priority propositions`);
        const keptPriorities = trimmed.map((p) => p.priority);
        const droppedPriorities = untrimmed
          .filter((p) => !trimmed.some((t) => t.hypothesis === p.hypothesis))
          .map((p) => p.priority);
        const correctTrim = droppedPriorities.every((dp) =>
          keptPriorities.every((kp) => kp >= dp)
        );
        console.log(`  Trim by priority correct: ${correctTrim}`);
      }
    } else {
      console.log(`\nRESULT: FAIL — got ${trimmed.length}, expected at most ${ex.limit}`);
    }
  } else {
    console.log("\nRESULT: FAIL — exhaustiveness not parsed from instruction");
  }
}

main().catch((err) => {
  console.error("[phase9-verify] failed:", err);
  process.exitCode = 1;
});
