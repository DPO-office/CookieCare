// for /refine EndPoint

import { DraftState } from "../models/draft-state";

export async function refinementAssemblyStep(state: DraftState): Promise<DraftState> {
  return { ...state };
}

