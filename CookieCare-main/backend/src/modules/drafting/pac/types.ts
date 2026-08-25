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

export interface UserQuestion {
  id: string;
  field: string;
  question: string;
  severity: "critical" | "optional";
  options?: string[];
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
