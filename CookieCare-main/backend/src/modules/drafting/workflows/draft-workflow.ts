import { DraftState } from "../models/draft-state";
import { requirementExtractionStep } from "../steps/requirement-extraction";
import { retrievalStep } from "../steps/retrieval";
import { contextAssemblyStep } from "../steps/context-assembly";
import { generationStep } from "../steps/generation";
import { validationStep } from "../steps/validation";
import { riskReviewStep } from "../steps/risk-review";
import { contextAssemblyRefinementStep } from "../steps/refinement-assembly";
import { saveStep } from "../steps/save";

export class DraftWorkflowOrchestrator {
  /**
   * Pipeline 1: Generation from Scratch / Template
   */
async executeInitialWorkflow(initialState: DraftState): Promise<DraftState> {
  let state: DraftState = { ...initialState };
  try {
    // Steps 1, 2, & 3 must remain sequential because prompts build on extracted metadata
    state = await requirementExtractionStep(state);
    state = await retrievalStep(state);
    state = await contextAssemblyStep(state);
    
    // Step 4: Core Generation (Heavy LLM Drafting Call)
    state = await generationStep(state);
    console.log(state)

    // ⚡ OPTIMIZATION 1: Parallelize Independent Analysis Track Components
    // Both validation and risk review evaluate the draft concurrently
    console.log("Executing Validation and Risk Review pipelines concurrently...");
    // const [validationState, riskReviewState] = await Promise.all([
    //   validationStep(state),
    //   riskReviewStep(state)
    // ]);
    const validationState = {validation:[],metadata:""}
    const riskReviewState = {riskReview:[],metadata:""}
    

    // ⚡ OPTIMIZATION 2: Safely combine the parallel states back into the master state
    // state = {
    //   ...state,
    //   validation: validationState?.validation,
    //   riskReview: riskReviewState?.riskReview,
    //   metadata: {
    //     ...state.metadata,
    //     ...validationState?.metadata,
    //     ...riskReviewState?.metadata
    //   }
    // };

    // ⚡ OPTIMIZATION 3: Removed the premature Step 7 saveStep database write entirely!

    // let attempt = 0;
    // const maxAttempt = 1;

    // while (!state.validation?.isValid && attempt < maxAttempt) {
    //   console.log(`Entered validation refinement loop (Attempt ${attempt + 1})`);

    // state = await contextAssemblyRefinementStep(state);
    // state = await generationStep(state);
    //   // state = await validationStep(state); // Re-validate the newly adjusted prose

    //   attempt++;
    // }

    // ⚡ OPTIMIZATION 4: Single, consolidated Persistence Layer write operation
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

  async executeHumanRefinementPipeline (initialState1:DraftState): Promise<DraftState> {

    try{
      let attempts = 0;
      const MAX_RETRY_ATTEMPTS = 1;
      let initialState = initialState1

      while (attempts < MAX_RETRY_ATTEMPTS){

        const updateState = await contextAssemblyRefinementStep(initialState);
        const generateState = await generationStep(updateState)
        initialState = await validationStep(generateState)
  
        
        // We check the 'issues' array directly for structural 'omission' types.
        // We ignore playbook violations here because the human explicitly wanted custom variations!
        const hasStucturalProblems = initialState.validation?.issues.some((issue)=>issue.type === "omission" && issue.severity === "critical") ?? false;
        
        
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

