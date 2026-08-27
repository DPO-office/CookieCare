/** PAC controller types — TypeScript owns phase transitions; LLM never decides skips. */

export type Phase = "PLAN" | "ACT" | "CRITIQUE" | "ASK" | "DONE";

export type EntryMode = "CREATE" | "HUMAN_REFINE";

export type StoppedReason =
  | "green"
  | "max_turns"
  | "budget_exceeded"
  | "awaiting_user"
  | "blocked"
  | "critique_cap";

/**
 * How the frontend should render the input for this question.
 *
 * - "text"        → free-form single-line text input (default)
 * - "textarea"    → free-form multi-line text input (long descriptions)
 * - "date"        → date picker
 * - "chips"       → single-select chip group (radio semantics); requires `options`
 * - "chips-multi" → multi-select chip group (checkbox semantics); requires `options`
 */
export type QuestionInputType = "text" | "textarea" | "date" | "chips" | "chips-multi";

export interface UserQuestion {
  id: string;
  field: string;
  question: string;
  severity: "critical" | "optional";
  /** Populated when inputType is "chips" or "chips-multi". */
  options?: string[];
  /**
   * Render hint for the frontend.
   * Defaults to "chips" when options are present, "text" otherwise.
   */
  inputType?: QuestionInputType;
}

export interface AgentRunState {
  phase: Phase;
  entryMode: EntryMode;
  turn: number;
  maxTurns: number;
  tokensUsed: number;
  tokenBudget: number;
  askRounds: number;
  maxAskRounds: number;
  openQuestions: UserQuestion[];
  stoppedReason?: StoppedReason;
}

export const DEFAULT_MAX_TURNS = 8;
export const DEFAULT_MAX_ASK_ROUNDS = 2;
export const DEFAULT_TOKEN_BUDGET = Number(process.env.DRAFTING_TOKEN_BUDGET || 500_000);

export function initAgentRunState(entryMode: EntryMode, overrides?: Partial<AgentRunState>): AgentRunState {
  return {
    phase: entryMode === "HUMAN_REFINE" ? "ACT" : "PLAN",
    entryMode,
    turn: 0,
    maxTurns: DEFAULT_MAX_TURNS,
    tokensUsed: 0,
    tokenBudget: DEFAULT_TOKEN_BUDGET,
    askRounds: 0,
    maxAskRounds: DEFAULT_MAX_ASK_ROUNDS,
    openQuestions: [],
    ...overrides,
  };
}
