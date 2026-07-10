import { DraftState } from '../models/draft-state';
import { builderReviewPrompt } from '../prompts/risk-review-template';
import { systemInstruction } from '../prompts/validation-template';
import { OpenRouterClient } from '../llm/provider/openrouter-provider';
import { LLM_RISK_REVIEW_SCHEMA, LLMRiskReviewResponse } from '../schemas/risk-review-schema';

export const riskReviewStep = async (
  state: DraftState,
  clientInstance?: OpenRouterClient
): Promise<DraftState> => {
  // 1. Guard check: Make sure there's actually text to analyze before spinning up the LLM
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error('Risk Review Aborted: Cannot perform risk analysis on an empty contract draft.');
  }


  // 2. Resolve or instantiate the provider client
  const routerClient = clientInstance ?? new OpenRouterClient({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL
  });

  // 3. Define the specialized prompt instructions
  const reviewPrompt = builderReviewPrompt(state)

  try {
    // 4. Dispatch the structured completion query
    const llmResult = await routerClient.getJsonCompletion<LLMRiskReviewResponse>(
      reviewPrompt.trim(),
      systemInstruction.trim(),
      LLM_RISK_REVIEW_SCHEMA
    );

    const activeRisks = llmResult?.risks ?? [];

    // 5. Immutably return the newly updated state with the risk report attached
    return {
      ...state,
      riskReview: {
        analyzed: true,
        risks: activeRisks
      },
      metadata: {
        ...state.metadata,
        riskReviewExecutedAt: new Date().toISOString(),
        totalRisksIdentified: activeRisks.length,
        highSeverityRisksCount: activeRisks.filter(r => r.severity === 'High').length
      }
    };

  } catch (error) {
    console.error('Non-blocking execution warning: Risk Review processing failed.', error);

    // If it fails (rate limit, parsing fluke), we record it gracefully so the draft is still saved.
    return {
      ...state,
      riskReview: {
        analyzed: false,
        risks: []
      },
      metadata: {
        ...state.metadata,
        riskReviewError: (error as Error).message,
        riskReviewExecutedAt: new Date().toISOString()
      }
    };
  }
};