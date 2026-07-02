import { DraftState } from "../models/draft-state";

export async function contextAssemblyStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

