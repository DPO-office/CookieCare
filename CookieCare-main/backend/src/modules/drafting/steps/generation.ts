import { DraftState } from "../models/draft-state";

export async function generationStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

