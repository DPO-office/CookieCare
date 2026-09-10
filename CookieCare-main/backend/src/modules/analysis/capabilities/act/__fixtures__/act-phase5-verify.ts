// ACT-Phase 5 verification — wire VERIFY into the 6 Art 28 particulars only.
// Directly drives evaluatePackage() for BOTH the "gdpr.art28.particulars"
// package (now VERIFY-based) and the "gdpr.art28.3.mandatory_clauses"
// package (must stay on the old grouped-LLM path, byte-identical in
// mechanism) against the real Cisco DPA — bypassing PLAN's own
// non-deterministic skill/package selection so this is a controlled,
// repeatable check of ACT-Phase 5's wiring specifically.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase5-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyDocument } from "../classify-document.js";
import { extractClauses } from "../extract-clauses.js";
import { extractSharedEvidence } from "../extract-shared-evidence.js";
import { evaluatePackage } from "../evaluate-package.js";
import { gdprRegimeSkill } from "../../../skills/regimes/data-protection/gdpr/skill.config.js";
import { segmentDocument } from "../../../segmentation/segment-document.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { Finding } from "../../../models/finding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOWNLOADS = "C:/Users/abhinav.yadav_randst/Downloads";
const DOC_ID = "dpa";

async function loadDocxText(absPath: string): Promise<string> {
  return extractText(readFileSync(absPath), DOCX_MIME);
}

function workUnit(id: string, tool: AnalysisWorkUnit["tool"], input: Record<string, unknown>): AnalysisWorkUnit {
  return { workUnitId: id, tool, input, dependsOn: [], outputSchema: "Finding[]", status: "pending" };
}

async function main() {
  const dpaText = await loadDocxText(
    `${DOWNLOADS}/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
  );

  const segmented = segmentDocument(DOC_ID, dpaText, { title: "Cisco DPA", role: "primary" });

  let state: AnalysisState = {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "act_phase5_verify",
      instruction: "Review this DPA for GDPR Article 28 compliance.",
      documentIds: [DOC_ID],
      documentTexts: { [DOC_ID]: dpaText },
    },
    workspace: { sessionId: "act_phase5_verify", documents: [segmented] },
    findings: [],
    draftTasks: [],
    activeSkills: [gdprRegimeSkill],
    activeSkillIds: [gdprRegimeSkill.skillId],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
  };

  console.log("Running classify_document + extract_clauses (real LLM, deterministic skill selection)...");
  state = await classifyDocument(state, workUnit("wu-classify", "classify_document", { docId: DOC_ID }));
  const extracted = await extractClauses(
    state,
    workUnit("wu-extract", "extract_clauses", { docId: DOC_ID, skillIds: state.activeSkillIds }),
    []
  );
  state = extracted.state;

  const doc = state.workspace.documents.find((d) => d.docId === DOC_ID);
  console.log(`Clauses extracted: ${doc?.clauses.length ?? 0}`);

  const particularsPkg = gdprRegimeSkill.evidencePackages?.find(
    (p) => p.id === "gdpr.art28.particulars"
  );
  const mandatoryPkg = gdprRegimeSkill.evidencePackages?.find(
    (p) => p.id === "gdpr.art28.3.mandatory_clauses"
  );
  if (!particularsPkg || !mandatoryPkg) {
    throw new Error("Expected packages not found in gdprRegimeSkill.evidencePackages");
  }

  async function runPackage(pkg: NonNullable<typeof particularsPkg>, label: string) {
    console.log(`\n${"=".repeat(70)}\n${label} (package: ${pkg.id})\n${"=".repeat(70)}`);

    const evidenceResult = extractSharedEvidence(
      state,
      workUnit(`wu-evidence-${pkg.id}`, "extract_shared_evidence", {
        docId: DOC_ID,
        packageId: pkg.id,
        clauseTypes: pkg.clauseTypes,
        extractionTargets: pkg.extractionTargets,
      }),
      []
    );
    state = evidenceResult.state;

    const evalUnit = workUnit(`wu-eval-${pkg.id}`, "evaluate_package", {
      docId: DOC_ID,
      packageId: pkg.id,
      capabilityIds: pkg.capabilityIds,
      requirementIds: pkg.requirementIds,
      sourceMode: pkg.sourceMode,
      skillIds: state.activeSkillIds,
      instruction: state.request.instruction,
      depth: "standard",
      extractionTargets: pkg.extractionTargets,
      requirementEvidence: pkg.requirementEvidence ?? {},
      requirementBindings: pkg.requirementBindings ?? {},
    });

    const t0 = Date.now();
    const result = await evaluatePackage(state, evalUnit, []);
    console.log(`evaluatePackage took ${Date.now() - t0}ms, produced ${result.findings.length} findings\n`);

    for (const f of result.findings) {
      console.log(`[${f.requirementId}] status=${f.status} nli=${f.judgement?.nli ?? "-"} verifiedByProposition=${f.verifiedByProposition ?? false}`);
      console.log(`  claim: ${f.claim}`);
      if (f.evidence.length > 0) {
        console.log(`  quote: "${f.evidence[0].quotedText}"`);
      }
      console.log("");
    }
    return result.findings;
  }

  const particularsFindings = await runPackage(particularsPkg, "6 PARTICULARS (VERIFY path — NEW)");
  const mandatoryFindings = await runPackage(mandatoryPkg, "8 MANDATORY CLAUSES (grouped-LLM path — MUST STAY UNCHANGED)");

  writeFileSync(
    path.join(__dirname, "act-phase5-result.json"),
    JSON.stringify({ particularsFindings, mandatoryFindings }, null, 2),
    "utf8"
  );
  console.log(`\nWrote act-phase5-result.json`);

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log("6 particulars (VERIFY path):");
  for (const f of particularsFindings) {
    console.log(`  ${f.requirementId}: status=${f.status} nli=${f.judgement?.nli} verifiedByProposition=${f.verifiedByProposition}`);
  }
  console.log("\n8 mandatory clauses (old grouped-LLM path — should look exactly as before):");
  for (const f of mandatoryFindings) {
    console.log(`  ${f.requirementId}: status=${f.status} nli=${f.judgement?.nli} verifiedByProposition=${f.verifiedByProposition ?? false}`);
  }
}

main().catch((err) => {
  console.error("[act-phase5-verify] failed:", err);
  process.exitCode = 1;
});
