import { DraftState } from "../models/draft-state";

export async function retrievalStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

