import { DraftState } from "../models/draft-state";
import { requirementExtractionStep } from "../steps/requirement-extraction";
import { retrievalStep } from "../steps/retrieval";
import { contextAssemblyStep } from "../steps/context-assembly";
import { generationStep } from "../steps/generation";
import { validationStep } from "../steps/validation";
import { riskReviewStep } from "../steps/risk-review";
import { contextAssemblyRefinementStep } from "../steps/refinement-assembly";
import { saveStep } from "../steps/save";
import {
  resolveValidationSurgicalPlan,
  planHumanRefine,
  regenerateSections,
} from "../steps/section-refine";

// Small helper so we don't repeat the null-guard everywhere
async function progress(state: DraftState, percent: number, message: string) {
  if (state.onProgress) {
    await state.onProgress(percent, message).catch(() => {/* non-fatal */});
  }
}

type StepTiming = { label: string; ms: number };

/**
 * OBSERVABILITY: wrap a pipeline step so we can measure where wall-clock time goes.
 * Records each step's duration into state.metadata.stepTimings without changing the
 * step's own return shape. This is the baseline we optimize against.
 */
async function timed(
  state: DraftState,
  label: string,
  fn: (s: DraftState) => Promise<DraftState>
): Promise<DraftState> {
  const start = Date.now();
  const next = await fn(state);
  const ms = Date.now() - start;
  const prior = Array.isArray((next.metadata as { stepTimings?: StepTiming[] })?.stepTimings)
    ? ((next.metadata as { stepTimings?: StepTiming[] }).stepTimings as StepTiming[])
    : [];
  return {
    ...next,
    metadata: {
      ...next.metadata,
      stepTimings: [...prior, { label, ms }]
    }
  };
}

/** Append a manually measured timing (used for the parallel validate+risk block). */
function withTiming(state: DraftState, label: string, ms: number): DraftState {
  const prior = Array.isArray((state.metadata as { stepTimings?: StepTiming[] })?.stepTimings)
    ? ((state.metadata as { stepTimings?: StepTiming[] }).stepTimings as StepTiming[])
    : [];
  return {
    ...state,
    metadata: { ...state.metadata, stepTimings: [...prior, { label, ms }] }
  };
}

function logTimings(state: DraftState, pipeline: string): void {
  const timings = ((state.metadata as { stepTimings?: StepTiming[] })?.stepTimings ?? []) as StepTiming[];
  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  const breakdown = timings.map((t) => `${t.label}=${t.ms}ms`).join("  ");
  console.log(`[Timings/${pipeline}] total=${total}ms  ${breakdown}`);
}

export class DraftWorkflowOrchestrator {
  /**
   * Pipeline 1: Generation from Scratch / Template
   */
  async executeInitialWorkflow(initialState: DraftState): Promise<DraftState> {
    let state: DraftState = { ...initialState };
    try {
      // Step 1 — Requirement Extraction
      await progress(state, 52, "Thinking: understanding your requirements...");
      state = await timed(state, "requirementExtraction", (s) => requirementExtractionStep(s));

      // Step 2 — Retrieval (templates, playbooks, historical refs)
      await progress(state, 57, "Retrieving templates, playbooks and references...");
      state = await timed(state, "retrieval", (s) => retrievalStep(s));
      console.log(state)

      // Step 3 — Context Assembly
      await progress(state, 63, "Assembling document context and structure...");
      state = await timed(state, "contextAssembly", (s) => contextAssemblyStep(s));

      // Step 4 — Core Generation (heaviest LLM call)
      await progress(state, 68, "Generating document, this may take time...");
      state = await timed(state, "generation", (s) => generationStep(s));

      // Step 5 & 6 — Validation + Risk Review (parallel)
      await progress(state, 78, "Validating structure and reviewing risks...");
      console.log("Executing Validation and Risk Review pipelines concurrently...");
      const parallelStart = Date.now();
      const [validationState, riskReviewState] = await Promise.all([
        validationStep(state),
        riskReviewStep(state)
      ]);
      const parallelMs = Date.now() - parallelStart;

      // Step — Merge parallel results
      state = {
        ...state,
        validation: validationState?.validation,
        riskReview: riskReviewState?.riskReview,
        metadata: {
          ...state.metadata,
          ...validationState?.metadata,
          ...riskReviewState?.metadata
        }
      };
      state = withTiming(state, "validate+riskReview", parallelMs);

      // Step — Refinement loop (runs only when validation fails)
      // SURGICAL FIRST: if every critical issue maps to an existing section we
      // regenerate ONLY those sections (fast). Otherwise fall back to the previous
      // full-document regeneration so behavior is never worse than before.
      let attempt = 0;
      const maxAttempt = 1;
      while (!state.validation?.isValid && attempt < maxAttempt) {
        await progress(state, 84, `Refining draft (attempt ${attempt + 1})...`);

        const surgicalPlan = resolveValidationSurgicalPlan(state);
        if (surgicalPlan && surgicalPlan.length > 0) {
          console.log(`Surgical validation refine: patching ${surgicalPlan.length} section(s)`);
          const surgicalStart = Date.now();
          state = await regenerateSections(state, surgicalPlan, "validator");
          state = withTiming(state, `surgicalRefine(attempt ${attempt + 1})`, Date.now() - surgicalStart);
          // Re-validate only the patched document (deterministic-fast on refine passes)
          state = await timed(state, `revalidate(attempt ${attempt + 1})`, (s) => validationStep(s));
        } else {
          // LATENCY: previous behavior — full-document regeneration (comment-swappable fallback)
          console.log(`Full-doc validation refine fallback (Attempt ${attempt + 1})`);
          state = await contextAssemblyRefinementStep(state);
          state = await timed(state, `fullRegen(attempt ${attempt + 1})`, (s) => generationStep(s));
        }
        attempt++;
      }

      // Step — Save (database write)
      await progress(state, 92, "Saving document to your vault...");
      console.log("Pipeline complete. Committing final state snapshot to database ledger...");
      state = await timed(state, "save", (s) => saveStep(s));

      logTimings(state, "initial");
      return state;

    } catch (error) {
      throw new Error(
        `Initial drafting orchestrator failed: ${(error as Error).message}`
      );
    }
  }

