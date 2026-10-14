export interface DiagnosticEvent {
  event: string;
  timestamp: string;
  checkId?: string;
  requirementId?: string;
  [key: string]: unknown;
}
export interface VerificationDiagnosticRun {
  record(event: DiagnosticEvent): string | undefined;
  finish(status?: "complete" | "failed"): void;
  health(): { enabled: boolean; runDirectory: string | null; writeErrors: string[] };
}
export interface VerificationDiagnosticOptions {
  sessionId: string;
  mode: string;
  checks: Array<{ checkId: string; ruleId: string }>;
  directory?: string;
  enabled?: boolean;
}
