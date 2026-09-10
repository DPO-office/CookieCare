// ACT-Phase 0 baseline harness — full production pipeline (classifyIntent →
// buildPlan → executeActPlan → runAudit) run via the real PacController and
// defaultPacCapabilities, exactly as production does, against the real Cisco
// DPA with a GDPR Article 28 compliance ask.
//
// "No production code changes" phase: this only observes current behavior
// and writes it to baseline-cisco-art28-BEFORE.json/.md for later diffing
// once ACT is rebuilt.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/baseline-runner.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText } from "../../../../../utils/extractText.js";
import { defaultPacCapabilities } from "../../index.js";
import { PacController } from "../../../pac/controller.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      sessionId: "act_phase0_baseline",
      instruction: "",
      documentIds: [],
      documentTexts: {},
    },
    workspace: { sessionId: "act_phase0_baseline", documents: [] },
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
      sessionId: "act_phase0_baseline",
      instruction: "Review this DPA for GDPR Article 28 compliance.",
      documentIds: ["dpa"],
      documentTexts: { dpa: dpaText },
      documentTitles: { dpa: "Cisco DPA" },
    },
  });

  console.log("Running full PAC pipeline (PLAN → ACT → AUDIT) via production controller...");
  const controller = new PacController(defaultPacCapabilities);
  const finalState = await controller.run(state);

  const output = {
    capturedAt: new Date().toISOString(),
    ask: state.request.instruction,
    stoppedReason: finalState.agent?.stoppedReason,
    phase: finalState.agent?.phase,
    intent: finalState.intent,
    planWorkUnitCount: finalState.plan?.workUnits.length,
    planWorkUnitTools: finalState.plan?.workUnits.map((u) => u.tool),
    findingsCount: finalState.findings.length,
    findings: finalState.findings,
    requirementAssessments: finalState.requirementAssessments,
    renderedOutput: finalState.renderedOutput,
    auditReport: finalState.auditReport,
  };

  const jsonPath = path.join(__dirname, "baseline-cisco-art28-BEFORE.json");
  writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote ${jsonPath}`);

  const assessments = finalState.requirementAssessments ?? [];
  const md = [
    "# Baseline capture — Cisco DPA, GDPR Article 28 (BEFORE ACT rebuild)",
    "",
    `Captured: ${output.capturedAt}`,
    `Ask: "${output.ask}"`,
    `Stopped reason: ${output.stoppedReason}`,
    `Findings: ${output.findingsCount}`,
    `Requirement assessments: ${assessments.length}`,
    "",
    "## Requirement assessments",
    "",
    "| requirementId | status | judgement.compliance | summary |",
    "|---|---|---|---|",
    ...assessments.map(
      (a) =>
        `| ${a.requirementId} | ${a.status} | ${a.judgement?.compliance ?? "—"} | ${a.summary.replace(/\|/g, "\\|").slice(0, 100)} |`
    ),
    "",
    "## Definition-of-done check (research doc §8)",
    "",
    "Fill in by hand after reading the JSON — this is the real diff target",
    "for ACT-Phase 5/6 once VERIFY is wired in:",
    "",
    "- [ ] Duration: Present, evidence is the actual term clause (not termination/deletion language)",
    "- [ ] Controller obligations: Present",
    "- [ ] Confidentiality: Present/Strong, evidence is the confidentiality clause (not security language)",
    "- [ ] Audit: partial/minor-gap is fair, independently derived (not inherited from shared risk pool)",
    "- [ ] Subject matter: Present when baseline processing description exists",
    "- [ ] Data-subject categories (pointer-only in source): Cannot determine, legitimately",
    "- [ ] Six distinct PLAN requirements → six distinct assessments (no duplicate native-alias rows)",
    "- [ ] No two unrelated requirements share supporting findings or near-identical summary text",
    "- [ ] No row where status is Present/Strong while its own rationale denies coverage",
  ].join("\n");

  const mdPath = path.join(__dirname, "baseline-cisco-art28-BEFORE.md");
  writeFileSync(mdPath, md, "utf8");
  console.log(`Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error("[act-baseline-runner] failed:", err);
  process.exitCode = 1;
});
