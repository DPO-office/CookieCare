import fs from "node:fs";
import path from "node:path";
import type { ComplianceEventSink } from "./events.js";
export function createComplianceLogSink(directory = path.join(process.cwd(), "logs", "analysis")): ComplianceEventSink {
  return event => {
    try {
      fs.mkdirSync(directory, { recursive: true });
      const id = event.analysisId.replace(/[^a-zA-Z0-9_-]/g, "_");
      fs.appendFileSync(path.join(directory, id + ".compliance.log"), JSON.stringify(event) + "\n", "utf8");
    }
    catch { /* Logging is best effort and never changes a verification outcome. */ }
  };
}
