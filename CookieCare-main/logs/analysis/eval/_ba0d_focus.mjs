import fs from "fs";
const lines = fs
  .readFileSync(
    "logs/analysis/an_ba0d8e55-327d-46cd-a1f0-13df14d1eb88.compliance.log",
    "utf8"
  )
  .split(/\n/);
const focus = [];
for (const line of lines) {
  if (!line.startsWith("{")) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (
    e.requirementId === "art28_3_a_instructions" ||
    e.canonicalKey?.includes("3a") ||
    (e.event || "").includes("verify.matrix") ||
    (e.event || "").includes("assess.result")
  ) {
    if (
      e.requirementId === "art28_3_a_instructions" ||
      e.requirementId === "art28_3_g_deletion_return" ||
      e.requirementId === "duration" ||
      e.requirementId === "nature_purpose" ||
      e.requirementId === "art28_3_f_security_assistance"
    ) {
      focus.push({
        event: e.event,
        requirementId: e.requirementId,
        status: e.status,
        elementStates: e.elementStates,
        elements: e.elements,
        verdicts: e.verdicts,
        supportedElementIds: e.supportedElementIds,
        missingElementIds: e.missingElementIds,
        cites: e.supportingCites || e.evidence,
      });
    }
  }
}
fs.writeFileSync(
  "logs/analysis/eval/_ba0d_focus.json",
  JSON.stringify(focus, null, 2)
);
console.log("focus events", focus.length);
