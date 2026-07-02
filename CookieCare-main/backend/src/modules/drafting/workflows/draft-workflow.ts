import { DraftState } from "../models/draft-state";
import { requirementExtractionStep } from "../steps/requirement-extraction";
import { retrievalStep } from "../steps/retrieval";
import { contextAssemblyStep } from "../steps/context-assembly";
import { generationStep } from "../steps/generation";
import { validationStep } from "../steps/validation";
import { riskReviewStep } from "../steps/risk-review";
import { refinementAssemblyStep } from "../steps/refinement-assembly";
import { saveStep } from "../steps/save";

export class DraftWorkflowOrchestrator {
  /**
   * Pipeline 1: Generation from Scratch / Template
   */
  async executeInitialWorkflow(initialState: DraftState): Promise<DraftState> {
    let state: DraftState = { ...initialState };
    try {
      state = await requirementExtractionStep(state);
      state = await retrievalStep(state);
      state = await contextAssemblyStep(state);
      state = await generationStep(state);
      state = await validationStep(state);
      state = await riskReviewStep(state);
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
  async executeRefinementWorkflow(initialState: DraftState): Promise<DraftState> {
    let state: DraftState = { ...initialState };
    try {
      // Skip extraction; load historical generation context + playbook directly from past state
      state = await retrievalStep(state);
      // Specialized assembly combining context + summary + highlights + instructions
      state = await refinementAssemblyStep(state);
      // Execution, validation, and saving as an incremented version
      state = await generationStep(state);
      state = await validationStep(state);
      state = await riskReviewStep(state);
      state = await saveStep(state);
      return state;
    } catch (error) {
      throw new Error(
        `Refinement cycle orchestrator failed: ${(error as Error).message}`
      );
    }
  }
}

