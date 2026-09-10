// ACT-Phase 10 verification — Lite/Deep scope control, side-by-side on the
// real mutual NDA (which already has a real required/supporting priority
// split in its skill config: term_and_survival and governing_law are
// "supporting", the other 4 are "required").
//
// Confirms: (1) Lite is faster (fewer VERIFY calls: skips supporting-
// priority requirements entirely, caps candidates per requirement), (2)
// identical correctness on the requirements BOTH modes actually investigate
// (same verdicts, not a "softer" check), (3) Lite is honest about what it
// skipped rather than silently omitting it.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase10-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync } from "node:fs";
import { extractText } from "../../../../../utils/extractText.js";
import { classifyDocument } from "../classify-document.js";
import { extractClauses } from "../extract-clauses.js";
import { extractSharedEvidence } from "../extract-shared-evidence.js";
import { evaluatePackage } from "../evaluate-package.js";
import { ndaDocTypeSkill } from "../../../skills/doc-types/nda/skill.config.js";
import { segmentDocument } from "../../../segmentation/segment-document.js";
import { resolveAnalysisProfile } from "../../../pac/analysis-profile.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ThinkingMode } from "../../../pac/analysis-profile.js";

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

async function runMode(mode: ThinkingMode, ndaText: string) {
  const segmented = segmentDocument(DOC_ID, ndaText, { title: "Mutual NDA", role: "primary" });
  const profile = resolveAnalysisProfile(mode);

  let state: AnalysisState = {
    agent: initAgentRunState("CREATE"),
    analysisProfile: profile,
    request: {
      sessionId: `act_phase10_verify_${mode}`,
      instruction: "Review this NDA for structural completeness.",
      documentIds: [DOC_ID],
      documentTexts: { [DOC_ID]: ndaText },
      thinkingMode: mode,
    },
    workspace: { sessionId: `act_phase10_verify_${mode}`, documents: [segmented] },
    findings: [],
    draftTasks: [],
    activeSkills: [ndaDocTypeSkill],
    activeSkillIds: [ndaDocTypeSkill.skillId],
    // Same requirements + priorities NDA's own skill config authors — this
    // is what state.intent.requirements looks like once PLAN classifies a
    // real NDA ask (reused directly here to keep this test deterministic).
    intent: {
      requirements: ndaDocTypeSkill.authoredRequirements ?? [],
    } as AnalysisState["intent"],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
  };

  state = await classifyDocument(state, workUnit("wu-classify", "classify_document", { docId: DOC_ID }));
  const extracted = await extractClauses(
    state,
    workUnit("wu-extract", "extract_clauses", { docId: DOC_ID, skillIds: state.activeSkillIds }),
    []
  );
  state = extracted.state;

  const pkg = ndaDocTypeSkill.evidencePackages?.find((p) => p.id === "nda.structural_review");
  if (!pkg) throw new Error("nda.structural_review package not found");

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
  const ms = Date.now() - t0;

  return { ms, findings: result.findings };
}

async function main() {
  const ndaText = await loadDocxText(
    `${DOWNLOADS}/mutual-nda-meridian-health-analytics-and-apex-software-solut.docx`
  );

  console.log("Running DEEP mode...");
  const deep = await runMode("deep", ndaText);
  console.log(`DEEP: evaluatePackage took ${deep.ms}ms, produced ${deep.findings.length} findings\n`);

  console.log("Running LITE mode...");
  const lite = await runMode("lite", ndaText);
  console.log(`LITE: evaluatePackage took ${lite.ms}ms, produced ${lite.findings.length} findings\n`);

  console.log("=".repeat(70));
  console.log("SIDE-BY-SIDE COMPARISON");
  console.log("=".repeat(70));

  const deepById = new Map(deep.findings.map((f) => [f.requirementId, f]));
  const liteById = new Map(lite.findings.map((f) => [f.requirementId, f]));
  const allIds = new Set([...deepById.keys(), ...liteById.keys()]);

  for (const id of allIds) {
    const d = deepById.get(id);
    const l = liteById.get(id);
    console.log(`\n[${id}]`);
    console.log(`  DEEP: status=${d?.status} claim="${(d?.claim ?? "").slice(0, 90)}"`);
    console.log(`  LITE: status=${l?.status} claim="${(l?.claim ?? "").slice(0, 90)}"`);
    if (d && l && d.status !== l.status) {
      console.log(`  ⚠ STATUS DIFFERS`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("WALL-CLOCK");
  console.log("=".repeat(70));
  console.log(`DEEP: ${deep.ms}ms`);
  console.log(`LITE: ${lite.ms}ms`);
  console.log(`Reduction: ${(((deep.ms - lite.ms) / deep.ms) * 100).toFixed(1)}%`);
  console.log(`Lite faster: ${lite.ms < deep.ms}`);
}

main().catch((err) => {
  console.error("[act-phase10-verify] failed:", err);
  process.exitCode = 1;
});
