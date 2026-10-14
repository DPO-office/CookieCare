import type { ComplianceRun } from "./create-run.js";
import type { CheckExecutionServices } from "./check-execution-services.js";
import { runArchivedMultiPass } from "./rollout.js";
export type { CheckExecutionServices } from "./check-execution-services.js";

/** Compatibility entry for explicit multi-pass experiments and historical tests.
 * The default previous-verification application path does not call this function.
 */
export async function executeChecks(run: ComplianceRun, services: CheckExecutionServices): Promise<void> {
  return runArchivedMultiPass(run, services);
}
