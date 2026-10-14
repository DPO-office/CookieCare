/**
 * clause-align.ts — Step 3 of the Compare pipeline
 *
 * Structure-first alignment:
 *   1. Deterministic hash/LCS matching (high-confidence 1:1).
 *   2. Weighted structural scoring of residuals.
 *   3. Confidence gate — confident MATCH/MOVED locally; ambiguous pairs only
 *      go to AI verification (structured clause data, not raw PDFs).
 *   4. SPLIT/MERGED detection, then unmatched classification.
 *   5. Uniqueness enforcement. LLM failure → UNCERTAIN, never fake ADDED/REMOVED.
 */

import { CompareState, AlignedPair, ExtractedClause } from "../models/compare-state.js";
import { runDeterministicMatching } from "../utils/deterministic-matcher.js";
import { getSkill } from "../utils/knowledge-loader.js";
import {
  verificationSystemInstruction,
  buildVerificationPrompt,
  type VerificationCandidatePrompt,
} from "../prompts/alignment-prompt.js";
import {
  AlignmentVerifyResponseSchema,
  ALIGNMENT_VERIFY_JSON_SCHEMA,
  type AlignmentVerifyEntry,
} from "../schemas/alignment-verify-schema.js";
import { executeJsonCompletionWithMeta } from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";
import {
  AI_MATCH_CONFIDENCE_FLOOR,
  buildAlignedPair,
  claimedClauseIds,
  enforceOrdinaryMatchUniqueness,
  makePairFactory,
  type AlignmentRelationship,
} from "../utils/alignment-contract.js";
import {
  assignStructuralMatches,
  classifyUnmatchedResiduals,
  detectSplitMerge,
  isChangelogTitle,
  moduleKeysById,
  type ScoredCandidate,
} from "../utils/structural-scorer.js";

const LLM_BATCH_SIZE = 15;

function parentOf(clause: ExtractedClause): string {
  const path = clause.sectionPath;
  if (path.length >= 2) return path[path.length - 2];
  return path[0] ?? "";
}

function neighborSummary(list: ExtractedClause[], index: number): string {
  const prev = list[index - 1];
  const next = list[index + 1];
  return [
    prev ? `prev=${prev.title}` : "prev=none",
    next ? `next=${next.title}` : "next=none",
  ].join(" | ");
}

function toVerifyPrompt(
  cand: ScoredCandidate,
  allA: ExtractedClause[],
  allB: ExtractedClause[]
): VerificationCandidatePrompt {
  const modulesA = moduleKeysById(allA);
  const modulesB = moduleKeysById(allB);
  return {
    clauseAId: cand.clauseA.id,
    clauseBId: cand.clauseB.id,
    titleA: cand.clauseA.title,
    titleB: cand.clauseB.title,
    sectionPathA: cand.clauseA.sectionPath,
    sectionPathB: cand.clauseB.sectionPath,
    parentA: parentOf(cand.clauseA),
    parentB: parentOf(cand.clauseB),
    positionA: cand.indexA,
    positionB: cand.indexB,
    textA: cand.clauseA.text,
    textB: cand.clauseB.text,
    neighborA: neighborSummary(allA, cand.indexA),
    neighborB: neighborSummary(allB, cand.indexB),
    structuralScore: cand.score,
    structuralReasons: cand.reasons,
    moduleA: modulesA.get(cand.clauseA.id) ?? "",
    moduleB: modulesB.get(cand.clauseB.id) ?? "",
  };
}

