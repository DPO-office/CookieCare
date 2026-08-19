process.env.GOOGLE_CLOUD_PROJECT ??= "skill-library-selection-test";

/**
 * Selection, alias, and focus-map fixtures for the populated skill library.
 * Deterministic — no LLM. Preserves EU GDPR DSR isolation from UK/CCPA/topics.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractInstructionFocus } from "../extract-instruction-focus.js";
import { selectSkills } from "../select-skills.js";
import {
  getSkillById,
  resetSkillRegistryForTests,
} from "../registry.js";
import { assertSkillParity } from "../lint-skill-parity.js";

const DSR_INSTRUCTION =
  "Review this DPA for GDPR data subject rights assistance (Articles 15-22) and Art 12(3) timeframes.";

describe("populated skill library selection", () => {
  it("registry + skill parity lint pass", () => {
    resetSkillRegistryForTests();
    assertSkillParity();
  });

  it("does not attach UK GDPR, CCPA, transfers, or topics to an EU GDPR DSR request", () => {
    const selection = selectSkills({
      instruction: DSR_INSTRUCTION,
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
    assert.ok(!ids.includes("regimes/data-protection/uk-gdpr-idta"));
    assert.ok(!ids.includes("regimes/data-protection/ccpa-cpra"));
    assert.ok(!ids.includes("regimes/data-protection/international-transfers"));
    assert.ok(!ids.includes("topics/cybersecurity-and-incident-response"));
    assert.ok(!ids.includes("topics/vendor-risk-and-diligence"));
  });

  it("selects UK GDPR/IDTA for a UK transfer-tool request without treating SI 2023/1417 as the Act", () => {
    const selection = selectSkills({
      instruction: "Review this DPA for UK IDTA and UK Addendum restricted transfers under UK GDPR.",
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/uk-gdpr-idta"));
  });

  it("aliases england and uk to jurisdictions/england-wales", () => {
    assert.equal(getSkillById("england")?.skillId, "jurisdictions/england-wales");
    assert.equal(getSkillById("uk")?.skillId, "jurisdictions/england-wales");

    const byField = selectSkills({
      instruction: "Review governing law and execution.",
      docType: "msa",
      jurisdiction: "england",
    });
    assert.ok(byField.skills.some((s) => s.skillId === "jurisdictions/england-wales"));

    const byUk = selectSkills({
      instruction: "Review governing law and execution.",
      docType: "msa",
      jurisdiction: "uk",
    });
    assert.ok(byUk.skills.some((s) => s.skillId === "jurisdictions/england-wales"));
  });

  it("selects the cybersecurity topic for a NIS2-only request", () => {
    const selection = selectSkills({
      instruction: "Review this vendor contract for NIS2 incident reporting duties.",
      docType: "vendor-agreement",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("topics/cybersecurity-and-incident-response"));
    assert.ok(!ids.includes("topics/vendor-risk-and-diligence"));
  });

  it("NIS2-only instruction focuses NIS2 rules, not the whole CSF pack", async () => {
    const cyber = getSkillById("topics/cybersecurity-and-incident-response")!;
    const focus = await extractInstructionFocus(
      "Review this vendor contract for NIS2 incident reporting duties.",
      [cyber]
    );
    assert.ok(focus);
    assert.ok(focus!.ruleIds.includes("nis2.art21.risk_management"));
    assert.ok(focus!.ruleIds.includes("nis2.art23.incident_reporting"));
    assert.ok(!focus!.ruleIds.includes("nist.csf.govern"));
    assert.ok(!focus!.ruleIds.includes("nist.csf.detect_respond_recover"));
  });

  it("EBA outsourcing-only instruction focuses EBA rules, not NIST 800-161", async () => {
    const vendorRisk = getSkillById("topics/vendor-risk-and-diligence")!;
    const focus = await extractInstructionFocus(
      "Check this MSA against the EBA outsourcing guidelines for critical or important functions.",
      [vendorRisk]
    );
    assert.ok(focus);
    assert.ok(focus!.ruleIds.includes("eba.outsourcing.pre_assessment"));
    assert.ok(!focus!.ruleIds.includes("nist.800161.cscm"));
  });

  it("SCC/Schrems instruction selects the transfers overlay, not UK IDTA", () => {
    const selection = selectSkills({
      instruction:
        "Review these standard contractual clauses and the Schrems II transfer impact assessment.",
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/international-transfers"));
    assert.ok(!ids.includes("regimes/data-protection/uk-gdpr-idta"));
  });

  it("specific doc-types win over commercial-agreement", () => {
    const nda = selectSkills({
      instruction: "Review this mutual NDA for confidentiality scope.",
      docType: "nda",
    });
    const ndaIds = nda.skills.map((s) => s.skillId);
    assert.ok(ndaIds.includes("doc-types/nda"));
    assert.ok(!ndaIds.includes("doc-types/commercial-agreement"));

    const msa = selectSkills({
      instruction: "Vet this master services agreement SOW hierarchy.",
      docType: "msa",
    });
    const msaIds = msa.skills.map((s) => s.skillId);
    assert.ok(msaIds.includes("doc-types/msa"));
    assert.ok(!msaIds.includes("doc-types/commercial-agreement"));
  });
});
