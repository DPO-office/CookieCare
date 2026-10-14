/**
 * Run-to-run stability: pairwise Jaccard + severity-flip rate.
 *
 * The approved metric keys stability on (clauseRef + issueTag). v1 emits
 * NEITHER, so at Stage 0 we use a documented v1-PROXY identity: the normalized
 * first 120 chars of `original` + clauseType. This is only for measuring v1's
 * own instability; v2 will use real clauseRef+issueTag.
 */
import type { V1Finding } from "./types.js";
import { norm } from "./match.js";

export function v1ProxySignature(f: V1Finding): string {
  return norm(f.original).slice(0, 120) + "|" + norm(f.clauseType);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

export interface StabilityResult {
  runSizes: number[];
  pairwiseJaccard: number[];      // one per unordered pair of runs
  meanJaccard: number | null;
  sharedSignatures: number;       // signatures present in >= 2 runs
  severityFlips: number;          // shared signatures whose riskLevel differs across the runs it appears in
  severityFlipRate: number | null;
  flipDetail: { signature: string; bands: string[] }[];
}

export function computeStability(
  runs: V1Finding[][],
  sigFn: (f: V1Finding) => string = v1ProxySignature
): StabilityResult {
  const sets = runs.map((r) => new Set(r.map(sigFn)));

  const pairwise: number[] = [];
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++)
      pairwise.push(jaccard(sets[i], sets[j]));
  const meanJaccard = pairwise.length ? pairwise.reduce((a, b) => a + b, 0) / pairwise.length : null;

  // Map signature -> bands observed across runs (dedup within a run).
  const bandsBySig = new Map<string, Map<number, string>>();
  runs.forEach((run, runIdx) => {
    for (const f of run) {
      const s = sigFn(f);
      if (!bandsBySig.has(s)) bandsBySig.set(s, new Map());
      // keep the first band seen for this signature within a run
      if (!bandsBySig.get(s)!.has(runIdx)) bandsBySig.get(s)!.set(runIdx, f.riskLevel);
    }
  });

  let shared = 0, flips = 0;
  const flipDetail: { signature: string; bands: string[] }[] = [];
  for (const [sig, perRun] of bandsBySig) {
    if (perRun.size < 2) continue; // present in >= 2 runs
    shared++;
    const bands = [...perRun.values()];
    const distinct = new Set(bands);
    if (distinct.size > 1) { flips++; flipDetail.push({ signature: sig.slice(0, 60) + "…", bands }); }
  }

  return {
    runSizes: runs.map((r) => r.length),
    pairwiseJaccard: pairwise,
    meanJaccard,
    sharedSignatures: shared,
    severityFlips: flips,
    severityFlipRate: shared === 0 ? null : flips / shared,
    flipDetail,
  };
}