function applyVerifyEntries(
  entries: AlignmentVerifyEntry[],
  candidates: ScoredCandidate[],
  claimedA: Set<string>,
  claimedB: Set<string>,
  allowedA: Set<string>,
  allowedB: Set<string>,
  nextId: () => string
): AlignedPair[] {
  const byKey = new Map(
    candidates.map((c) => [`${c.clauseA.id}|${c.clauseB.id}`, c])
  );
  const ranked = [...entries].sort((a, b) => b.confidence - a.confidence);
  const pairs: AlignedPair[] = [];

  for (const entry of ranked) {
    if (!allowedA.has(entry.clauseAId)) continue;
    if (entry.clauseBId && !allowedB.has(entry.clauseBId)) continue;

    const cand = entry.clauseBId
      ? byKey.get(`${entry.clauseAId}|${entry.clauseBId}`)
      : undefined;

    let rel = entry.relationship as AlignmentRelationship | "NOT_MATCH";
    if (rel === "NOT_MATCH" || !entry.same_underlying_subject) continue;
    if (rel === "UNCERTAIN") continue;
    if (rel === "SPLIT" || rel === "MERGED") continue;
    if (entry.confidence < AI_MATCH_CONFIDENCE_FLOOR) continue;

    const changelogB =
      (cand && isChangelogTitle(cand.clauseB.title)) ||
      (entry.clauseBId != null &&
        candidates.some(
          (c) => c.clauseB.id === entry.clauseBId && isChangelogTitle(c.clauseB.title)
        ));
    if (changelogB) continue;

    if (rel === "MATCH" || rel === "MOVED") {
      if (claimedA.has(entry.clauseAId)) continue;
      if (!entry.clauseBId || claimedB.has(entry.clauseBId)) continue;
    }

    if ((rel === "MATCH" || rel === "MOVED") && !entry.clauseBId) {
      continue;
    }

    const reasons = [
      entry.reason,
      cand ? `structural score ${cand.score.toFixed(2)}` : "AI verification",
      ...(cand?.reasons ?? []),
    ];

    pairs.push(
      buildAlignedPair(nextId, {
        clauseAId: entry.clauseAId,
        clauseBId: entry.clauseBId,
        relationshipType: rel,
        matchConfidence: entry.confidence,
        alignmentMethod: "structural+semantic",
        alignmentReasons: reasons,
      })
    );

    if (rel === "MATCH" || rel === "MOVED") {
      claimedA.add(entry.clauseAId);
      if (entry.clauseBId) claimedB.add(entry.clauseBId);
    }
  }

  return pairs;
}

