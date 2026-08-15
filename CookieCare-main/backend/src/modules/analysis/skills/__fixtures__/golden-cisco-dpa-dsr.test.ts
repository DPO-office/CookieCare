/**
 * Golden fixture — Cisco DPA / Arts 15–22 rights-matrix baseline.
 * Deterministic graph + focus checks (no LLM). Diff against this after skill refactors.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractInstructionFocus } from "../extract-instruction-focus.js";
import { buildActGraphDetailed } from "../build-act-graph.js";
import { selectSkills } from "../select-skills.js";
import {
  getSkillById,
  resolveDocTypeSkill,
  resetSkillRegistryForTests,
} from "../registry.js";
import { assertSkillParity } from "../lint-skill-parity.js";
import { loadSkillMdSection } from "../load-skill-md.js";
import type { IntentClassification } from "../../models/intent.js";

const DSR_INSTRUCTION =
  "Review this DPA for GDPR data subject rights assistance (Articles 15-22) and Art 12(3) timeframes.";

const BASELINE_INTENT: IntentClassification = {
  scope: "whole_document",
  operation: "compliance_check",
  standard: "regime_pack:regimes/data-protection/gdpr",
  outputForm: "memo",
  compound: false,
  subIntents: [],
  confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
};

describe("golden cisco-dpa-dsr skills baseline", () => {
  it("registry + skill parity lint pass", () => {
    resetSkillRegistryForTests();
    assertSkillParity();
  });

  it("composes _global + dpa + gdpr for privacy DSR request", () => {
    const selection = selectSkills({
      instruction: DSR_INSTRUCTION,
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("_global"));
    assert.ok(ids.includes("doc-types/dpa"));
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
  });

  it("composes california jurisdiction when named", () => {
    const selection = selectSkills({
      instruction: `${DSR_INSTRUCTION} Flag California non-compete enforceability.`,
      docType: "dpa",
      jurisdiction: "california",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("jurisdictions/california"));
    assert.ok(
      (selection.partialCoverageWarning ?? []).some((w) => w.includes("draft")),
      "draft jurisdiction must surface partialCoverageWarning"
    );
  });

  it("extracts Arts 15-22 focus from GDPR skill", () => {
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const dpa = getSkillById("doc-types/dpa")!;
    const focus = extractInstructionFocus(DSR_INSTRUCTION, [dpa, gdpr]);
    assert.ok(focus);
    assert.deepEqual(focus!.ruleIds.sort(), ["gdpr.art12.3", "gdpr.art28.3.e"].sort());
    assert.equal(focus!.matrixRowIds.length, 8);
    assert.ok(focus!.matrixRowIds.includes("gdpr.right.access"));
    assert.ok(focus!.matrixRowIds.includes("gdpr.right.automated_decisions"));
  });

  it("builds rights_matrix_memo graph with shared extract + matrix rows", () => {
    const selection = selectSkills({
      instruction: DSR_INSTRUCTION,
      docType: "dpa",
      promptLibraryId: "privacy",
    });
    const focus = extractInstructionFocus(DSR_INSTRUCTION, selection.skills);
    const graph = buildActGraphDetailed({
      docId: "cisco-dpa",
      instruction: DSR_INSTRUCTION,
      skills: selection.skills,
      intent: BASELINE_INTENT,
      focus,
    });

    assert.equal(graph.rendererSchemaId, "rights_matrix_memo");
    const tools = graph.workUnits.map((u) => u.tool);
    assert.equal(tools.filter((t) => t === "extract_clauses").length, 1, "single shared extract");
    assert.ok(tools.includes("check_against_rule"));
    assert.ok(tools.includes("evaluate_matrix_row"));
    assert.ok(tools.includes("render_output"));

    const ruleIds = graph.workUnits
      .filter((u) => u.tool === "check_against_rule")
      .map((u) => String(u.input.ruleId));
    assert.ok(ruleIds.includes("gdpr.art28.3.e"));
    assert.ok(ruleIds.includes("gdpr.art12.3"));

    const matrixRows = graph.workUnits.filter((u) => u.tool === "evaluate_matrix_row");
    assert.equal(matrixRows.length, 8);
  });

  it("saas-agreement inherits commercial-agreement expectedClauses", () => {
    const resolved = resolveDocTypeSkill("doc-types/saas-agreement");
    assert.ok(resolved.expectedClauses.some((e) => e.clauseType === "payment"));
    assert.ok(resolved.expectedClauses.some((e) => e.clauseType === "service_levels"));
    assert.ok(resolved.expectedClauses.some((e) => e.clauseType === "service_credits"));
    assert.ok(resolved.clauseTypes.includes("indemnity"));
    assert.ok(resolved.clauseTypes.includes("uptime_commitment"));
  });

  it("loads SKILL.md by section, not whole-doc requirement for ACT", async () => {
    const section = await loadSkillMdSection(
      "regimes/data-protection/gdpr",
      "rule:gdpr.art28.3.e"
    );
    assert.ok(section && section.toLowerCase().includes("chapter iii"));
  });

  it("composes _global on playbook comparison graphs", () => {
    const selection = selectSkills({
      instruction: "Compare agreement to playbook",
      docType: "msa",
    });
    assert.ok(selection.skills.some((s) => s.skillId === "_global"));
    const graph = buildActGraphDetailed({
      docId: "target",
      referenceDocId: "playbook",
      instruction: "Compare agreement to playbook",
      skills: selection.skills,
      intent: BASELINE_INTENT,
    });
    assert.equal(graph.rendererSchemaId, "playbook_comparison_memo");
    assert.ok(graph.workUnits.some((u) => u.tool === "extract_playbook_positions"));
  });

  it("legacy aliases still resolve", () => {
    assert.equal(getSkillById("general-review")?.skillId, "_global");
    assert.equal(getSkillById("commercial")?.skillId, "doc-types/commercial-agreement");
    assert.equal(getSkillById("privacy-gdpr-dpa")?.skillId, "regimes/data-protection/gdpr");
  });
});
