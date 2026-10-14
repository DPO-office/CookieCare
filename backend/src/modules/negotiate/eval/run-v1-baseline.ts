/**
 * Stage 0 harness: score the CURRENT v1 evaluator against the gold set.
 *
 * READ-ONLY: fetches document content, runs `evaluateFullDocument` (unmodified)
 * N times, scores, and writes a report. Writes NOTHING to the database and does
 * not alter any production behavior.
 *
 *   node node_modules/tsx/dist/cli.mjs backend/src/modules/negotiate/eval/run-v1-baseline.ts
 *
 * Env:
 *   EVAL_RUNS=3                 number of stability runs (default 3)
 *   EVAL_G_DPA_01_DOC_ID=...    override the DB doc id for G-DPA-01
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../../../config/database.js";
import { decrypt } from "../../../utils/crypto.js";
import { evaluateFullDocument } from "../../../utils/negotiateChunker.js";
import type { GoldManifest, GoldFinding, V1Finding } from "./types.js";
import { scoreDocument, type DocScore } from "./score.js";
import { findingMatchesGold } from "./match.js";
import { computeStability, type StabilityResult } from "./stability.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLD_DIR = path.join(__dirname, "gold");
const OUT_DIR = path.join(__dirname, "_out");
const RUNS = Math.max(1, Number(process.env.EVAL_RUNS || 3));

function fmtRatio(r: { num: number; den: number; value: number | null }): string {
  return `${r.value === null ? "n/a" : r.value.toFixed(2)} (${r.num}/${r.den})`;
}

/** Count [LLM] calls and sum totalTok emitted by the provider during `fn`. */
async function withLlmMetering<T>(fn: () => Promise<T>): Promise<{ result: T; calls: number; tokens: number; ms: number }> {
  const orig = console.log;
  let calls = 0, tokens = 0;
  console.log = (...args: any[]) => {
    const s = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
    const m = s.match(/\[LLM\][^\n]*totalTok=(\d+)/);
    if (m) { calls++; tokens += Number(m[1]); }
    orig(...args);
  };
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, calls, tokens, ms: Date.now() - t0 };
  } finally {
    console.log = orig;
  }
}

function toV1Findings(markups: any[]): V1Finding[] {
  return markups.map((m) => ({
    clauseId: m.clauseId,
    original: m.original,
    reasoning: m.reasoning,
    replacement: m.replacement,
    riskLevel: m.riskLevel,
    clauseType: m.clauseType,
    charOffset: m.charOffset,
  }));
}

