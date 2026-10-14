/**
 * Shadow validation: run V1 and V2 against the available gold docs and compare
 * with the SAME scorer/harness. READ-ONLY (fetches docs; writes only local
 * report files; no DB writes). V1 is unchanged; V2 runs via its pipeline.
 *
 *   node node_modules/tsx/dist/cli.mjs backend/src/modules/negotiate/eval/validate-v2.ts
 * Env: EVAL_RUNS (default 3), EVAL_V2_K (override V2 self-consistency K).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../../../config/database.js";
import { decrypt } from "../../../utils/crypto.js";
import { evaluateFullDocument } from "../../../utils/negotiateChunker.js";
import { runV2Pipeline } from "../v2/pipeline.js";
import { toNegotiateMarkup } from "../v2/adapt.js";
import type { GoldManifest, GoldFinding, V1Finding } from "./types.js";
import { scoreDocument, type DocScore } from "./score.js";
import { computeStability } from "./stability.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLD_DIR = path.join(__dirname, "gold");
const OUT = path.join(__dirname, "_out");
const RUNS = Math.max(1, Number(process.env.EVAL_RUNS || 3));
const V2_K = process.env.EVAL_V2_K ? Number(process.env.EVAL_V2_K) : undefined;

function v1ToScorable(m: any): V1Finding {
  return { clauseId: m.clauseId, original: m.original, reasoning: m.reasoning, replacement: m.replacement, riskLevel: m.riskLevel, clauseType: m.clauseType, charOffset: m.charOffset };
}
function v2ToScorable(m: any): V1Finding {
  const v2 = m.v2 || {};
  const tagWords = String(v2.issueTag || "").replace(/_/g, " ");
  return {
    clauseId: m.clauseId, original: m.original || "",
    reasoning: `${m.reasoning || ""} ${tagWords} ${m.original || ""}`,
    replacement: "", riskLevel: m.riskLevel, clauseType: m.clauseType, charOffset: m.charOffset,
    isAbsence: !!v2.isAbsence,
  };
}

async function fetchText(doc: any): Promise<string | null> {
  if (doc.inlineTextFile) return fs.readFileSync(path.join(GOLD_DIR, doc.inlineTextFile), "utf8");
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`SELECT content, is_encrypted FROM files WHERE id=$1`, [doc.dbDocId]);
    if (!rows.length) return null;
    return rows[0].is_encrypted ? decrypt(rows[0].content || "") : (rows[0].content || "");
  } finally { c.release(); }
}

async function meterV1(text: string, title: string): Promise<{ findings: V1Finding[]; calls: number; ms: number }> {
  const orig = console.log; let calls = 0;
  console.log = (...a: any[]) => { if (/\[LLM\][^\n]*totalTok=/.test(a.join(" "))) calls++; orig(...a); };
  const t0 = Date.now();
  try {
    const markups = await evaluateFullDocument(text, title, "ephemeral_upload", []);
    return { findings: markups.map(v1ToScorable), calls, ms: Date.now() - t0 };
  } finally { console.log = orig; }
}

function fmt(r: { num: number; den: number; value: number | null }): string { return `${r.value === null ? "n/a" : r.value.toFixed(2)} (${r.num}/${r.den})`; }
function agg(scores: DocScore[], key: keyof DocScore): { mean: number | null; min: number | null; max: number | null; per: (number | null)[] } {
  const per = scores.map((s) => (s[key] as any).value as number | null);
  const nums = per.filter((v): v is number => v !== null);
  return { per, mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: GoldManifest = JSON.parse(fs.readFileSync(path.join(GOLD_DIR, "manifest.json"), "utf8"));
  const report: any = { goldVersion: manifest.goldVersion, runs: RUNS, v2K: V2_K ?? "adaptive", startedUtc: new Date().toISOString(), perDoc: [] };

  for (const doc of manifest.documents) {
    if (doc.status !== "available" || !doc.goldFile) continue;
    const golds: GoldFinding[] = JSON.parse(fs.readFileSync(path.join(GOLD_DIR, doc.goldFile), "utf8")).findings;
    const text = await fetchText(doc);
    if (!text) { console.error(`skip ${doc.docFixtureId}: no text`); continue; }
    console.error(`\n[validate] ${doc.docFixtureId} — ${text.length} chars — V1 & V2 ×${RUNS}`);

    const v1Runs: V1Finding[][] = [], v2Runs: V1Finding[][] = [];
    const v1Scores: DocScore[] = [], v2Scores: DocScore[] = [];
    const v1Stats: any[] = [], v2Stats: any[] = [];
    const v2Modes: string[] = [];

    for (let i = 0; i < RUNS; i++) {
      const v1 = await meterV1(text, doc.docFixtureId);
      v1Runs.push(v1.findings); v1Scores.push(scoreDocument(doc.docFixtureId, golds, v1.findings)); v1Stats.push({ calls: v1.calls, ms: v1.ms, count: v1.findings.length });
      console.error(`  V1 run${i + 1}: ${v1.findings.length} findings, ${v1.calls} calls, ${(v1.ms / 1000).toFixed(1)}s`);

      const t0 = Date.now();
      const v2 = await runV2Pipeline(text, { kOverride: V2_K });
      const v2Findings = v2.findings.map(toNegotiateMarkup).map(v2ToScorable);
      v2Runs.push(v2Findings); v2Scores.push(scoreDocument(doc.docFixtureId, golds, v2Findings)); v2Stats.push({ calls: v2.llmCalls, embed: v2.embedCalls, ms: Date.now() - t0, count: v2Findings.length, mode: v2.evaluationMode });
      v2Modes.push(v2.evaluationMode);
      console.error(`  V2 run${i + 1}: ${v2Findings.length} findings, ${v2.llmCalls} calls (+${v2.embedCalls} embed), mode=${v2.evaluationMode}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }

    const metricKeys: (keyof DocScore)[] = ["recallMustCatchIssues", "recallMustCatchAbsence", "primaryPrecision", "fpTrapRateHard", "severityExactBand", "severityWithinOneBand", "dedupCorrect"];
    report.perDoc.push({
      id: doc.docFixtureId, chars: text.length, synthetic: !!doc.synthetic,
      v1: { metrics: Object.fromEntries(metricKeys.map((k) => [k, agg(v1Scores, k)])), stability: computeStability(v1Runs), stats: v1Stats, run1Detail: v1Scores[0] },
      v2: { metrics: Object.fromEntries(metricKeys.map((k) => [k, agg(v2Scores, k)])), stability: computeStability(v2Runs), stats: v2Stats, modes: v2Modes, run1Detail: v2Scores[0] },
    });
  }
  report.finishedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "v1-vs-v2.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "v1-vs-v2-report.md"), render(report, fmt));
  console.error(`\n[validate] wrote ${path.join(OUT, "v1-vs-v2-report.md")}`);
  await pool.end();
}

function render(report: any, fmtR: any): string {
  const L: string[] = [];
  L.push(`# V1 vs V2 (shadow) — validation (goldVersion ${report.goldVersion}, ${report.runs} runs, V2 K=${report.v2K})`);
  const labels: Record<string, string> = { recallMustCatchIssues: "Recall must-catch (issues)", recallMustCatchAbsence: "Recall must-catch (absence)", primaryPrecision: "Primary precision", fpTrapRateHard: "FP-trap (hard)", severityExactBand: "Severity exact", severityWithinOneBand: "Severity within-1", dedupCorrect: "Dedup correct" };
  const p = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
  for (const d of report.perDoc) {
    L.push(`\n## ${d.id} (${d.chars} chars${d.synthetic ? ", synthetic" : ""})`);
    L.push(`\n| Metric | V1 mean (min–max) | V2 mean (min–max) | Δ |`);
    L.push(`|---|---|---|---|`);
    for (const k of Object.keys(labels)) {
      const v1 = d.v1.metrics[k], v2 = d.v2.metrics[k];
      const delta = v1.mean !== null && v2.mean !== null ? (v2.mean - v1.mean >= 0 ? "+" : "") + (v2.mean - v1.mean).toFixed(2) : "—";
      L.push(`| ${labels[k]} | ${p(v1.mean)} (${p(v1.min)}–${p(v1.max)}) | ${p(v2.mean)} (${p(v2.min)}–${p(v2.max)}) | **${delta}** |`);
    }
    L.push(`| Stability Jaccard | ${p(d.v1.stability.meanJaccard)} | ${p(d.v2.stability.meanJaccard)} | **${d.v1.stability.meanJaccard !== null && d.v2.stability.meanJaccard !== null ? (d.v2.stability.meanJaccard - d.v1.stability.meanJaccard >= 0 ? "+" : "") + (d.v2.stability.meanJaccard - d.v1.stability.meanJaccard).toFixed(2) : "—"}** |`);
    const v1c = d.v1.stats.reduce((a: number, b: any) => a + b.calls, 0) / d.v1.stats.length;
    const v2c = d.v2.stats.reduce((a: number, b: any) => a + b.calls, 0) / d.v2.stats.length;
    const v1ms = d.v1.stats.reduce((a: number, b: any) => a + b.ms, 0) / d.v1.stats.length;
    const v2ms = d.v2.stats.reduce((a: number, b: any) => a + b.ms, 0) / d.v2.stats.length;
    L.push(`| Avg LLM calls | ${v1c.toFixed(1)} | ${v2c.toFixed(1)} (+embed) | |`);
    L.push(`| Avg latency (s) | ${(v1ms / 1000).toFixed(1)} | ${(v2ms / 1000).toFixed(1)} | |`);
    L.push(`| Findings/run | ${d.v1.stats.map((s: any) => s.count).join(",")} | ${d.v2.stats.map((s: any) => s.count).join(",")} | |`);
    L.push(`\nV2 evaluation modes: ${d.v2.modes.join(", ")}`);

    // Finding-level diff on must-catch (run 1)
    L.push(`\n**Must-catch (run 1): V1 vs V2**`);
    L.push(`\n| gold | tag | kind | V1 | V2 |`);
    L.push(`|---|---|---|---|---|`);
    const mc = d.v1.run1Detail.goldMatchDetails.filter((x: any) => x.importance === "must_catch");
    for (const g of mc) {
      const v2g = d.v2.run1Detail.goldMatchDetails.find((x: any) => x.goldId === g.goldId);
      L.push(`| ${g.goldId} | ${g.issueTag} | ${g.kind} | ${g.caught ? "✅" : "❌"} | ${v2g?.caught ? "✅" : "❌"} |`);
    }
    // Dedup (esp. synthetic)
    L.push(`\n**Dedup (run 1):** V1 ${fmtR(d.v1.run1Detail.dedupCorrect)} · V2 ${fmtR(d.v2.run1Detail.dedupCorrect)}`);
    for (const dd of d.v2.run1Detail.dedupDetail) L.push(`- V2 ${dd.dupGroup}: ${dd.distinctV1Findings} finding(s), collapsed=${dd.collapsedCorrectly}`);
  }
  return L.join("\n") + "\n";
}

main().catch((e) => { console.error("FATAL", e.message, e.stack); process.exit(1); });
