export interface AgentMarkup {
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
}
