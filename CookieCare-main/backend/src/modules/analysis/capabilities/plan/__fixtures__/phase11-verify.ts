// Plan-Phase 11 manual verification script — ambiguity → ASK routing.
// Tests that overlapping proposition patterns trigger an ASK clarification.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase11-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { buildInventory } from "../build-inventory.js";
import {
  generatePropositions,
  generateS2Propositions,
  detectPropositionAmbiguity,
} from "../generate-propositions.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisSkillConfig } from "../../../skills/runtime/catalog/types.js";
import type { InventoryItem } from "../build-inventory.js";

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
      sessionId: "plan_phase11_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase11_verify", documents: [] },
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

  // ========== CASE A: Ambiguous (two patterns for same clause type) ==========
  console.log("=== CASE A: Ambiguous — two patterns overlap on limitation_of_liability ===");

  const ambiguousSkill: AnalysisSkillConfig = {
    skillId: "test/ambiguous-risk",
    axis: "topic",
    label: "Test ambiguous risk",
    version: "0.1.0",
    appliesToDocTypes: [],
    triggerPhrases: [],
    promptLibraryIds: [],
    clauseTypes: ["limitation_of_liability"],
    expectedClauses: [],
    riskCategories: [],
    regimeRules: [],
    defaultOperation: "risk_flag",
    propositionPatterns: [
      {
        id: "liability_cap_adequacy",
        clauseTypes: ["limitation_of_liability"],
        hypothesis: "The liability cap is inadequate.",
        proofStandard: "Check if the cap is below 12 months' fees.",
        priority: 90,
      },
      {
        id: "liability_exclusion_breadth",
        clauseTypes: ["limitation_of_liability"],
        hypothesis: "The liability exclusion clauses are too broad.",
        proofStandard: "Check if exclusions cover data breach and negligence.",
        priority: 85,
      },
    ],
  };

  const mockInventory: InventoryItem[] = [
    { clauseType: "limitation_of_liability", section: "§12", brief: "Liability cap", evidenceStatus: "found" },
    { clauseType: "termination", section: "§7", brief: "Termination rights", evidenceStatus: "found" },
  ];

  const stateA = baseState({
    request: {
      sessionId: "plan_phase11_verify",
      instruction: "What are the biggest weaknesses?",
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
    },
  });
  stateA.activeSkills = [ambiguousSkill];
  stateA.intent = { operation: "risk_flag" } as any;

  const ambiguity = detectPropositionAmbiguity(stateA, mockInventory);
  if (ambiguity) {
    console.log("  ASK triggered:");
    console.log(`    field: ${ambiguity.field}`);
    console.log(`    question: ${ambiguity.question}`);
    console.log(`    severity: ${ambiguity.severity}`);
    console.log(`    options: ${ambiguity.options?.join(", ")}`);
    console.log("  PASS — ambiguous case correctly routes to ASK");
  } else {
    console.log("  FAIL — expected ASK but no ambiguity detected");
  }

  const resultA = await generatePropositions(stateA, mockInventory);
  console.log(`  Propositions still generated: ${resultA.propositions.length}`);
  console.log(`  Ambiguity attached: ${resultA.ambiguity ? "yes" : "no"}`);

  // ========== CASE B: Non-ambiguous (normal vendor-risk patterns) ==========
  console.log("\n=== CASE B: Non-ambiguous — normal vendor-risk patterns, no overlap ===");

  const stateB = baseState({
    request: {
      sessionId: "plan_phase11_verify",
      instruction: "What are the biggest weaknesses in this contract?",
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(stateB);
  const targetDocId = classified.documentRoleResolution?.targetDocId ?? "dpa";
  const { state: inventoried, inventory } = await buildInventory(classified, targetDocId);

  const ambiguityB = detectPropositionAmbiguity(inventoried, inventory);
  const resultB = await generatePropositions(inventoried, inventory);

  if (!ambiguityB) {
    console.log("  No ambiguity detected — correct for non-overlapping patterns");
    console.log(`  Propositions generated: ${resultB.propositions.length}`);
    console.log("  PASS — no false-positive ASK trigger");
  } else {
    console.log("  FAIL — false positive ASK on non-ambiguous case");
    console.log(`    question: ${ambiguityB.question}`);
  }

  console.log(`\n${"=".repeat(40)}`);
  const allPassed = ambiguity && !ambiguityB;
  console.log(allPassed ? "BOTH CASES CORRECT" : "SOME CASES FAILED");
}

main().catch((err) => {
  console.error("[phase11-verify] failed:", err);
  process.exitCode = 1;
});
