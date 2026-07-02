import { DraftState } from "../models/draft-state";

export async function riskReviewStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

