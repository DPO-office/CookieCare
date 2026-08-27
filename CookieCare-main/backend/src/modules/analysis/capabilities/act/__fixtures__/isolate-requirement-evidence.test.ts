import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SharedEvidenceItem } from "../../../models/evidence-package.js";
import {
  candidateRefsByRequirement,
  resolveEvidenceRefsForRequirement,
  validateEvidenceRefs,
} from "../isolate-requirement-evidence.js";

function item(ref: string, clauseType: string, quotedText: string): SharedEvidenceItem {
  return {
    ref,
    clauseType,
    quotedText,
    structuralPath: ref,
    charRange: [0, quotedText.length],
  };
}

describe("candidateRefsByRequirement", () => {
  it("does not assign a deletion extract to a confidentiality requirement", () => {
    const items = [
      item(
        "E1",
        "retention_and_deletion",
        "Upon termination the processor shall delete or return all personal data."
      ),
      item(
        "E2",
        "confidentiality",
        "Personnel authorised to process personal data are bound by confidentiality."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["art28_3_b_confidentiality", "art28_3_g_deletion_return"],
      items,
      [
        "confidentiality",
        "return_or_deletion",
      ],
      {
        art28_3_b_confidentiality: {
          hypothesis: "Persons authorised to process personal data are committed to confidentiality.",
          evidenceHints: ["confidential", "authorised persons"],
        },
        art28_3_g_deletion_return: {
          hypothesis: "The processor deletes or returns personal data at the end of the services.",
          evidenceHints: ["delete", "return"],
        },
      }
    );
    assert.deepEqual(assigned.art28_3_b_confidentiality, ["E2"]);
    assert.deepEqual(assigned.art28_3_g_deletion_return, ["E1"]);
  });

  it("drops sibling cites that fail overlap", () => {
    const items = [
      item("E1", "retention_and_deletion", "The processor shall delete personal data."),
    ];
    const kept = validateEvidenceRefs(
      ["E1"],
      items,
      ["E2"],
      ["confidential"]
    );
    assert.deepEqual(kept, []);
  });

  it("keeps an extract that supports two hypotheses", () => {
    const items = [
      item(
        "E1",
        "processor_terms",
        "The duration of the Processing is determined by You and as set forth in the Agreement. The purpose of processing is the provision of the Offers."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["duration", "nature_purpose"],
      items,
      ["duration", "nature", "purpose"],
      {
        duration: {
          hypothesis: "The contract sets out the duration of the processing.",
          evidenceHints: ["duration", "term", "set forth"],
        },
        nature_purpose: {
          hypothesis: "The contract sets out the nature and purpose of the processing.",
          evidenceHints: ["nature", "purpose"],
        },
      }
    );
    assert.ok(assigned.duration?.includes("E1"));
    assert.ok(assigned.nature_purpose?.includes("E1"));
  });

  it("recovers hint-matching extracts when cited refs were filtered", () => {
    const items = [
      item(
        "E1",
        "processor_terms",
        "The duration of the Processing is the term of the Agreement."
      ),
    ];
    const recovered = resolveEvidenceRefsForRequirement(
      ["E_missing"],
      items,
      [],
      ["duration", "term"]
    );
    assert.deepEqual(recovered, ["E1"]);
  });
});