async function fetchDocText(dbDocId: string): Promise<string | null> {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`SELECT content, is_encrypted FROM files WHERE id=$1`, [dbDocId]);
    if (!rows.length) return null;
    const txt = rows[0].is_encrypted ? decrypt(rows[0].content || "") : (rows[0].content || "");
    return txt || null;
  } finally { c.release(); }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest: GoldManifest = JSON.parse(fs.readFileSync(path.join(GOLD_DIR, "manifest.json"), "utf8"));

  const report: any = {
    goldVersion: manifest.goldVersion,
    runsPerDoc: RUNS,
    ciGatesEnabled: (manifest as any).ciGatesEnabled ?? false,
    provisionalTargets: (manifest as any).provisionalTargets ?? null,
    startedUtc: new Date().toISOString(),
    dataset: { available: [], pending: [] },
    perDoc: [] as any[],
  };

  for (const doc of manifest.documents) {
    const dbDocId = (doc.dbDocIdEnv && process.env[doc.dbDocIdEnv]) || doc.dbDocId;
    const hasSource = !!doc.inlineTextFile || !!dbDocId;
    if (doc.status !== "available" || !doc.goldFile || !hasSource) {
      report.dataset.pending.push({ id: doc.docFixtureId, title: doc.title, reason: doc.status === "pending" ? "no document / labels yet" : "missing goldFile or document source", purpose: doc.purpose });
      continue;
    }

    const golds: GoldFinding[] = JSON.parse(fs.readFileSync(path.join(GOLD_DIR, doc.goldFile), "utf8")).findings;
    // Source: an inline synthetic fixture reads from disk; a real doc from the DB.
    let text: string | null;
    let sourceLabel: string;
    if (doc.inlineTextFile) {
      text = fs.readFileSync(path.join(GOLD_DIR, doc.inlineTextFile), "utf8");
      sourceLabel = `synthetic:${doc.inlineTextFile}`;
    } else {
      text = await fetchDocText(dbDocId!);
      sourceLabel = `db:${dbDocId}`;
    }
    if (!text) {
      report.dataset.pending.push({ id: doc.docFixtureId, title: doc.title, reason: `document source ${sourceLabel} not found or empty`, purpose: doc.purpose });
      continue;
    }

    const goldCounts = {
      total: golds.length,
      issue: golds.filter((g) => g.kind === "issue").length,
      absence: golds.filter((g) => g.kind === "absence").length,
      trap: golds.filter((g) => g.kind === "trap").length,
      mustCatch: golds.filter((g) => (g.kind === "issue" || g.kind === "absence") && g.importance === "must_catch").length,
    };
    report.dataset.available.push({ id: doc.docFixtureId, title: doc.title, source: sourceLabel, synthetic: !!doc.synthetic, chars: text.length, goldCounts });

    console.error(`\n[baseline] ${doc.docFixtureId} — ${text.length} chars (${sourceLabel}) — running v1 ${RUNS}×`);
    const runs: V1Finding[][] = [];
    const runStats: { calls: number; tokens: number; ms: number; count: number }[] = [];
    for (let i = 0; i < RUNS; i++) {
      const { result, calls, tokens, ms } = await withLlmMetering(() =>
        evaluateFullDocument(text, doc.title, "ephemeral_upload", [])
      );
      const f = toV1Findings(result);
      runs.push(f);
      runStats.push({ calls, tokens, ms, count: f.length });
      console.error(`  run ${i + 1}: ${f.length} findings, ${calls} LLM calls, ${tokens} tok, ${(ms / 1000).toFixed(1)}s`);
    }

    // Score EVERY run (v1 is non-deterministic, so a single run is not a
    // reproducible baseline). run[0] carries the detailed finding-level audit.
    const perRunScores: DocScore[] = runs.map((r, i) => scoreDocument(`${doc.docFixtureId}#run${i + 1}`, golds, r));
    const score: DocScore = perRunScores[0];
    const stability: StabilityResult = computeStability(runs);

    // Aggregate each ratio metric across runs (mean of the per-run values; nulls skipped).
    const metricKeys = [
      "recallMustCatchIssues", "recallMustCatchAbsence", "primaryPrecision",
      "fpTrapRateHard", "fpTrapRateSoft", "severityExactBand", "severityWithinOneBand", "dedupCorrect",
    ] as const;
    const aggregate: Record<string, { perRun: (number | null)[]; mean: number | null; min: number | null; max: number | null }> = {};
    for (const k of metricKeys) {
      const vals = perRunScores.map((s) => (s[k] as any).value as number | null);
      const nums = vals.filter((v): v is number => v !== null);
      aggregate[k] = {
        perRun: vals,
        mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
      };
    }
    // ── Per-finding detection frequency across runs (coverage vs reliability) ──
    // For every gold: in how many of the N runs was it caught?
    const detectionFrequency = golds.map((g) => {
      const caughtRuns = perRunScores.map((s) => s.goldMatchDetails.find((d) => d.goldId === g.id)?.caught ?? false);
      const hits = caughtRuns.filter(Boolean).length;
      return {
        goldId: g.id, issueTag: g.issueTag, kind: g.kind, importance: g.importance,
        caughtRuns, hits, runs: perRunScores.length, frequency: hits / perRunScores.length,
        coverage: hits >= 1,                       // caught in at least one run
        reliable: hits === perRunScores.length,    // caught in EVERY run
      };
    });

    // Must-catch reliability summary (distinguish coverage from reliability).
    const mustCatchGolds = golds.filter((g) => (g.kind === "issue" || g.kind === "absence") && g.importance === "must_catch");
    const mcFreq = detectionFrequency.filter((d) => mustCatchGolds.some((g) => g.id === d.goldId));
    const reliabilitySummary = {
      totalMustCatch: mcFreq.length,
      coveredInAnyRun: mcFreq.filter((d) => d.coverage).length,        // recall if you union all runs
      reliableAllRuns: mcFreq.filter((d) => d.reliable).length,        // caught every single run
      neverCaught: mcFreq.filter((d) => !d.coverage).length,
      meanDetectionFrequency: mcFreq.length ? mcFreq.reduce((a, d) => a + d.frequency, 0) / mcFreq.length : null,
    };

    // Per-run must_catch caught matrix (gold id -> caught? per run).
    const mustCatchMatrix = mustCatchGolds.map((g) => ({
      goldId: g.id, issueTag: g.issueTag, kind: g.kind,
      caughtPerRun: perRunScores.map((s) => s.goldMatchDetails.find((d) => d.goldId === g.id)?.caught ?? false),
    }));

    // Merge-group view across runs (e.g. a2+g3 satisfiable by one merged finding).
    const mergeGroupNames = [...new Set(golds.filter((g) => g.mergeGroup).map((g) => g.mergeGroup!))];
    const mergeGroupAcrossRuns = mergeGroupNames.map((grp) => ({
      mergeGroup: grp,
      members: golds.filter((g) => g.mergeGroup === grp).map((g) => g.id),
      perRun: perRunScores.map((s) => {
        const d = s.mergeGroupDetail.find((m) => m.mergeGroup === grp);
        return d ? { allCaught: d.allMembersCaught, byOneFinding: d.satisfiedBySingleFinding, distinctFindings: d.distinctFindingsCovering, caught: d.caughtMemberGoldIds } : null;
      }),
    }));

    // Dedup view across runs (aggregate over the doc's dup groups).
    const dedupAcrossRuns = perRunScores.map((s) => ({
      groups: s.dedupDetail.map((d) => ({ dupGroup: d.dupGroup, distinct: d.distinctV1Findings, collapsed: d.collapsedCorrectly })),
      correct: s.dedupCorrect,
    }));

    // Per-finding reverse audit for run[0]: which gold(s) each v1 finding matched.
    const findingsAudit = runs[0].map((f) => ({
      clauseId: f.clauseId,
      riskLevel: f.riskLevel,
      clauseType: f.clauseType,
      originalSnippet: f.original.replace(/\s+/g, " ").slice(0, 90),
      matchedGoldIds: golds.filter((g) => findingMatchesGold(g, f)).map((g) => g.id),
    }));

    report.perDoc.push({
      id: doc.docFixtureId, source: sourceLabel, synthetic: !!doc.synthetic, chars: text.length, goldCounts,
      runStats, findingsAudit, aggregate, mustCatchMatrix,
      detectionFrequency, reliabilitySummary, mergeGroupAcrossRuns, dedupAcrossRuns,
      cost: {
        avgCalls: runStats.reduce((a, b) => a + b.calls, 0) / runStats.length,
        avgTokens: runStats.reduce((a, b) => a + b.tokens, 0) / runStats.length,
        avgMs: runStats.reduce((a, b) => a + b.ms, 0) / runStats.length,
      },
      score,
      stability,
    });
  }

  report.finishedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, "v1-baseline.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "v1-baseline-report.md"), renderMarkdown(report));
  console.error(`\n[baseline] wrote ${path.join(OUT_DIR, "v1-baseline.json")} and v1-baseline-report.md`);
  await pool.end();
}

