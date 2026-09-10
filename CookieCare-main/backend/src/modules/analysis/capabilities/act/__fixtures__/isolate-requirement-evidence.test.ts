import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SharedEvidenceItem } from "../../../models/evidence-package.js";
import {
  candidateRefsByRequirement,
  citeableRefsFromPacket,
  resolveEvidence,
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

describe("resolveEvidence packets (recall before VERIFY)", () => {
  it("duration: ranks operative processing-term evidence before related retention language", () => {
    const pool = [
      item(
        "E1",
        "termination",
        "§2.2(a) The duration of the Processing is determined by You and as set forth in the Agreement."
      ),
      item(
        "E2",
        "processor_terms",
        "The term of this DPA remains in force for the duration of the Services."
      ),
      item(
        "E3",
        "retention_and_deletion",
        "Under Argentine law personal data may be retained and destroyed up to two years after termination."
      ),
    ];
    const packet = resolveEvidence(
      "duration",
      pool,
      ["duration", "term"],
      {
        hypothesis: "The contract sets out the duration of the processing.",
        evidenceHints: ["duration", "term", "period", "termination", "in force", "set forth"],
      }
    );
    assert.ok(packet.supporting.some((i) => i.ref === "E1" || i.ref === "E2"));
    assert.ok(packet.supporting.findIndex((i) => i.ref === "E3") > 0);
    assert.deepEqual(packet.contextual, []);
  });

  it("confidentiality: does not make adjacent security citeable as confidentiality proof", () => {
    const pool = [
      item(
        "E1",
        "confidentiality",
        "Personnel authorised to process personal data are committed to confidentiality."
      ),
      item(
        "E2",
        "information_security",
        "The processor implements appropriate technical and organisational security measures."
      ),
    ];
    const packet = resolveEvidence(
      "art28_3_b_confidentiality",
      pool,
      ["confidentiality"],
      {
        hypothesis:
          "Persons authorised to process personal data are committed to confidentiality.",
        evidenceHints: ["confidential", "authorised persons"],
      }
    );
    assert.deepEqual(
      packet.supporting.map((i) => i.ref),
      ["E1"]
    );
    assert.deepEqual(citeableRefsFromPacket(packet), ["E1"]);
  });

  it("deletion: ranks the end-of-services obligation before retention context", () => {
    const pool = [
      item(
        "E1",
        "retention_and_deletion",
        "Personal data may be retained according to the retention schedule in Annex B."
      ),
      item(
        "E2",
        "deletion_on_termination",
        "At the end of the services the processor shall delete or return all personal data and existing copies."
      ),
    ];
    const packet = resolveEvidence(
      "art28_3_g_deletion_return",
      pool,
      ["return_or_deletion", "deletion"],
      {
        hypothesis:
          "At the end of the services the processor deletes or returns personal data and existing copies.",
        evidenceHints: ["delete", "deletion", "return", "erasure"],
      }
    );
    assert.deepEqual(
      packet.supporting.map((i) => i.ref),
      ["E2", "E1"]
    );
    assert.deepEqual(packet.contextual, []);
  });
});

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
      ["confidentiality", "return_or_deletion"],
      {
        art28_3_b_confidentiality: {
          hypothesis:
            "Persons authorised to process personal data are committed to confidentiality.",
          evidenceHints: ["confidential", "authorised persons"],
        },
        art28_3_g_deletion_return: {
          hypothesis: "The processor deletes or returns personal data at the end of the services.",
          evidenceHints: ["delete", "return"],
        },
      }
    );
    assert.deepEqual(assigned.art28_3_b_confidentiality, ["E2"]);
    assert.ok(assigned.art28_3_g_deletion_return?.includes("E1"));
  });

  it("drops sibling cites that fail overlap", () => {
    const items = [
      item("E1", "retention_and_deletion", "The processor shall delete personal data."),
    ];
    const kept = validateEvidenceRefs(["E1"], items, ["E2"], ["confidential"]);
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
          evidenceHints: ["nature", "purpose", "offers"],
        },
      }
    );
    assert.ok(assigned.duration?.includes("E1"));
    assert.ok(assigned.nature_purpose?.includes("E1"));
  });

  it("recovers candidates when the model cites nothing", () => {
    const items = [
      item(
        "E1",
        "processor_terms",
        "The duration of the Processing is determined by You and as set forth in the Agreement."
      ),
    ];
    const recovered = resolveEvidenceRefsForRequirement(
      [],
      items,
      ["E1"],
      ["duration", "term"]
    );
    assert.deepEqual(recovered, ["E1"]);
  });

  it("prefers confidentiality over security for confidentiality hypothesis", () => {
    const items = [
      item(
        "E1",
        "information_security",
        "The processor implements technical and organisational security measures."
      ),
      item(
        "E2",
        "confidentiality",
        "Personnel authorised to process personal data are bound by confidentiality."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["art28_3_b_confidentiality"],
      items,
      ["confidentiality"],
      {
        art28_3_b_confidentiality: {
          hypothesis:
            "Persons authorised to process personal data are committed to confidentiality.",
          evidenceHints: ["confidential", "authorised persons"],
        },
      }
    );
    assert.equal(assigned.art28_3_b_confidentiality?.[0], "E2");
  });

  it("prefers deletion_on_termination over retention for deletion hypothesis", () => {
    const items = [
      item(
        "E1",
        "retention_and_deletion",
        "Personal data may be retained according to the retention schedule."
      ),
      item(
        "E2",
        "deletion_on_termination",
        "At the end of the services the processor shall delete or return all personal data and existing copies."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["art28_3_g_deletion_return"],
      items,
      ["return_or_deletion"],
      {
        art28_3_g_deletion_return: {
          hypothesis:
            "At the end of the services the processor deletes or returns personal data and existing copies.",
          evidenceHints: ["delete", "deletion", "return", "erasure"],
        },
      }
    );
    assert.equal(assigned.art28_3_g_deletion_return?.[0], "E2");
  });

  it("prefers processing-duration language over Argentina retention for duration", () => {
    const items = [
      item(
        "E1",
        "processor_terms",
        "Under Argentine law personal data may be retained and destroyed up to two years after termination."
      ),
      item(
        "E2",
        "processor_terms",
        "The duration of the Processing is determined by You and as set forth in the Agreement."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["duration"],
      items,
      ["duration", "term"],
      {
        duration: {
          hypothesis: "The contract sets out the duration of the processing.",
          evidenceHints: ["duration", "term", "period", "termination", "in force", "set forth"],
        },
      }
    );
    assert.equal(assigned.duration?.[0], "E2");
  });

  it("prefers termination/duration clauses over Nigeria or SCC schedules for duration", () => {
    const items = [
      item(
        "E1",
        "data_protection",
        "2023) and its Implementing Regulations; (10) Nigeria Data Protection Act 2023 and its subsidiary regulations."
      ),
      item(
        "E2",
        "processor_terms",
        "3.7.5.3 For the purposes of the EU SCCs that apply pursuant to section 3.7.5.2 of this Data Processing Agreement."
      ),
      item(
        "E3",
        "termination",
        "The duration of the Processing is set forth in the Agreement and ends upon expiry or termination of the Services."
      ),
    ];
    const assigned = candidateRefsByRequirement(
      ["duration"],
      items,
      ["duration", "term"],
      {
        duration: {
          hypothesis: "The contract sets out the duration of the processing.",
          evidenceHints: ["duration", "term", "period", "termination", "in force", "set forth"],
        },
      }
    );
    assert.equal(assigned.duration?.[0], "E3");
  });
});
