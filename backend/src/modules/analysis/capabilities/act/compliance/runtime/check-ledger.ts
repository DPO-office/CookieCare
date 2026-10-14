import type { ComplianceCheck, ComplianceCheckOutcome } from "../contracts/index.js";
export function reconcileCheckIds(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected), actualSet = new Set(actual);
  return {
    missing: [...expectedSet].filter(id => !actualSet.has(id)),
    unexpected: [...actualSet].filter(id => !expectedSet.has(id)),
    duplicates: [...actualSet].filter(id => actual.filter(x => x === id).length > 1)
  };
}
export class CheckLedger {
  readonly checks: Map<string, ComplianceCheck>;
  readonly outcomes = new Map<string, ComplianceCheckOutcome>();
  constructor(checks: ComplianceCheck[]) {
    if (new Set(checks.map(c => c.checkId)).size !== checks.length)
      throw new Error("Duplicate expected check identity");
    this.checks = new Map(checks.map(c => [c.checkId, c]));
  }
  finish(outcome: ComplianceCheckOutcome): void {
    if (!this.checks.has(outcome.check.checkId) || this.outcomes.has(outcome.check.checkId))
      throw new Error("Unexpected or duplicate terminal outcome");
    this.outcomes.set(outcome.check.checkId, outcome);
  }
  reconcile() { return reconcileCheckIds([...this.checks.keys()], [...this.outcomes.keys()]); }
}