async function verifyAmbiguous(
  candidates: ScoredCandidate[],
  allA: ExtractedClause[],
  allB: ExtractedClause[],
  claimedA: Set<string>,
  claimedB: Set<string>,
  nextId: () => string
): Promise<{ pairs: AlignedPair[]; llmFailed: boolean }> {
  if (candidates.length === 0) return { pairs: [], llmFailed: false };

  const skill = getSkill("clause-alignment");
  const fullSystemInstruction = `${skill}\n\n---\n\n${verificationSystemInstruction}`;
  const allowedA = new Set(candidates.map((c) => c.clauseA.id));
  const allowedB = new Set(candidates.map((c) => c.clauseB.id));
  const pairs: AlignedPair[] = [];
  let llmFailed = false;

  for (let i = 0; i < candidates.length; i += LLM_BATCH_SIZE) {
    const batch = candidates.slice(i, i + LLM_BATCH_SIZE);
    const prompt = buildVerificationPrompt(batch.map((c) => toVerifyPrompt(c, allA, allB)));

    console.log(
      `[clauseAlignStep] AI verify batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ${batch.length} candidate pair(s)`
    );

    try {
      const { result, usage } = await executeJsonCompletionWithMeta<AlignmentVerifyEntry[]>(
        prompt,
        fullSystemInstruction,
        ALIGNMENT_VERIFY_JSON_SCHEMA,
        LLMTask.COMPARE_ALIGN,
        LLMProvider.GEMINI
      );
      pipelineMetrics.record("clauseAlign", {
        llmRequests: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        llmItems: batch.length,
      });

      const parsed = AlignmentVerifyResponseSchema.safeParse(result);
      if (!parsed.success) {
        console.warn(
          `[clauseAlignStep] Zod validation failed for verify batch — treating batch as UNCERTAIN. ` +
            `Errors: ${JSON.stringify(parsed.error.issues)}`
        );
        llmFailed = true;
        pipelineMetrics.record("clauseAlign", { fallbackItems: batch.length });
        continue;
      }

      pairs.push(
        ...applyVerifyEntries(
          parsed.data,
          batch,
          claimedA,
          claimedB,
          allowedA,
          allowedB,
          nextId
        )
      );
    } catch (llmErr: any) {
      console.warn(
        `[clauseAlignStep] LLM verify failed for batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
          llmErr.message +
          " — remaining candidates stay UNCERTAIN (not ADDED/REMOVED)."
      );
      llmFailed = true;
      pipelineMetrics.record("clauseAlign", {
        llmRequests: 1,
        fallbackItems: batch.length,
      });
    }
  }

  return { pairs, llmFailed };
}

export async function clauseAlignStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.structure) {
    throw new Error(
      "[clauseAlignStep] state.structure is null — structureExtractStep must run before clause alignment."
    );
  }

  const { clausesA, clausesB } = state.structure;
  const clauseMapA = new Map(clausesA.map((c) => [c.id, c]));
  const clauseMapB = new Map(clausesB.map((c) => [c.id, c]));

  const deterministic = runDeterministicMatching(clausesA, clausesB, 0);
  const nextId = makePairFactory(deterministic.nextPairSeq);

  console.log(
    `[clauseAlignStep] Deterministic: ${deterministic.matched.length} pair(s) matched | ` +
      `residual: ${deterministic.residualA.length} A clause(s), ${deterministic.residualB.length} B clause(s)`
  );

  pipelineMetrics.record("clauseAlign", {
    deterministicItems: deterministic.matched.length,
  });

  const structural = assignStructuralMatches(
    deterministic.residualA,
    deterministic.residualB,
    clausesA,
    clausesB,
    nextId
  );

  console.log(
    `[clauseAlignStep] Structural: ${structural.confident.length} confident | ` +
      `${structural.ambiguous.length} ambiguous → AI | ` +
      `leftover A=${structural.leftoverA.length} B=${structural.leftoverB.length}`
  );

  const matchedSoFar: AlignedPair[] = [
    ...deterministic.matched,
    ...structural.confident,
  ];
  const { claimedA, claimedB } = claimedClauseIds(matchedSoFar);

  const verified = await verifyAmbiguous(
    structural.ambiguous,
    clausesA,
    clausesB,
    claimedA,
    claimedB,
    nextId
  );
  matchedSoFar.push(...verified.pairs);

  const afterVerify = claimedClauseIds(matchedSoFar);
  let leftoverA = clausesA.filter((c) => !afterVerify.claimedA.has(c.id));
  let leftoverB = clausesB.filter((c) => !afterVerify.claimedB.has(c.id));

  const splitMerge = detectSplitMerge(
    leftoverA,
    leftoverB,
    matchedSoFar,
    clauseMapA,
    clauseMapB,
    nextId
  );
  matchedSoFar.push(...splitMerge.pairs);
  leftoverA = leftoverA.filter((c) => !splitMerge.consumedA.has(c.id));
  leftoverB = leftoverB.filter((c) => !splitMerge.consumedB.has(c.id));

  const unmatched = classifyUnmatchedResiduals(
    leftoverA,
    leftoverB,
    clausesA,
    clausesB,
    matchedSoFar,
    nextId
  );
  matchedSoFar.push(...unmatched.pairs);

  const alignment = enforceOrdinaryMatchUniqueness(matchedSoFar);

  const relCount = (rel: string) =>
    alignment.filter((p) => p.relationshipType === rel).length;

  console.log(
    `[clauseAlignStep] Final alignment: ${alignment.length} pair(s) — ` +
      `MATCH=${relCount("MATCH")} MOVED=${relCount("MOVED")} ` +
      `ADDED=${relCount("ADDED")} REMOVED=${relCount("REMOVED")} ` +
      `SPLIT=${relCount("SPLIT")} MERGED=${relCount("MERGED")} ` +
      `UNCERTAIN=${relCount("UNCERTAIN")}` +
      (verified.llmFailed ? " (LLM verify incomplete → UNCERTAIN, not fake add/remove)" : "")
  );

  return {
    ...state,
    alignment,
    metadata: {
      ...state.metadata,
      alignmentStats: {
        match: relCount("MATCH"),
        moved: relCount("MOVED"),
        added: relCount("ADDED"),
        removed: relCount("REMOVED"),
        split: relCount("SPLIT"),
        merged: relCount("MERGED"),
        uncertain: relCount("UNCERTAIN"),
        aiCandidatePairs: structural.ambiguous.length,
        llmFailed: verified.llmFailed,
      },
    },
  };
}
