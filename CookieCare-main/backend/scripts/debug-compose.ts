import { config } from "dotenv";
config({ path: "c:/Program Files/CookieCare/CookieCare-main/.env" });
process.env.ANALYSIS_LOG = "1";
import { readFileSync } from "fs";
import { createComplianceCompletion, complianceReportingInput } from "../src/modules/analysis/capabilities/reporting/compliance-reporting.js";
import { defaultCompliancePresentationPlan, resolveCompliancePresentationMode } from "../src/modules/analysis/capabilities/reporting/compliance-presentation.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";

async function main() {
  const data = JSON.parse(readFileSync("c:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report/out/latest.json", "utf8"));
  
  const state: AnalysisState = {
    request: {
      instruction: data.instruction,
      sessionId: data.sessionId,
    },
    intent: {
      operation: "compliance_check",
    },
    complianceReportSnapshot: data.handedToReporting,
  };

  const snapshot = data.handedToReporting;
  const mode = resolveCompliancePresentationMode(state);
  const fallbackPlan = defaultCompliancePresentationPlan(snapshot, mode);
  const lockedData = complianceReportingInput(snapshot);

  console.log("Mode:", mode);
  console.log("Input rows:", lockedData.rows.length);
  console.log("Creating completion...");
  const complete = createComplianceCompletion(state);

  try {
    console.log("Calling compose directly...");
    const raw = await complete("compose", {
      userIntent: state.request.instruction,
      perspective: state.intent?.partyPerspective,
      mode,
      defaultPlan: fallbackPlan,
      lockedData,
    });
    console.log("Compose returned successfully!");
    console.log("Keys in raw:", Object.keys(raw as object));
    console.log("Plan sections:", (raw as any)?.plan?.sections?.length);
    console.log("Draft rows:", (raw as any)?.draft?.rows?.length);
  } catch (err: any) {
    console.error("Direct compose error:", err.message);
    if (err.stack) console.error(err.stack);
    if (err.cause) console.error("Cause:", err.cause);
  }
}

main();
