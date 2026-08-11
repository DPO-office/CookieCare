/** PAC controller types — TypeScript owns phase transitions; LLM never decides skips. */

export type Phase = "PLAN" | "ACT" | "CRITIQUE" | "ASK" | "DONE";

export type EntryMode = "CREATE" | "RESUME";

export type StoppedReason =
  | "green"
  | "max_turns"
  | "budget_exceeded"
  | "awaiting_user"
  | "out_of_scope"
  | "blocked";

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
  /** Multi-doc budget extensions. */
  docCount: number;
  maxDocs: number;
  extractionUnitsUsed: number;
  maxExtractionUnits: number;
  stoppedReason?: StoppedReason;
}

export const DEFAULT_MAX_TURNS = 8;
export const DEFAULT_MAX_ASK_ROUNDS = 2;
export const DEFAULT_TOKEN_BUDGET = Number(process.env.ANALYSIS_TOKEN_BUDGET || 500_000);
export const DEFAULT_MAX_DOCS = Number(process.env.ANALYSIS_MAX_DOCS || 10);
export const DEFAULT_MAX_EXTRACTION_UNITS = Number(process.env.ANALYSIS_MAX_EXTRACTION_UNITS || 200);
/** ~80k tokens ≈ 320k chars at ~4 chars/token — full-context threshold (§10.3). */
export const FULL_CONTEXT_CHAR_THRESHOLD = Number(process.env.ANALYSIS_FULL_CONTEXT_CHARS || 320_000);

export function initAgentRunState(
  entryMode: EntryMode,
  overrides?: Partial<AgentRunState>
): AgentRunState {
  return {
    phase: "PLAN",
    entryMode,
    turn: 0,
    maxTurns: DEFAULT_MAX_TURNS,
    tokensUsed: 0,
    tokenBudget: DEFAULT_TOKEN_BUDGET,
    askRounds: 0,
    maxAskRounds: DEFAULT_MAX_ASK_ROUNDS,
    openQuestions: [],
    docCount: 0,
    maxDocs: DEFAULT_MAX_DOCS,
    extractionUnitsUsed: 0,
    maxExtractionUnits: DEFAULT_MAX_EXTRACTION_UNITS,
    ...overrides,
  };
}
