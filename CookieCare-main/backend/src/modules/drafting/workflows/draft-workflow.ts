import { DraftState } from "../models/draft-state";
import { requirementExtractionStep } from "../steps/requirement-extraction";
import { retrievalStep } from "../steps/retrieval";
import { contextAssemblyStep } from "../steps/context-assembly";
import { generationStep } from "../steps/generation";
import { validationStep } from "../steps/validation";
import { riskReviewStep } from "../steps/risk-review";
import { contextAssemblyRefinementStep } from "../steps/refinement-assembly";
import { saveStep } from "../steps/save";
import { initSentry } from "@/backend/src/config/sentry";

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

      let attempt = 0;
      const maxAttempt = 2;

      while (!state.validation.isValid && attempt<maxAttempt){
        state = await contextAssemblyRefinementStep(state);
        state = await generationStep(state);
        state = await validationStep(state);

        attempt++;

      }

      state = await saveStep(state)
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

  async executeHumanRefinementPipeline (initialState1:DraftState): Promise<DraftState> {

    try{
      let attempts = 0;
      const MAX_RETRY_ATTEMPTS = 2;
      let initialState = initialState1

      while (attempts < MAX_RETRY_ATTEMPTS){

        const updateState = await contextAssemblyRefinementStep(initialState);
        const generateState = await generationStep(updateState)
        initialState = await validationStep(generateState)
  
        
        // We check the 'issues' array directly for structural 'omission' types.
        // We ignore playbook violations here because the human explicitly wanted custom variations!
        const hasStucturalProblems = initialState.validation.issues.some((issue)=>issue.type === "omission" && issue.severity === "critical") ?? false;
        
        
        if (!hasStucturalProblems){
          break
        }
        attempts++
      }

      const stillHasGlitches = initialState.validation?.issues.some(
        (issue) => (issue.type === 'formatting' || issue.type === 'omission') && issue.severity === 'critical'
      ) ?? false;

      if (stillHasGlitches){
        return {
          ...initialState,
          draft: initialState.draft, // Rollback text to the stable v1 document copy
          validation: {
            isValid: false,
            issues: [
              {
                type: 'omission',
                severity: 'critical',
                description: 'Refinement aborted: The generation engine corrupted the document structure. Restored prior version.'
              }
            ]
          }
        };
      }
      

      const riskEvaluatedState = await riskReviewStep(initialState);

      const finalizedState = await saveStep(riskEvaluatedState); 
      return finalizedState;

    }
    catch(error){
      throw new Error(
              `Refinement cycle orchestrator failed: ${(error as Error).message}`
            );


    }


  }
  // async executeRefinementWorkflow(initialState: DraftState): Promise<DraftState> {
  //   let state: DraftState = { ...initialState };
  //   try {
  //     // Skip extraction; load historical generation context + playbook directly from past state
  //     state = await retrievalStep(state);
  //     // Specialized assembly combining context + summary + highlights + instructions
  //     state = await refinementAssemblyStep(state);
  //     // Execution, validation, and saving as an incremented version
  //     state = await generationStep(state);
  //     state = await validationStep(state);
  //     state = await riskReviewStep(state);
  //     state = await saveStep(state);
  //     return state;
  //   } catch (error) {
  //     throw new Error(
  //       `Refinement cycle orchestrator failed: ${(error as Error).message}`
  //     );
  //   }
  // }
}

