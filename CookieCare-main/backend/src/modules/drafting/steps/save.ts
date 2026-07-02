import { DraftState } from "../models/draft-state";

export async function saveStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

