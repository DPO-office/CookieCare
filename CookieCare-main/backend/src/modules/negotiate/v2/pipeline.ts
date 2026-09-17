/**
 * V2 pipeline orchestration (Stages 0–6) with safe degradation.
 * Pure of any DB/session side-effects — takes plaintext, returns a V2Result.
 * Each LLM stage is guarded so one failure degrades the mode instead of throwing.
 */
import { segmentDocument } from "./segment.js";
import { classifyDocType, getRubric } from "./rubric.js";
import { buildRetrievalIndex } from "./retrieve.js";
import { runStructuralPass } from "./structural.js";
import { runSpottingPass } from "./spotting.js";
import { mergeCandidates } from "./merge.js";
import { runCriticGate } from "./critic.js";
import { finalizeFindings } from "./adapt.js";
import { Candidate, EvaluationMode, V2Result, V2_PIPELINE_VERSION } from "./types.js";

export interface PipelineOptions {
  kOverride?: number;         // force self-consistency K (tests)
  skipStructural?: boolean;
  skipSpotting?: boolean;
}

const MODE_SEVERITY: Record<EvaluationMode, number> = {
  full: 0, degraded_no_embedding: 1, degraded_uncertain_doctype: 2,
  degraded_generic_rubric: 3, degraded_no_critic: 4, failed_fallback_v1: 5,
};
function worse(a: EvaluationMode, b: EvaluationMode): EvaluationMode {
  return MODE_SEVERITY[b] > MODE_SEVERITY[a] ? b : a;
}

export async function runV2Pipeline(documentText: string, opts: PipelineOptions = {}): Promise<V2Result> {
  const t: Record<string, number> = {};
  const warnings: string[] = [];
  let mode: EvaluationMode = "full";
  let llmCalls = 0, embedCalls = 0;

  // Stage 0 — segmentation (deterministic)
  let s0 = Date.now();
  const seg = segmentDocument(documentText);
  t.segment = Date.now() - s0;

  // Stage 0b — doc-type classification + rubric
  const cls = classifyDocType(documentText);
  const rules = getRubric(cls);
  if (!cls.confident) { mode = worse(mode, "degraded_uncertain_doctype"); warnings.push(`doc-type inferred (score ${cls.score.toFixed(2)}) → ${cls.rubricSource} rubric`); }
  if (cls.rubricSource === "generic") { mode = worse(mode, "degraded_generic_rubric"); warnings.push("no doc-type skill matched → generic rubric (reduced structural coverage)"); }

  // Stage 0c — retrieval index (embeddings optional)
  s0 = Date.now();
  const index = await buildRetrievalIndex(seg.segments, rules);
  embedCalls += index.embedCalls;
  if (!index.usedEmbeddings) { mode = worse(mode, "degraded_no_embedding"); warnings.push("embeddings unavailable → lexical retrieval/dedup"); }
  t.retrieve = Date.now() - s0;

  const candidates: Candidate[] = [];

  // Stage 1a — structural / absence pass (guarded)
  if (!opts.skipStructural) {
    s0 = Date.now();
    try {
      const out = await runStructuralPass(documentText, rules, index);
      candidates.push(...out.candidates); llmCalls += out.llmCalls;
    } catch (e: any) { warnings.push(`structural pass failed: ${e?.message ?? e}`); }
    t.structural = Date.now() - s0;
  }

  // Stage 1b — issue-spotting + adaptive self-consistency (guarded)
  if (!opts.skipSpotting) {
    s0 = Date.now();
    try {
      const out = await runSpottingPass(documentText, seg.segments, opts.kOverride);
      candidates.push(...out.candidates); llmCalls += out.llmCalls;
    } catch (e: any) { warnings.push(`spotting pass failed: ${e?.message ?? e}`); }
    t.spotting = Date.now() - s0;
  }

  // Stage 2 — merge/dedup (pure; tag-based, embeddings optional)
  s0 = Date.now();
  const merged = mergeCandidates(candidates);
  t.merge = Date.now() - s0;

  // Stage 3 — critic gate (safe fail)
  s0 = Date.now();
  const critic = await runCriticGate(merged, documentText);
  llmCalls += critic.llmCalls;
  if (!critic.criticAvailable) { mode = worse(mode, "degraded_no_critic"); warnings.push(critic.warning ?? "critic unavailable → findings kept UNVERIFIED"); }
  t.critic = Date.now() - s0;

  // Stage 4/6 — finalize + deterministic L/N/P
  s0 = Date.now();
  const { findings } = finalizeFindings(merged, critic, documentText);
  t.finalize = Date.now() - s0;

  return {
    pipelineVersion: V2_PIPELINE_VERSION,
    segmenterVersion: seg.segmenterVersion,
    contentHash: seg.contentHash,
    docType: cls.docType,
    docTypeConfident: cls.confident,
    evaluationMode: mode,
    warnings,
    findings,
    stageTimingsMs: t,
    llmCalls,
    embedCalls,
  };
}
