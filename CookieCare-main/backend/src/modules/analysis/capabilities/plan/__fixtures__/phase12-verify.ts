// Plan-Phase 12 manual verification script — cluster tagging.
// Confirms related propositions are grouped for compounding-risk checks.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase12-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
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
      sessionId: "plan_phase12_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase12_verify", documents: [] },
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
  console.log("=== Plan-Phase 12: Cluster tagging on propositions ===\n");

  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  const state = baseState({
    request: {
      sessionId: "plan_phase12_verify",
      instruction: "What are the biggest weaknesses in this contract?",
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  const classified = await classifyIntent(state);
  const targetDocId = classified.documentRoleResolution?.targetDocId ?? "dpa";
  const { state: inventoried, inventory } = await buildInventory(classified, targetDocId);

  const s2 = generateS2Propositions(inventoried, inventory);
  console.log(`S2 propositions: ${s2.length}\n`);

  for (const p of s2) {
    console.log(`  [${p.source}] priority=${p.priority} clusterId=${p.clusterId ?? "(none)"}`);
    console.log(`    hypothesis: ${p.hypothesis}`);
  }

  // Check clustering
  const clusters = new Map<string, typeof s2>();
  const unclustered: typeof s2 = [];
  for (const p of s2) {
    if (p.clusterId) {
      const arr = clusters.get(p.clusterId) ?? [];
      arr.push(p);
      clusters.set(p.clusterId, arr);
    } else {
      unclustered.push(p);
    }
  }

  console.log("\n--- CLUSTER SUMMARY ---");
  for (const [clusterId, members] of clusters) {
    console.log(`  ${clusterId}: ${members.length} propositions`);
    for (const m of members) {
      console.log(`    - ${m.hypothesis.slice(0, 60)}...`);
    }
  }
  if (unclustered.length > 0) {
    console.log(`  (unclustered): ${unclustered.length} propositions`);
    for (const m of unclustered) {
      console.log(`    - ${m.hypothesis.slice(0, 60)}...`);
    }
  }

  // Verification: liability and termination should be in different clusters
  // (risk_exposure vs exit_and_control), audit_rights in data_governance
  const liabilityCluster = s2.find((p) => p.hypothesis.includes("liability"))?.clusterId;
  const terminationCluster = s2.find((p) => p.hypothesis.includes("termination"))?.clusterId;
  const auditCluster = s2.find((p) => p.hypothesis.includes("audit"))?.clusterId;

  console.log("\n--- EXPECTED CLUSTERING ---");
  console.log(`  liability → ${liabilityCluster} (expected: risk_exposure)`);
  console.log(`  termination → ${terminationCluster} (expected: exit_and_control)`);
  console.log(`  audit → ${auditCluster} (expected: data_governance)`);

  const correct =
    liabilityCluster === "risk_exposure" &&
    terminationCluster === "exit_and_control" &&
    auditCluster === "data_governance";

  console.log(`\n${correct ? "PASS" : "FAIL"} — clustering ${correct ? "matches" : "does not match"} expected grouping`);
}

main().catch((err) => {
  console.error("[phase12-verify] failed:", err);
  process.exitCode = 1;
});