function renderMarkdown(report: any): string {
  const L: string[] = [];
  L.push(`# Negotiate v1 Baseline — Stage 0 (goldVersion ${report.goldVersion})`);
  L.push(`\nRuns per doc: ${report.runsPerDoc} (development baseline) · started ${report.startedUtc}`);
  L.push(`\n> **CI gates: ${report.ciGatesEnabled ? "ENABLED" : "DISABLED"} (provisional targets only).** Thresholds are held provisional until the gold set has enough documents; they are NOT enforced.`);

  L.push(`\n## A. Dataset status`);
  L.push(`\n**Available (${report.dataset.available.length}):**`);
  for (const d of report.dataset.available)
    L.push(`- ${d.id} — "${d.title}" — ${d.chars} chars — ${d.synthetic ? "**synthetic**" : "real"} (${d.source}) — gold: ${d.goldCounts.total} (issue ${d.goldCounts.issue}, absence ${d.goldCounts.absence}, trap ${d.goldCounts.trap}; must_catch ${d.goldCounts.mustCatch})`);
  L.push(`\n**Pending (${report.dataset.pending.length}):**`);
  for (const d of report.dataset.pending) L.push(`- ${d.id} — "${d.title}" — ${d.reason}`);

  const pct = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
  const metricLabels: Record<string, string> = {
    recallMustCatchIssues: "Recall@must_catch (issues)",
    recallMustCatchAbsence: "Recall@must_catch (absence)",
    primaryPrecision: "Primary precision (lower bound)",
    fpTrapRateHard: "FP-trap rate (hard)",
    fpTrapRateSoft: "FP-trap rate (soft)",
    severityExactBand: "Severity exact-band",
    severityWithinOneBand: "Severity within-one-band",
    dedupCorrect: "Dedup correctness",
  };

  for (const pd of report.perDoc) {
    L.push(`\n## B. v1 scorecard — ${pd.id} (aggregated over ${report.runsPerDoc} runs)`);
    L.push(`\n| Metric | ${pd.runStats.map((_: any, i: number) => `run${i + 1}`).join(" | ")} | mean | min–max |`);
    L.push(`|---|${pd.runStats.map(() => "---").join("|")}|---|---|`);
    for (const k of Object.keys(metricLabels)) {
      const a = pd.aggregate[k];
      L.push(`| ${metricLabels[k]} | ${a.perRun.map(pct).join(" | ")} | **${pct(a.mean)}** | ${pct(a.min)}–${pct(a.max)} |`);
    }
    L.push(`| Total v1 findings | ${pd.runStats.map((r: any) => r.count).join(" | ")} | — | — |`);
    L.push(`\n_run 1 detail below (finding-level audit uses run 1; metrics above aggregate all runs)._`);

    L.push(`\n### C. Finding-level audit — ${pd.id}`);

    // ── Must-catch RELIABILITY / detection-frequency view (coverage vs reliability) ──
    const rs = pd.reliabilitySummary;
    L.push(`\n**Must-catch reliability (coverage ≠ reliability):**`);
    L.push(`- covered in ≥1 run (union recall): **${rs.coveredInAnyRun}/${rs.totalMustCatch}**`);
    L.push(`- reliably caught in ALL ${report.runsPerDoc} runs: **${rs.reliableAllRuns}/${rs.totalMustCatch}**`);
    L.push(`- never caught: **${rs.neverCaught}/${rs.totalMustCatch}**`);
    L.push(`- mean per-finding detection frequency: **${rs.meanDetectionFrequency === null ? "n/a" : rs.meanDetectionFrequency.toFixed(2)}**`);
    L.push(`\n| gold | tag | kind | ${pd.runStats.map((_: any, i: number) => `r${i + 1}`).join(" | ")} | freq | coverage | reliable |`);
    L.push(`|---|---|---|${pd.runStats.map(() => "---").join("|")}|---|---|---|`);
    for (const d of pd.detectionFrequency.filter((x: any) => x.importance === "must_catch"))
      L.push(`| ${d.goldId} | ${d.issueTag} | ${d.kind} | ${d.caughtRuns.map((c: boolean) => (c ? "✅" : "❌")).join(" | ")} | ${d.hits}/${d.runs} | ${d.coverage ? "✓" : "✗"} | ${d.reliable ? "✓" : "✗"} |`);

    // ── Merge-group view (a2 + g3 satisfiable by ONE merged finding) ──
    if (pd.mergeGroupAcrossRuns.length) {
      L.push(`\n**Merge groups (related golds on one clause — one correctly-merged finding may satisfy all members):**`);
      L.push(`\n| mergeGroup | members | ${pd.runStats.map((_: any, i: number) => `run${i + 1}`).join(" | ")} |`);
      L.push(`|---|---|${pd.runStats.map(() => "---").join("|")}|`);
      for (const mg of pd.mergeGroupAcrossRuns) {
        const cells = mg.perRun.map((p: any) => p ? `${p.allCaught ? "all" : p.caught.length + "/" + mg.members.length} caught, ${p.byOneFinding ? "1 finding ✓merged" : p.distinctFindings + " findings"}` : "—");
        L.push(`| ${mg.mergeGroup} | ${mg.members.join("+")} | ${cells.join(" | ")} |`);
      }
      L.push(`\n_A correctly-merged finding satisfies every member with ONE finding ("✓merged"). v1 (no absence detection) satisfies only g3, never the a2 half._`);
    }
    L.push(`\n**Must-catch (issues + absence):**`);
    L.push(`\n| gold | tag | kind | caught | matched v1 clauseIds | reason |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const d of pd.score.goldMatchDetails.filter((x: any) => x.importance === "must_catch"))
      L.push(`| ${d.goldId} | ${d.issueTag} | ${d.kind} | ${d.caught ? "✅" : "❌"} | ${d.matchedClauseIds.join(", ") || "—"} | ${d.reason} |`);

    L.push(`\n**Traps (should NOT surface):**`);
    L.push(`\n| gold | tag | importance | surfaced | v1 clauseIds |`);
    L.push(`|---|---|---|---|---|`);
    for (const d of pd.score.goldMatchDetails.filter((x: any) => x.kind === "trap"))
      L.push(`| ${d.goldId} | ${d.issueTag} | ${d.importance} | ${d.caught ? "⚠️ surfaced" : "✅ suppressed"} | ${d.matchedClauseIds.join(", ") || "—"} |`);

    L.push(`\n**Dedup groups (run 1):**`);
    if (!pd.synthetic)
      L.push(`> ⚠️ ${pd.id} dedup is NON-AUTHORITATIVE: a group can show "collapsed" merely because v1 emitted only one location that run, not because it merged. Use the controlled synthetic fixture **G-DPA-06** for the authoritative dedup metric.`);
    L.push(`\n| dupGroup | distinct v1 findings | collapsed correctly | clauseIds |`);
    L.push(`|---|---|---|---|`);
    for (const dd of pd.score.dedupDetail)
      L.push(`| ${dd.dupGroup} | ${dd.distinctV1Findings} | ${dd.collapsedCorrectly ? "✅" : "❌"} | ${dd.clauseIds.join(", ")} |`);
    if (pd.synthetic) {
      L.push(`\n**Dedup across all runs (authoritative — synthetic fixture):**`);
      L.push(`\n| run | dedup correct | groups (distinct findings) |`);
      L.push(`|---|---|---|`);
      pd.dedupAcrossRuns.forEach((r: any, i: number) => {
        const groupsStr = r.groups.map((g: any) => g.dupGroup + "=" + g.distinct + (g.collapsed ? " ok" : " NOT")).join(", ");
        const corr = r.correct.value === null ? "n/a" : r.correct.value.toFixed(2);
        L.push(`| run${i + 1} | ${corr} (${r.correct.num}/${r.correct.den}) | ${groupsStr} |`);
      });
    }

    L.push(`\n**Severity check golds:**`);
    for (const d of pd.score.goldMatchDetails.filter((x: any) => x.importance === "severity_check"))
      L.push(`- ${d.goldId} (${d.issueTag}): expected ${d.expectedSeverityBand}, v1 assigned ${d.matchedRiskLevels.join("/") || "—"} — ${d.caught ? "" : "not matched"}`);

    L.push(`\n**Per-finding audit (run 1) — every v1 finding → gold(s) it matched:**`);
    L.push(`\n| v1 clauseId | risk | type | matched gold | original (snippet) |`);
    L.push(`|---|---|---|---|---|`);
    for (const fa of pd.findingsAudit)
      L.push(`| ${fa.clauseId} | ${fa.riskLevel} | ${fa.clauseType} | ${fa.matchedGoldIds.join(", ") || "— (none)"} | ${fa.originalSnippet.replace(/\|/g, "/")} |`);

    L.push(`\n**Unmatched v1 findings (no gold — valid-but-unlabeled OR noise):** ${pd.score.unmatchedV1ClauseIds.join(", ") || "none"}`);

    L.push(`\n### D. Stability — ${pd.id}`);
    L.push(`- run sizes: ${pd.stability.runSizes.join(", ")}`);
    L.push(`- pairwise Jaccard: ${pd.stability.pairwiseJaccard.map((x: number) => x.toFixed(2)).join(", ")} · mean ${pd.stability.meanJaccard?.toFixed(2)}`);
    L.push(`- shared signatures (≥2 runs): ${pd.stability.sharedSignatures} · severity flips: ${pd.stability.severityFlips} · flip rate ${pd.stability.severityFlipRate === null ? "n/a" : pd.stability.severityFlipRate.toFixed(2)}`);
    if (pd.stability.flipDetail.length) for (const fd of pd.stability.flipDetail) L.push(`  - flip: [${fd.bands.join(" → ")}] "${fd.signature}"`);

    L.push(`\n### E. Cost / latency — ${pd.id} (observed)`);
    L.push(`- per-run: ${pd.runStats.map((r: any, i: number) => `run${i + 1}=${r.calls} calls/${r.tokens} tok/${(r.ms / 1000).toFixed(1)}s (${r.count} findings)`).join(" · ")}`);
    L.push(`- averages: ${pd.cost.avgCalls.toFixed(1)} calls · ${Math.round(pd.cost.avgTokens)} tokens · ${(pd.cost.avgMs / 1000).toFixed(1)}s`);
  }

  return L.join("\n") + "\n";
}

main().catch((e) => { console.error("FATAL", e.message, e.stack); process.exit(1); });
