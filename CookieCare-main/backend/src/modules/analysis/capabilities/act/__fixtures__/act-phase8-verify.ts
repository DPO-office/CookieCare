// ACT-Phase 8 verification — second doc-type (NDA), proving VERIFY is
// genuinely regime/doc-type agnostic. Directly drives evaluatePackage() for
// the "nda.structural_review" package against the real mutual NDA — same
// controlled harness pattern as act-phase5/7-verify.ts, bypassing PLAN's own
// non-deterministic skill selection.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase8-verify.ts
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
import { assessmentTableMarkdown } from "../../reporting/render-output.js";
import { ndaDocTypeSkill } from "../../../skills/doc-types/nda/skill.config.js";
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
const DOC_ID = "nda";

async function loadDocxText(absPath: string): Promise<string> {
  return extractText(readFileSync(absPath), DOCX_MIME);
}

function workUnit(id: string, tool: AnalysisWorkUnit["tool"], input: Record<string, unknown>): AnalysisWorkUnit {
  return { workUnitId: id, tool, input, dependsOn: [], outputSchema: "Finding[]", status: "pending" };
}

async function main() {
  const ndaText = await loadDocxText(
    `${DOWNLOADS}/mutual-nda-meridian-health-analytics-and-apex-software-solut.docx`
  );

  const segmented = segmentDocument(DOC_ID, ndaText, { title: "Mutual NDA", role: "primary" });

  let state: AnalysisState = {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "act_phase8_verify",
      instruction: "Review this NDA for structural completeness.",
      documentIds: [DOC_ID],
      documentTexts: { [DOC_ID]: ndaText },
    },
    workspace: { sessionId: "act_phase8_verify", documents: [segmented] },
    findings: [],
    draftTasks: [],
    activeSkills: [ndaDocTypeSkill],
    activeSkillIds: [ndaDocTypeSkill.skillId],
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

  const pkg = ndaDocTypeSkill.evidencePackages?.find((p) => p.id === "nda.structural_review");
  if (!pkg) throw new Error("nda.structural_review package not found");

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
  console.log(`produced ${result.findings.length} findings`);

  console.log(`\n${"=".repeat(70)}\nRAW FINDINGS WITH ENRICHMENT\n${"=".repeat(70)}`);
  for (const f of result.findings) {
    console.log(`\n[${f.requirementId}] status=${f.status} verifiedByProposition=${f.verifiedByProposition ?? false}`);
    if (f.evidence[0]?.quotedText) console.log(`  quote: "${f.evidence[0].quotedText}"`);
    if (f.establishedBy) console.log(`  establishedBy: ${f.establishedBy}`);
    if (f.gapDescription) console.log(`  gapDescription: ${f.gapDescription}`);
    if (f.dependency) console.log(`  dependency: ${f.dependency.document} — ${f.dependency.whyNeeded}`);
    if (f.structuralNote) console.log(`  structuralNote: ${f.structuralNote}`);
    if (f.remediation) console.log(`  remediation: ${f.remediation}`);
  }

  const aggResult = aggregateRequirements(
    {
      ...state,
      intent: {
        requirements: pkg.requirementIds.map((id) => ({
          id,
          type: "adequacy" as const,
          priority: "required" as const,
          description: id,
        })),
      },
    } as AnalysisState,
    workUnit("wu-aggregate", "aggregate_requirements", {}),
    result.findings
  );
  const assessments = aggResult.state.requirementAssessments ?? [];

  console.log(`\n${"=".repeat(70)}\nLOCKED ASSESSMENTS\n${"=".repeat(70)}`);
  for (const a of assessments) {
    console.log(`\n[${a.requirementId}] status=${a.status} compliance=${a.judgement?.compliance}`);
    console.log(`  summary: ${a.summary}`);
  }

  console.log(`\n${"=".repeat(70)}\nASSESSMENT TABLE MARKDOWN\n${"=".repeat(70)}`);
  console.log(assessmentTableMarkdown(assessments, result.findings, state));

  // Focus check: term_and_survival, per the exit gate ("survival-period
  // finding no longer contradicts a placeholder assessment").
  const survival = assessments.find((a) => a.requirementId === "nda.term_and_survival");
  console.log(`\n${"=".repeat(70)}\nFOCUS: nda.term_and_survival\n${"=".repeat(70)}`);
  console.log(JSON.stringify(survival, null, 2));

  writeFileSync(
    path.join(__dirname, "act-phase8-result.json"),
    JSON.stringify({ findings: result.findings, assessments }, null, 2),
    "utf8"
  );
  console.log("\nWrote act-phase8-result.json");
}

main().catch((err) => {
  console.error("[act-phase8-verify] failed:", err);
  process.exitCode = 1;
});
