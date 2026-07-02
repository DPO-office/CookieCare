import { DraftState } from "../models/draft-state";

export async function validationStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

