// ACT-Phase 7 verification — populate enrichment fields, wire RENDER to use
// them. Runs the real VERIFY-based evaluation for both Art 28 packages
// against the real Cisco DPA (same controlled harness as act-phase5-verify),
// then builds the locked RequirementAssessment[] via aggregateRequirements,
// runs the real analytical-synthesis LLM call, and renders the assessment
// table — so the actual prose can be read and compared against the
// Mastercard-depth bar from the research doc (§8).
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase7-verify.ts
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
import { aggregateRequirements } from "../aggregate-requirements.js";
import { runAnalyticalSynthesis } from "../../reporting/analytical-synthesis.js";
import { assessmentTableMarkdown } from "../../reporting/render-output.js";
import { guardUnsupportedDependencyClaim, guardUnsupportedInference } from "../../reporting/unsupported-inference.js";
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
      sessionId: "act_phase7_verify",
      instruction: "Review this DPA for GDPR Article 28 compliance.",
      documentIds: [DOC_ID],
      documentTexts: { [DOC_ID]: dpaText },
    },
    workspace: { sessionId: "act_phase7_verify", documents: [segmented] },
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

  console.log("Running classify_document + extract_clauses...");
  state = await classifyDocument(state, workUnit("wu-classify", "classify_document", { docId: DOC_ID }));
  const extracted = await extractClauses(
    state,
    workUnit("wu-extract", "extract_clauses", { docId: DOC_ID, skillIds: state.activeSkillIds }),
    []
  );
  state = extracted.state;

  const particularsPkg = gdprRegimeSkill.evidencePackages?.find((p) => p.id === "gdpr.art28.particulars");
  const mandatoryPkg = gdprRegimeSkill.evidencePackages?.find((p) => p.id === "gdpr.art28.3.mandatory_clauses");
  if (!particularsPkg || !mandatoryPkg) throw new Error("Expected packages not found");

  let allFindings: Finding[] = [];

  for (const pkg of [particularsPkg, mandatoryPkg]) {
    console.log(`\nEvaluating package ${pkg.id}...`);
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

    const result = await evaluatePackage(state, evalUnit, []);
    allFindings = [...allFindings, ...result.findings];
    console.log(`  produced ${result.findings.length} findings`);
  }

  console.log(`\n${"=".repeat(70)}\nRAW FINDINGS WITH ENRICHMENT\n${"=".repeat(70)}`);
  for (const f of allFindings) {
    console.log(`\n[${f.requirementId}] status=${f.status}`);
    if (f.establishedBy) console.log(`  establishedBy: ${f.establishedBy}`);
    if (f.gapDescription) console.log(`  gapDescription: ${f.gapDescription}`);
    if (f.dependency) console.log(`  dependency: ${f.dependency.document} — ${f.dependency.whyNeeded}`);
    if (f.structuralNote) console.log(`  structuralNote: ${f.structuralNote}`);
    if (f.remediation) console.log(`  remediation: ${f.remediation}`);
  }

  const aggResult = aggregateRequirements(
    { ...state, intent: { requirements: [...particularsPkg.requirementIds, ...mandatoryPkg.requirementIds].map((id) => ({ id, type: "adequacy" as const, priority: "required" as const, description: id })) } } as AnalysisState,
    workUnit("wu-aggregate", "aggregate_requirements", {}),
    allFindings
  );
  const assessments = aggResult.state.requirementAssessments ?? [];

  console.log(`\n${"=".repeat(70)}\nLOCKED ASSESSMENTS (with enrichment)\n${"=".repeat(70)}`);
  for (const a of assessments) {
    console.log(`\n[${a.requirementId}] status=${a.status} compliance=${a.judgement?.compliance}`);
    console.log(`  summary: ${a.summary}`);
    if (a.establishedBy) console.log(`  establishedBy: ${a.establishedBy}`);
    if (a.gapDescription) console.log(`  gapDescription: ${a.gapDescription}`);
    if (a.dependency) console.log(`  dependency: ${a.dependency.document} — ${a.dependency.whyNeeded}`);
    if (a.remediation) console.log(`  remediation: ${a.remediation}`);
  }

  console.log(`\n${"=".repeat(70)}\nASSESSMENT TABLE MARKDOWN\n${"=".repeat(70)}`);
  const table = assessmentTableMarkdown(assessments, allFindings, state);
  console.log(table);

  console.log(`\n${"=".repeat(70)}\nANALYTICAL SYNTHESIS (real LLM call, reads enrichment fields)\n${"=".repeat(70)}`);
  const synthesis = await runAnalyticalSynthesis(state, assessments);
  console.log(JSON.stringify(synthesis, null, 2));

  console.log(`\n${"=".repeat(70)}\nGUARDRAIL CHECKS against the synthesis prose\n${"=".repeat(70)}`);
  const synthesisText = [
    synthesis.overallAssessment,
    ...synthesis.keyThemes.map((t) => t.analysis),
    synthesis.substantiveVsDrafting,
    ...synthesis.materialRisks.map((r) => r.whyItMatters),
    synthesis.residualUncertainty,
  ].join(" ");
  console.log("gap-claim guard hits:", guardUnsupportedInference(synthesisText, assessments));
  console.log("dependency-claim guard hits:", guardUnsupportedDependencyClaim(synthesisText, assessments));

  writeFileSync(
    path.join(__dirname, "act-phase7-result.json"),
    JSON.stringify({ findings: allFindings, assessments, table, synthesis }, null, 2),
    "utf8"
  );
  console.log("\nWrote act-phase7-result.json");
}

main().catch((err) => {
  console.error("[act-phase7-verify] failed:", err);
  process.exitCode = 1;
});
