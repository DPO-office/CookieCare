// ─── useLoadingStage ──────────────────────────────────────────────────────────
// Cycles through loading stage labels while streaming is active.

import { useState, useEffect } from "react";
import { LOADING_STAGES } from "../constants";

export function useLoadingStage(active: boolean): number {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    const id = setInterval(
      () => setStage((s) => (s + 1) % LOADING_STAGES.length),
      1800
    );
    return () => clearInterval(id);
  }, [active]);

  return stage;
}
