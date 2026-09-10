/**
 * benchmark-compare.ts
 *
 * Standalone end-to-end benchmark for the Compare Agreements pipeline.
 *
 * What it does
 * ─────────────
 * 1. Runs the full pipeline on two built-in sample NDA contracts.
 * 2. Prints the Phase 7 instrumentation report (wall time, LLM exec,
 *    wait time, requests, retries, rate-limit hits, token counts).
 * 3. Runs the executive summary step twice — once with Flash (current
 *    setting) and once with Pro — on the same pre-computed input, then
 *    prints both outputs side-by-side so you can judge quality directly.
 *
 * How to run (from the backend/ directory)
 * ──────────────────────────────────────────
 *   npx tsx scripts/benchmark-compare.ts
 *
 * Prerequisites
 * ──────────────
 *   • .env file present with GOOGLE_GEMINI_EXTERNAL_KEY set
 *   • Database not required — this script skips save/persist steps
 *   • Two sample .txt contracts are embedded inline so no files needed
 *
 * Output
 * ───────
 *   • Phase 7 metrics table (stdout)
 *   • Flash executive summary (stdout)
 *   • Pro executive summary (stdout)
 *   • Side-by-side field diff (stdout)
 *   • Results written to scripts/benchmark-results.json for archiving
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CompareWorkflowOrchestrator } from "../src/modules/compare/workflows/compare-workflow.js";
import { CompareState } from "../src/modules/compare/models/compare-state.js";
import { pipelineMetrics } from "../src/modules/compare/utils/pipeline-metrics.js";
import { getSkill } from "../src/modules/compare/utils/knowledge-loader.js";
import {
  systemInstruction,
  buildExecutiveSummaryPrompt,
  computeStats,
} from "../src/modules/compare/prompts/executive-summary-prompt.js";
import {
  ExecutiveSummarySchema,
  EXECUTIVE_SUMMARY_JSON_SCHEMA,
} from "../src/modules/compare/schemas/executive-summary-schema.js";
import { executeJsonCompletionWithMeta } from "../src/modules/drafting/llm/index.js";
import { LLMTask, LLMProvider, GeminiModel, PROVIDER_TASK_PRESETS } from "../src/modules/drafting/config/model-specs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Colour helpers ───────────────────────────────────────────────────────────

const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Sample contracts ─────────────────────────────────────────────────────────
//
// Two versions of the same NDA with realistic differences:
//   • Liability cap removed in Version B
//   • Confidentiality survival shortened from 5 → 2 years
//   • Governing law changed from England to New York
//   • Notice addresses updated (admin-only, should be skipped)
//   • Data breach notification window extended from 48h → 72h
//   • New clause: audit rights (added in B)
//   • Assignment clause tightened in B
// These differences exercise the full deterministic rule engine + LLM risk path.

const CONTRACT_A = `
NON-DISCLOSURE AGREEMENT — VERSION A

1. DEFINITIONS
"Confidential Information" means any information disclosed by either party to the other party, either directly or indirectly, in writing, orally or by inspection of tangible objects, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.

2. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to hold the Disclosing Party's Confidential Information in strict confidence. The Receiving Party shall use the same degree of care to protect the Confidential Information as it uses to protect the confidentiality of its own proprietary and confidential information of like nature, but in no event with less than reasonable care.

3. LIMITATION OF LIABILITY
Each party's liability to the other party under or in connection with this Agreement, whether arising in contract, tort (including negligence), breach of statutory duty, or otherwise, shall not exceed one hundred thousand US dollars ($100,000) in aggregate. In no event shall either party be liable to the other for any consequential, incidental, indirect, punitive, or special damages.

4. DATA PROTECTION
Each party agrees to comply with applicable data protection laws. In the event of a personal data breach, the affected party shall notify the other party within forty-eight (48) hours of becoming aware of the breach.

5. TERM AND TERMINATION
This Agreement shall remain in force for a period of two (2) years from the Effective Date, unless earlier terminated. The confidentiality obligations set out in this Agreement shall survive the termination of this Agreement for a period of five (5) years.

6. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of England and Wales. The parties submit to the exclusive jurisdiction of the courts of England and Wales.

7. ASSIGNMENT
Neither party may assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the other party, such consent not to be unreasonably withheld.

8. NOTICES
All notices under this Agreement shall be sent to: Party A at 100 Main Street, London, EC1A 1BB. Party B at 200 High Street, Manchester, M1 1AA.

9. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, negotiations and discussions, whether oral or written.

10. SEVERABILITY
If any provision of this Agreement is held invalid or unenforceable, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, and the validity and enforceability of the remaining provisions shall not be affected.
`.trim();

const CONTRACT_B = `
NON-DISCLOSURE AGREEMENT — VERSION B

1. DEFINITIONS
"Confidential Information" means any information disclosed by either party to the other party, either directly or indirectly, in writing, orally or by inspection of tangible objects, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.

2. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to hold the Disclosing Party's Confidential Information in strict confidence. The Receiving Party shall use the same degree of care to protect the Confidential Information as it uses to protect the confidentiality of its own proprietary and confidential information of like nature, but in no event with less than reasonable care.

3. LIMITATION OF LIABILITY
THE PARTIES EXPRESSLY EXCLUDE ANY LIMITATION OF LIABILITY UNDER THIS AGREEMENT. EACH PARTY SHALL BE FULLY LIABLE FOR ALL LOSSES, DAMAGES, COSTS AND EXPENSES ARISING FROM ANY BREACH OF THIS AGREEMENT, INCLUDING CONSEQUENTIAL, INDIRECT AND SPECIAL DAMAGES, WITHOUT ANY CAP OR CEILING.

4. DATA PROTECTION
Each party agrees to comply with applicable data protection laws. In the event of a personal data breach, the affected party shall notify the other party within seventy-two (72) hours of becoming aware of the breach.

5. TERM AND TERMINATION
This Agreement shall remain in force for a period of two (2) years from the Effective Date, unless earlier terminated. The confidentiality obligations set out in this Agreement shall survive the termination of this Agreement for a period of two (2) years.

6. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of New York. The parties submit to the exclusive jurisdiction of the courts of the State of New York.

7. ASSIGNMENT
Neither party may assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the other party. For the avoidance of doubt, any change of control of a party shall constitute an assignment requiring such consent.

8. AUDIT RIGHTS
Each party shall have the right to audit the other party's compliance with this Agreement upon thirty (30) days' written notice, no more than once per calendar year. The auditing party shall bear all costs associated with any such audit.

9. NOTICES
All notices under this Agreement shall be sent to: Party A at 55 Baker Street, London, W1U 7EU. Party B at 10 Canary Wharf, London, E14 5AB.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, negotiations and discussions, whether oral or written.

11. SEVERABILITY
If any provision of this Agreement is held invalid or unenforceable, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, and the validity and enforceability of the remaining provisions shall not be affected.
`.trim();

// ─── Utilities ────────────────────────────────────────────────────────────────

function sep(label?: string) {
  const line = "─".repeat(64);
  if (label) {
    const pad = Math.max(0, Math.floor((64 - label.length - 2) / 2));
    console.log(cyan("─".repeat(pad) + " " + bold(label) + " " + "─".repeat(pad)));
  } else {
    console.log(dim(line));
  }
}

function printField(label: string, flash: string | string[], pro: string | string[]) {
  const fStr = Array.isArray(flash) ? flash.join(" | ") : flash;
  const pStr = Array.isArray(pro)   ? pro.join(" | ")   : pro;
  const same = fStr === pStr;
  console.log(`  ${bold(label.padEnd(22))} ${same ? dim("(identical)") : ""}`);
  if (!same) {
    console.log(`    ${yellow("Flash:")} ${fStr}`);
    console.log(`    ${cyan("Pro:  ")} ${pStr}`);
  }
}

// ─── Step 1: Full pipeline run ────────────────────────────────────────────────

async function runFullPipeline(): Promise<CompareState> {
  console.log("\n");
  sep("PHASE 7 BENCHMARK — FULL PIPELINE RUN");
  console.log(dim("  Building initial state from embedded sample contracts..."));

  const state: CompareState = {
    files: {
      original: {
        buffer: Buffer.from(CONTRACT_A, "utf-8"),
        mimeType: "text/plain",
        fileName: "nda-version-a.txt",
      },
      revised: {
        buffer: Buffer.from(CONTRACT_B, "utf-8"),
        mimeType: "text/plain",
        fileName: "nda-version-b.txt",
      },
    },
    parsed: null,
    structure: null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
    onProgress: async (pct, msg) => {
      process.stdout.write(`\r  ${dim(`[${String(pct).padStart(3)}%]`)} ${msg}            `);
    },
  };

  const orchestrator = new CompareWorkflowOrchestrator();
  const result = await orchestrator.execute(state);
  process.stdout.write("\r" + " ".repeat(80) + "\r"); // clear progress line
  return result;
}

// ─── Step 2: Flash vs Pro summary comparison ──────────────────────────────────

async function runModelComparison(finalState: CompareState) {
  sep("FLASH vs PRO — EXECUTIVE SUMMARY QUALITY COMPARISON");

  if (!finalState.differences || !finalState.risks) {
    console.log(red("  Cannot run model comparison — pipeline did not produce differences/risks."));
    return { flash: null, pro: null };
  }

  const diffs  = finalState.differences;
  const risks  = finalState.risks;
  const titleA = finalState.parsed?.metaA.fileName ?? "Agreement A";
  const titleB = finalState.parsed?.metaB.fileName ?? "Agreement B";
  const stats  = computeStats(diffs, risks);

  const skill = getSkill("executive-summary");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;
  const prompt = buildExecutiveSummaryPrompt(diffs, risks, stats, titleA, titleB);

  console.log(dim(`  Prompt size: ${prompt.length} chars   Stats: H=${stats.riskHigh} M=${stats.riskMedium} L=${stats.riskLow}`));
  console.log(dim("  Running Flash call..."));

  // ── Flash ──────────────────────────────────────────────────────────────
  const t0Flash = Date.now();
  let flashSummary: any = null;
  let flashTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let flashError: string | null = null;

  try {
    const { result, usage } = await executeJsonCompletionWithMeta(
      prompt,
      fullSystemInstruction,
      EXECUTIVE_SUMMARY_JSON_SCHEMA,
      LLMTask.COMPARE_SUMMARY,
      LLMProvider.GEMINI
    );
    flashSummary = result;
    flashTokens  = usage;
  } catch (e: any) {
    flashError = e.message;
    console.log(red(`  Flash call failed: ${flashError}`));
  }
  const flashMs = Date.now() - t0Flash;

  // ── Pro ────────────────────────────────────────────────────────────────
  console.log(dim("  Running Pro call..."));
  const t0Pro = Date.now();
  let proSummary: any = null;
  let proTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let proError: string | null = null;

  // Temporarily override COMPARE_SUMMARY to Pro for this comparison call
  const proConfig = {
    model: GeminiModel.GEMINI_3_1_PRO,
    temperature: 0.2,
    responseMimeType: "application/json",
    maxOutputTokens: 2048,
  };

  // Patch task preset in-memory for one call, restore after
  const originalPreset = PROVIDER_TASK_PRESETS[LLMProvider.GEMINI][LLMTask.COMPARE_SUMMARY];
  (PROVIDER_TASK_PRESETS[LLMProvider.GEMINI] as any)[LLMTask.COMPARE_SUMMARY] = proConfig;

  try {
    const { result, usage } = await executeJsonCompletionWithMeta(
      prompt,
      fullSystemInstruction,
      EXECUTIVE_SUMMARY_JSON_SCHEMA,
      LLMTask.COMPARE_SUMMARY,
      LLMProvider.GEMINI
    );
    proSummary = result;
    proTokens  = usage;
  } catch (e: any) {
    proError = e.message;
    console.log(red(`  Pro call failed: ${proError}`));
  } finally {
    // Restore original preset
    (PROVIDER_TASK_PRESETS[LLMProvider.GEMINI] as any)[LLMTask.COMPARE_SUMMARY] = originalPreset;
  }

  const proMs = Date.now() - t0Pro;

  // ── Timing comparison ──────────────────────────────────────────────────
  sep("MODEL LATENCY & TOKEN COMPARISON");
  console.log(`  ${"".padEnd(20)} ${bold("Flash".padEnd(30))} ${bold("Pro")}`);
  console.log(`  ${"Latency".padEnd(20)} ${String(flashMs + "ms").padEnd(30)} ${proMs}ms`);
  console.log(`  ${"Prompt tokens".padEnd(20)} ${String(flashTokens.promptTokens).padEnd(30)} ${proTokens.promptTokens}`);
  console.log(`  ${"Completion tokens".padEnd(20)} ${String(flashTokens.completionTokens).padEnd(30)} ${proTokens.completionTokens}`);
  console.log(`  ${"Total tokens".padEnd(20)} ${String(flashTokens.totalTokens).padEnd(30)} ${proTokens.totalTokens}`);
  const tokenSaving = proTokens.totalTokens > 0
    ? `${Math.round((1 - flashTokens.totalTokens / proTokens.totalTokens) * 100)}%`
    : "n/a";
  console.log(`  ${"Token saving (Flash)".padEnd(20)} ${tokenSaving}`);

  // ── Field-by-field quality comparison ─────────────────────────────────
  if (flashSummary && proSummary) {
    sep("FIELD-BY-FIELD QUALITY COMPARISON");

    printField("overallRisk",    flashSummary.overallRisk,    proSummary.overallRisk);
    printField("recommendation", flashSummary.recommendation, proSummary.recommendation);

    console.log(`\n  ${bold("overallAssessment")}`);
    console.log(`    ${yellow("Flash:")} ${flashSummary.overallAssessment}`);
    console.log(`    ${cyan("Pro:  ")} ${proSummary.overallAssessment}`);

    console.log(`\n  ${bold("keyFindings")} (${flashSummary.keyFindings?.length ?? 0} Flash / ${proSummary.keyFindings?.length ?? 0} Pro)`);
    const maxKF = Math.max(flashSummary.keyFindings?.length ?? 0, proSummary.keyFindings?.length ?? 0);
    for (let i = 0; i < maxKF; i++) {
      const f = flashSummary.keyFindings?.[i] ?? dim("(none)");
      const p = proSummary.keyFindings?.[i]   ?? dim("(none)");
      const same = f === p;
      console.log(`    [${i + 1}] ${same ? dim("(identical)") : ""}`);
      if (!same) {
        console.log(`      ${yellow("Flash:")} ${f}`);
        console.log(`      ${cyan("Pro:  ")} ${p}`);
      } else {
        console.log(`      ${dim(f)}`);
      }
    }

    console.log(`\n  ${bold("criticalRedlines")} (${flashSummary.criticalRedlines?.length ?? 0} Flash / ${proSummary.criticalRedlines?.length ?? 0} Pro)`);
    const maxCR = Math.max(flashSummary.criticalRedlines?.length ?? 0, proSummary.criticalRedlines?.length ?? 0);
    for (let i = 0; i < maxCR; i++) {
      const f = flashSummary.criticalRedlines?.[i] ?? dim("(none)");
      const p = proSummary.criticalRedlines?.[i]   ?? dim("(none)");
      const same = f === p;
      console.log(`    [${i + 1}] ${same ? dim("(identical)") : ""}`);
      if (!same) {
        console.log(`      ${yellow("Flash:")} ${f}`);
        console.log(`      ${cyan("Pro:  ")} ${p}`);
      } else {
        console.log(`      ${dim(f)}`);
      }
    }

    console.log(`\n  ${bold("missingProtections")} (${flashSummary.missingProtections?.length ?? 0} Flash / ${proSummary.missingProtections?.length ?? 0} Pro)`);
    const maxMP = Math.max(flashSummary.missingProtections?.length ?? 0, proSummary.missingProtections?.length ?? 0);
    for (let i = 0; i < maxMP; i++) {
      const f = flashSummary.missingProtections?.[i] ?? dim("(none)");
      const p = proSummary.missingProtections?.[i]   ?? dim("(none)");
      const same = f === p;
      console.log(`    [${i + 1}] ${same ? dim("(identical)") : ""}`);
      if (!same) {
        console.log(`      ${yellow("Flash:")} ${f}`);
        console.log(`      ${cyan("Pro:  ")} ${p}`);
      } else {
        console.log(`      ${dim(f)}`);
      }
    }

    console.log(`\n  ${bold("negotiationPriorities")} (${flashSummary.negotiationPriorities?.length ?? 0} Flash / ${proSummary.negotiationPriorities?.length ?? 0} Pro)`);
    const maxNP = Math.max(flashSummary.negotiationPriorities?.length ?? 0, proSummary.negotiationPriorities?.length ?? 0);
    for (let i = 0; i < maxNP; i++) {
      const f = flashSummary.negotiationPriorities?.[i] ?? dim("(none)");
      const p = proSummary.negotiationPriorities?.[i]   ?? dim("(none)");
      const same = f === p;
      console.log(`    [${i + 1}] ${same ? dim("(identical)") : ""}`);
      if (!same) {
        console.log(`      ${yellow("Flash:")} ${f}`);
        console.log(`      ${cyan("Pro:  ")} ${p}`);
      } else {
        console.log(`      ${dim(f)}`);
      }
    }
  }

  return { flash: flashSummary, pro: proSummary, flashMs, proMs, flashTokens, proTokens };
}

// ─── Step 3: Verdict ──────────────────────────────────────────────────────────

function printVerdict(
  flash: any,
  pro: any,
  flashMs: number,
  proMs: number,
  flashTokens: any,
  proTokens: any
) {
  sep("VERDICT — IS FLASH AN ACCEPTABLE REPLACEMENT?");

  if (!flash || !pro) {
    console.log(red("  Cannot produce verdict — one or both model calls failed."));
    return;
  }

  const checks: Array<{ label: string; pass: boolean; detail: string }> = [];

  checks.push({
    label: "overallRisk matches",
    pass: flash.overallRisk === pro.overallRisk,
    detail: `Flash=${flash.overallRisk}  Pro=${pro.overallRisk}`,
  });

  checks.push({
    label: "recommendation matches",
    pass: flash.recommendation === pro.recommendation,
    detail: flash.recommendation === pro.recommendation
      ? flash.recommendation
      : `Flash: "${flash.recommendation}"  Pro: "${pro.recommendation}"`,
  });

  const flashKF = (flash.keyFindings ?? []).length;
  const proKF   = (pro.keyFindings ?? []).length;
  checks.push({
    label: "keyFindings count acceptable",
    pass: Math.abs(flashKF - proKF) <= 1,
    detail: `Flash=${flashKF}  Pro=${proKF}`,
  });

  const flashCR = (flash.criticalRedlines ?? []).length;
  const proCR   = (pro.criticalRedlines ?? []).length;
  checks.push({
    label: "criticalRedlines count acceptable",
    pass: Math.abs(flashCR - proCR) <= 1,
    detail: `Flash=${flashCR}  Pro=${proCR}`,
  });

  checks.push({
    label: "Flash is faster",
    pass: flashMs < proMs,
    detail: `Flash=${flashMs}ms  Pro=${proMs}ms  (${proMs - flashMs}ms saved)`,
  });

  if (proTokens.totalTokens > 0) {
    const saving = Math.round((1 - flashTokens.totalTokens / proTokens.totalTokens) * 100);
    checks.push({
      label: "Flash uses fewer tokens",
      pass: flashTokens.totalTokens <= proTokens.totalTokens,
      detail: `Flash=${flashTokens.totalTokens}  Pro=${proTokens.totalTokens}  (${saving}% saving)`,
    });
  }

  const passed = checks.filter(c => c.pass).length;
  const total  = checks.length;

  for (const c of checks) {
    const mark = c.pass ? green("✓") : red("✗");
    console.log(`  ${mark} ${c.label.padEnd(34)} ${dim(c.detail)}`);
  }

  console.log();
  if (passed === total) {
    console.log(green(bold(`  CONCLUSION: Flash passes all ${total} checks — safe replacement for Pro.`)));
    console.log(green("  Recommendation: keep COMPARE_SUMMARY on Flash."));
  } else if (passed >= total - 1) {
    console.log(yellow(bold(`  CONCLUSION: Flash passes ${passed}/${total} checks — likely acceptable, review failures above.`)));
  } else {
    console.log(red(bold(`  CONCLUSION: Flash fails ${total - passed}/${total} checks — revert COMPARE_SUMMARY to Pro.`)));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const overallStart = Date.now();

  let finalState: CompareState;
  try {
    finalState = await runFullPipeline();
  } catch (err: any) {
    console.error(red(`\nPipeline failed: ${err.message}`));
    process.exit(1);
  }

  const { flash, pro, flashMs, proMs, flashTokens, proTokens } =
    await runModelComparison(finalState);

  printVerdict(flash, pro, flashMs ?? 0, proMs ?? 0, flashTokens ?? {}, proTokens ?? {});

  const totalMs = Date.now() - overallStart;
  sep();
  console.log(dim(`  Total benchmark time: ${(totalMs / 1000).toFixed(1)}s`));
  console.log();

  // ── Save results to JSON ──────────────────────────────────────────────
  const outPath = path.join(__dirname, "benchmark-results.json");
  const output = {
    timestamp:   new Date().toISOString(),
    pipeline: {
      metrics: pipelineMetrics,
      timings: (finalState.metadata as any).stepTimings ?? [],
    },
    modelComparison: {
      flash: { summary: flash, latencyMs: flashMs, tokens: flashTokens },
      pro:   { summary: pro,   latencyMs: proMs,   tokens: proTokens   },
    },
  };

  try {
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(dim(`  Results saved to ${outPath}`));
  } catch {
    console.log(dim("  (Could not write benchmark-results.json)"));
  }
}

main().catch((err) => {
  console.error(red(`\nUnhandled error: ${err.message}`));
  process.exit(1);
});