  /**
   * Pipeline 2: Targeted Document Refinement Cycle
   */
  async executeHumanRefinementPipeline(initialState1: DraftState): Promise<DraftState> {
    try {
      let state = initialState1;

      await progress(state, 50, "Applying your changes to the document...");

      // SURGICAL FIRST: when the user highlighted text that maps to a single section,
      // regenerate ONLY that section (one small Pro call) instead of the whole document.
      const humanPlan = planHumanRefine(state);
      let usedSurgical = false;

      if (humanPlan && humanPlan.length > 0) {
        await progress(state, 62, "Revising the highlighted section...");
        const surgicalStart = Date.now();
        state = await regenerateSections(state, humanPlan, "user");
        state = withTiming(state, "surgicalHumanRefine", Date.now() - surgicalStart);
        state = await timed(state, "revalidate", (s) => validationStep(s));
        usedSurgical = true;
      }

      if (!usedSurgical) {
        // FULL-DOC fallback: whole-document instruction, or no resolvable section
        // (preserves the previous behavior exactly).
        let attempts = 0;
        const MAX_RETRY_ATTEMPTS = 1;
        while (attempts < MAX_RETRY_ATTEMPTS) {
          await progress(state, 55 + attempts * 10, `Refining content (pass ${attempts + 1})...`);

          const updateState = await contextAssemblyRefinementStep(state);

          await progress(state, 65 + attempts * 10, "Generating revised clauses...");
          const generateState = await timed(updateState, `fullRegen(pass ${attempts + 1})`, (s) => generationStep(s));

          await progress(state, 75, "Validating document structure...");
          state = await timed(generateState, `revalidate(pass ${attempts + 1})`, (s) => validationStep(s));

          const hasStructuralProblems = state.validation?.issues.some(
            (issue) => issue.type === "omission" && issue.severity === "critical"
          ) ?? false;

          if (!hasStructuralProblems) {
            break;
          }
          attempts++;
        }
      }

      const stillHasGlitches = state.validation?.issues.some(
        (issue) => (issue.type === "formatting" || issue.type === "omission") && issue.severity === "critical"
      ) ?? false;

      if (stillHasGlitches) {
        return {
          ...state,
          draft: state.draft,
          validation: {
            isValid: false,
            issues: [
              {
                type: "omission",
                severity: "critical",
                description: "Refinement aborted: The generation engine corrupted the document structure. Restored prior version."
              }
            ]
          }
        };
      }

      await progress(state, 85, "Reviewing risks in refined document...");
      const riskEvaluatedState = await timed(state, "riskReview", (s) => riskReviewStep(s));

      await progress(state, 92, "Saving refined document...");
      const finalizedState = await timed(riskEvaluatedState, "save", (s) => saveStep(s));

      logTimings(finalizedState, "refine");
      return finalizedState;

    } catch (error) {
      throw new Error(
        `Refinement cycle orchestrator failed: ${(error as Error).message}`
      );
    }
  }
}
