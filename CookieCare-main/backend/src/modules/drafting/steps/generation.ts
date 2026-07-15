
import { DraftState } from '../models/draft-state';
import { LLMTask } from "../config/model-specs.js";
import { LLMProvider } from "../config/model-specs.js";
import { executeCompletion, executeJsonCompletion } from "../llm/index.js";
import dotenv from "dotenv"

dotenv.config()
/**
 * Clean LLM Artifact Pollution.
 * LLMs frequently wrap legal text inside markdown wrappers (e.g., ```markdown ... ```).
 * This function programmatically strips those out so it doesn't ruin document layouts.
 */
function cleanMarkdownArtifacts(rawText: string): string {
  let cleanedText = rawText.trim();
  
  // Strip opening backticks
  if (cleanedText.startsWith('```markdown')) {
    cleanedText = cleanedText.replace(/^```markdown\s*/i, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\s*/, '');
  }
  
  // Strip closing backticks
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.replace(/\s*```$/, '');
  }
  
  return cleanedText.trim();
}

export const generationStep = async (state: DraftState,provider:LLMProvider = LLMProvider.GEMINI): Promise<DraftState> => {
  if (!state.context || !state.context.assembledPrompt) {
    throw new Error('Generation Step Aborted: Context has not been assembled. state.context.assembledPrompt is null.');
  }

  // const routerClient = new OpenRouterClient({
  //   apiKey: process.env.OPENROUTER_API_KEY ?? '',
  //   model: process.env.OPENROUTER_MODEL,
  //   timeoutMs: 45000,
  // });

  try {
    // 1. Dispatch execution call using the pre-compiled context environment prompt block
    const rawModelOutput = await executeCompletion(
        state.context.assembledPrompt,
        state.context.systemPrompt,LLMTask.COMPLEX_DRAFT,provider
      
    );

    // 2. Programmatically sanitize the document data stream
    const cleanedDocumentText = cleanMarkdownArtifacts(rawModelOutput);

    // 3. Increment document version tracking variables smoothly
    const currentVersion = state.draft ? state.draft.version + 1 : 1;

    // 4. Return immutably mutated state footprint
    return {
      ...state,
      draft: {
        rawOutput: rawModelOutput,
        formattedDocument: cleanedDocumentText,
        version: currentVersion,
        parentVersionId: state.draft ? `v${state.draft.version}` : undefined
      },
      metadata: {
        ...state.metadata,
        generatedAt: new Date().toISOString(),
        modelUsed: state.metadata.generationParameters?.model || 'anthropic/claude-3.5-sonnet'
      }
    };

  } catch (error) {
    console.error('Fatal execution exception within generation step component:', error);
    throw new Error(`Generation Layer Failure: ${(error as Error).message}`);
  }
};