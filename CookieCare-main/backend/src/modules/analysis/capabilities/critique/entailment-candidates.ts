import type { Finding } from "../../models/finding.js";

/** Present user-facing findings with evidence must always receive semantic entailment review. */
export function getEntailmentCandidates(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) =>
      (f.kind === "risk" || f.kind === "compliance") &&
      f.status === "present" &&
      f.evidence.length > 0 &&
      f.visibility !== "internal" &&
      !f.unverified
  );
}
