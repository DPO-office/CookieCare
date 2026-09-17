import { config } from "dotenv";
config({ path: "c:/Program Files/CookieCare/CookieCare-main/.env" });
import { readFileSync, writeFileSync } from "fs";
import { renderComplianceReport } from "../src/modules/analysis/capabilities/reporting/compliance-reporting.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";

async function main() {
  const data = JSON.parse(readFileSync("c:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report/out/latest.json", "utf8"));
  
  const state: AnalysisState = {
    request: {
      instruction: "Perform a rigorous GDPR and DPDPA and provide me the table for risks of both compliances and also the rigorous analysis in table as well\n\nPresent findings as a table.",
      sessionId: data.sessionId,
      answerStyle: "tabular",
    },
    intent: {
      operation: "compliance_check",
      outputForm: "table",
    },
    complianceReportSnapshot: data.handedToReporting,
  };

  console.log("Starting renderComplianceReport...");
  const result = await renderComplianceReport(state);
  console.log("Validation source:", result.complianceReportValidation?.source);
  console.log("Validation failures:", result.complianceReportValidation?.failures);
  console.log("Fallback reason:", result.complianceReportValidation?.generation?.fallbackReason);
  console.log("Plan sections:", result.compliancePresentationPlan?.sections?.map(s => ({ kind: s.kind, heading: s.heading })));

  writeFileSync("c:/Program Files/CookieCare/CookieCare-main/backend/scripts/output_report_test.md", result.renderedOutput || "", "utf8");
  console.log("Saved output to backend/scripts/output_report_test.md");
}

main().catch(err => {
  console.error("Error in main:", err);
});
