import {
  assertInvestigationProfileQualityBudget,
  investigationProfileQualitySummary,
} from "./audit-investigation-profiles.js";

assertInvestigationProfileQualityBudget();
for (const row of investigationProfileQualitySummary()) {
  console.log(
    `[skill-investigation] ${row.skillId}: ${row.ruleCount} rules, ` +
      `${row.placeholderCount} placeholder profiles (budget ${row.placeholderBudget})`
  );
}
