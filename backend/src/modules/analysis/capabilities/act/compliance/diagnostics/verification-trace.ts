import type { VerificationRequest } from "../contracts/index.js";

export interface VerificationTrace {
  phase: "verify" | "review" | "cross_review";
  round: number;
  now?: () => number;
  emit: (event: string, payload: Record<string, unknown>) => void;
}

/** Observers receive snapshots and cannot mutate requests or interrupt judgment. */
export function traceVerification(trace: VerificationTrace | undefined, request: VerificationRequest, event: string, payload: Record<string, unknown>): void {
  if (!trace) return;
  try {
    trace.emit(event, structuredClone({
      phase: trace.phase, round: trace.round, checkId: request.check.checkId,
      ruleHash: request.check.rule?.hash, bundleHash: request.bundle.hash, ...payload,
    }));
  } catch { /* The file writer exposes its own health; diagnostics never change outcomes. */ }
}

export function diagnosticError(error: unknown): string {
  return String(error)
    .replace(/([?&](?:key|api_key|access_token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]");
}

/** Paths identify differences in the exact projection the reviewer compares. */
export function verificationDifferences(first: unknown, second: unknown, path = ""): Array<{ path: string; first: unknown; second: unknown }> {
  if (JSON.stringify(first) === JSON.stringify(second)) return [];
  if (first && second && typeof first === "object" && typeof second === "object") {
    const a = first as Record<string, unknown>, b = second as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key =>
      verificationDifferences(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return [{ path, first: first ?? null, second: second ?? null }];
}
