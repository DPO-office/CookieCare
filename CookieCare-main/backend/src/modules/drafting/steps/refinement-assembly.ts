
import { DraftState } from '../models/draft-state';
import * as templates from '../prompts/system-templates';

/**
 * Pure function pipeline step for refinement prompt compilation.
 * Compiles automated validation errors and manual human edits into a single instruction set.
 */
export const contextAssemblyRefinementStep = async (state: DraftState): Promise<DraftState> => {
  // 1. Guard check: We cannot refine a contract if a previous draft doesn't exist
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error('Refinement Assembly Aborted: No existing draft document found in state to refine.');
  }

  const existingDraftText = state.draft.formattedDocument;
  const playbookRules = state.retrieval.applicablePlaybookRules || [];
  const activeSkeleton = state.context?.documentSkeleton || [];

  // 2. Build the unified list blending validation errors AND human inputs dynamically
  const unifiedCorrections = templates.buildUnifiedCorrectionList(
    state.validation?.issues,      
    state.request.highlightedText,   
    state.request.rawInstructions    
  );

  // 3. Compile the structural prompt sequence matrix (Optimized for prompt prefix caching)
  const fullRefinementPrompt = [
    templates.REFINEMENT_CORE_GUARDRAILS,
    templates.buildPlaybookSection(playbookRules),
    `# CURRENT DOCUMENT DRAFT SNAPSHOT (CURRENTLY UNSTABLE)\nUse this text as your base copy. Apply revisions directly onto it:\n\n${existingDraftText}`,
    templates.buildSkeletonSection(activeSkeleton),
    unifiedCorrections // Highly dynamic instructions sit right at the bottom!
  ].join('\n\n');

  return {
    ...state,
    context: {
      ...state.context,
      systemPrompt: templates.REFINEMENT_CORE_GUARDRAILS,
      assembledPrompt: fullRefinementPrompt,
      documentSkeleton: activeSkeleton
    },
    metadata: {
      ...state.metadata,
      refinementPromptAssembledAt: new Date().toISOString(),
      currentRefinementVersionLoop: state.draft.version
    }
  };
};