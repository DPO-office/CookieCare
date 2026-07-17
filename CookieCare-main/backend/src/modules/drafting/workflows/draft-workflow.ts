import { DraftState } from "../models/draft-state";
import { requirementExtractionStep } from "../steps/requirement-extraction";
import { retrievalStep } from "../steps/retrieval";
import { contextAssemblyStep } from "../steps/context-assembly";
import { generationStep } from "../steps/generation";
import { validationStep } from "../steps/validation";
import { riskReviewStep } from "../steps/risk-review";
import { contextAssemblyRefinementStep } from "../steps/refinement-assembly";
import { saveStep } from "../steps/save";

// Small helper so we don't repeat the null-guard everywhere
async function progress(state: DraftState, percent: number, message: string) {
  if (state.onProgress) {
    await state.onProgress(percent, message).catch(() => {/* non-fatal */});
  }
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
      state = await requirementExtractionStep(state);

      // Step 2 — Retrieval (templates, playbooks, historical refs)
      await progress(state, 57, "Retrieving templates, playbooks and references...");
      state = await retrievalStep(state);

      // Step 3 — Context Assembly
      await progress(state, 63, "Assembling document context and structure...");
      state = await contextAssemblyStep(state);

      // Step 4 — Core Generation (heaviest LLM call)
      await progress(state, 68, "Generating document — this may take a minute...");
      state = await generationStep(state);

      // Step 5 & 6 — Validation + Risk Review (parallel)
      await progress(state, 78, "Validating structure and reviewing risks...");
      console.log("Executing Validation and Risk Review pipelines concurrently...");
      const [validationState, riskReviewState] = await Promise.all([
        validationStep(state),
        riskReviewStep(state)
      ]);

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

      // Step — Refinement loop (runs only when validation fails)
      let attempt = 0;
      const maxAttempt = 1;
      while (!state.validation?.isValid && attempt < maxAttempt) {
        await progress(state, 84, `Refining draft (attempt ${attempt + 1})...`);
        console.log(`Entered validation refinement loop (Attempt ${attempt + 1})`);
        state = await contextAssemblyRefinementStep(state);
        state = await generationStep(state);
        attempt++;
      }

      // Step — Save (database write)
      await progress(state, 92, "Saving document to your vault...");
      console.log("Pipeline complete. Committing final state snapshot to database ledger...");
      state = await saveStep(state);

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
      let attempts = 0;
      const MAX_RETRY_ATTEMPTS = 1;
      let initialState = initialState1;

      await progress(initialState, 50, "Applying your changes to the document...");

      while (attempts < MAX_RETRY_ATTEMPTS) {
        await progress(initialState, 55 + attempts * 10, `Refining content (pass ${attempts + 1})...`);

        const updateState = await contextAssemblyRefinementStep(initialState);

        await progress(initialState, 65 + attempts * 10, "Generating revised clauses...");
        const generateState = await generationStep(updateState);

        await progress(initialState, 75, "Validating document structure...");
        initialState = await validationStep(generateState);

        const hasStructuralProblems = initialState.validation?.issues.some(
          (issue) => issue.type === "omission" && issue.severity === "critical"
        ) ?? false;

        if (!hasStructuralProblems) {
          break;
        }
        attempts++;
      }

      const stillHasGlitches = initialState.validation?.issues.some(
        (issue) => (issue.type === "formatting" || issue.type === "omission") && issue.severity === "critical"
      ) ?? false;

      if (stillHasGlitches) {
        return {
          ...initialState,
          draft: initialState.draft,
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

      await progress(initialState, 85, "Reviewing risks in refined document...");
      const riskEvaluatedState = await riskReviewStep(initialState);

      await progress(initialState, 92, "Saving refined document...");
      const finalizedState = await saveStep(riskEvaluatedState);
      return finalizedState;

    } catch (error) {
      throw new Error(
        `Refinement cycle orchestrator failed: ${(error as Error).message}`
      );
    }
  }
}
