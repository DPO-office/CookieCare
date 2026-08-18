/**
 * One-shot PLAN+ACT latency run. CRITIQUE is stubbed so it cannot
 * redo ACT and is excluded from timings. No behavior change in production.
 *
 * From backend/:
 *   npx tsx scripts/diagnose-analysis-latency.ts
 */
import "../src/config/index.js";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PacController } from "../src/modules/analysis/pac/controller.js";
import { defaultPacCapabilities } from "../src/modules/analysis/capabilities/index.js";
import type { CritiqueReport } from "../src/modules/analysis/models/critique-report.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";
import { initAgentRunState } from "../src/modules/analysis/pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../src/modules/analysis/taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../src/modules/analysis/taxonomies/index.js";
import { initQueryLogger } from "../src/middleware/queryLogger.js";

const ART28_INSTRUCTION =
  "Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.";

const noopCritique: CritiqueReport = {
  isGreen: true,
  iteration: 1,
  results: [],
  fixPlan: [],
  executionComplete: true,
  structurallyValid: true,
  skeletonMismatch: false,
  allUnitsTerminal: true,
  deepCritiqueRequired: false,
  metrics: {
    critiqueLiteMs: 0,
    deepCritiqueMs: 0,
    deepCritiqueTriggered: false,
    deepCritiqueTargets: 0,
    targetedRedoCount: 0,
    replanCount: 0,
    askCount: 0,
    critiqueLLMCalls: 0,
  },
};

function loadDocument(): { title: string; text: string } {
  const fromEnv = process.env.ANALYSIS_LATENCY_DOC;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return { title: path.basename(fromEnv), text: fs.readFileSync(fromEnv, "utf8") };
  }
  const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "art28-latency-dpa.txt");
  return { title: "art28-latency-dpa.txt", text: fs.readFileSync(fixture, "utf8") };
}

async function main() {
  initQueryLogger();
  const { title, text } = loadDocument();
  const docId = "latency-dpa";
  const sessionId = `lat_${crypto.randomUUID()}`;
  console.log(`[diagnose] doc=${title} chars=${text.length} critique=stubbed-off`);

  const state: AnalysisState = {
    entryMode: "CREATE",
    agent: initAgentRunState("CREATE", { docCount: 1 }),
    request: {
      sessionId,
      instruction: ART28_INSTRUCTION,
      promptLibraryId: "privacy",
      documentIds: [docId],
      documentRoles: { [docId]: "target" },
      documentTexts: { [docId]: text },
      documentTitles: { [docId]: title },
    },
    workspace: {
      sessionId,
      documents: [{ docId, title, role: "target", fullText: text, segments: [], clauses: [] }],
    },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
      generationParameters: { diagnostic: true },
    },
  };

  const pac = new PacController({
    ...defaultPacCapabilities,
    persistAnalysis: async (s) => s,
    runCritique: async (s) => ({ ...s, critique: noopCritique }),
  });

  const t0 = Date.now();
  const result = await pac.run(state);
  console.log(
    `[diagnose] done ms=${Date.now() - t0} reason=${result.agent?.stoppedReason} findings=${result.findings.length} units=${result.plan?.workUnits.length ?? 0}`
  );
}

main().catch((err) => {
  console.error("[diagnose] failed", err);
  process.exit(1);
});
