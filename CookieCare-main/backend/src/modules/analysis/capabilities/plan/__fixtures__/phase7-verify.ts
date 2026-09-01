// Plan-Phase 7 manual verification script — S3 playbook-as-source. Not a
// fixture asset; run once by hand and read the printed output.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase7-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyIntent } from "../classify-intent.js";
import { generateS3Propositions } from "../generate-propositions.js";
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

// Same synthetic playbook fixture established in Plan-Phase 0 — no real
// negotiation-playbook document exists in Downloads (only an AI-prompt
// repository, not a set of negotiated positions).
const SYNTHETIC_PLAYBOOK_TEXT = `Vendor DPA Negotiation Playbook (fixture)

1. Subprocessor changes: Vendor must give Customer at least 30 days' prior written notice before engaging a new subprocessor, with the right to object on reasonable data-protection grounds.
2. Liability cap: Aggregate liability for data-protection breaches must not be capped below 12 months' fees paid under the agreement.
3. Breach notification: Vendor must notify Customer of a confirmed personal data breach within 48 hours of becoming aware of it.
4. Audit rights: Customer (or an independent auditor on Customer's behalf) must be permitted to audit Vendor's data-processing controls at least once per year, on reasonable notice.
5. Data return/deletion: On termination, Vendor must return or delete all Customer personal data within 30 days, and certify deletion in writing.
`;

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "plan_phase7_verify",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "plan_phase7_verify", documents: [] },
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

  const state = baseState({
    request: {
      sessionId: "plan_phase7_verify",
      instruction: "Does this agreement align with our playbook?",
      documentIds: ["dpa", "playbook"],
      documentTexts: { dpa: dpaText, playbook: SYNTHETIC_PLAYBOOK_TEXT },
      documentTitles: {
        dpa: "Cisco DPA",
        playbook: "Vendor DPA Negotiation Playbook (fixture)",
      },
    },
  });

  const classified = await classifyIntent(state);
  console.log("intent.operation:", classified.intent?.operation);
  console.log(
    "documentRoleResolution:",
    JSON.stringify(classified.documentRoleResolution, null, 2)
  );

  const referenceDocId = classified.documentRoleResolution?.referenceDocId;
  if (!referenceDocId) {
    console.error("No reference doc resolved — cannot test S3 propositions.");
    return;
  }

  const { propositions } = await generateS3Propositions(classified, referenceDocId);

  console.log(`\n=========== GENERATED S3 PROPOSITIONS (${propositions.length}) ===========`);
  for (const p of propositions) {
    console.log(`\n[${p.source}] priority=${p.priority} partyPerspective=${p.partyPerspective}`);
    console.log("hypothesis:", p.hypothesis);
    console.log("proofStandard:", p.proofStandard);
  }
}

main().catch((err) => {
  console.error("[phase7-verify] failed:", err);
  process.exitCode = 1;
});
