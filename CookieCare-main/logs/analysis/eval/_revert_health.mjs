import { execSync } from "child_process";
import fs from "fs";
const status = execSync(
  'git status -sb -- "CookieCare-main/backend/src/modules/analysis/capabilities/act/compliance-observability.ts" "CookieCare-main/backend/src/modules/analysis/capabilities/act/execute-act-plan.ts" "CookieCare-main/backend/src/modules/analysis/capabilities/audit/ground-findings.ts" "CookieCare-main/backend/src/modules/analysis/capabilities/reporting/render-output.ts"',
  { encoding: "utf8", cwd: "C:/Program Files/CookieCare" }
);
let health = "fail";
let root = "fail";
try {
  health = String((await fetch("http://localhost:3000/api/analysis/health")).status);
} catch (e) {
  health = e.message;
}
try {
  root = String((await fetch("http://localhost:3000")).status);
} catch (e) {
  root = e.message;
}
const out = { status: status.trim(), health, root };
fs.writeFileSync(
  "C:/Program Files/CookieCare/CookieCare-main/logs/analysis/eval/_revert_health.json",
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out));
