import { createHash } from "node:crypto";
import type { Finding } from "../../models/finding.js";

export function hashFindingOutput(finding: Finding | undefined): string {
  if (!finding) return "";
  const payload = [
    finding.claim,
    finding.status,
    finding.category,
    ...finding.evidence.map((ev) => ev.quotedText),
  ]
    .join("|")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function hashFindingsForUnit(
  findings: Finding[],
  workUnitId: string
): string {
  const unitFindings = findings.filter((f) => f.workUnitId === workUnitId);
  if (unitFindings.length === 0) return "no-findings";
  return createHash("sha256")
    .update(unitFindings.map((f) => hashFindingOutput(f)).sort().join(","))
    .digest("hex")
    .slice(0, 16);
}
