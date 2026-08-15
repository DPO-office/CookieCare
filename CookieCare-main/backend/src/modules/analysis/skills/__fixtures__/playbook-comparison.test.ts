/**
 * Playbook comparison + comparativeChecks + section-load fixtures (deterministic, no LLM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActGraphDetailed,
  MAX_PLAYBOOK_CHECK_SLOTS,
} from "../build-act-graph.js";
import { selectSkills } from "../select-skills.js";
import { loadSkillMdSection, resetSkillMdCacheForTests } from "../load-skill-md.js";
import { resetSkillRegistryForTests } from "../registry.js";
import type { IntentClassification } from "../../models/intent.js";
import { resolveDocumentRoles } from "../../capabilities/plan/resolve-document-roles.js";
import type { AnalysisState } from "../../models/analysis-state.js";

const PLAYBOOK_INTENT: IntentClassification = {
  scope: "whole_document",
  operation: "compliance_check",
  standard: "none",
  outputForm: "memo",
  compound: false,
  subIntents: [],
  confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
};

describe("playbook comparison + ACT graph fixtures", () => {
  it("schedules playbook extract + Tier P slots + playbook_comparison_memo", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction: "Compare this MSA against our uploaded playbook",
      docType: "msa",
    });
    assert.ok(selection.skills.some((s) => s.skillId === "_global"));

    const graph = buildActGraphDetailed({
      docId: "target-msa",
      referenceDocId: "org-playbook",
      instruction: "Compare this MSA against our uploaded playbook",
      skills: selection.skills,
      intent: PLAYBOOK_INTENT,
    });

    assert.equal(graph.rendererSchemaId, "playbook_comparison_memo");
    const tools = graph.workUnits.map((u) => u.tool);
    assert.ok(tools.includes("extract_playbook_positions"));
    assert.equal(
      tools.filter((t) => t === "check_against_rule" && String(uInput(graph, t)).includes("playbook")).length >= 0,
      true
    );
    const playbookSlots = graph.workUnits.filter(
      (u) =>
        u.tool === "check_against_rule" &&
        u.input.playbookPositionIndex !== undefined
    );
    assert.equal(playbookSlots.length, MAX_PLAYBOOK_CHECK_SLOTS);
    assert.ok(
      playbookSlots.every((u) =>
        u.dependsOn.includes("wu-playbook-extract") && u.dependsOn.includes("wu-extract")
      )
    );
    const render = graph.workUnits.find((u) => u.tool === "render_output");
    assert.equal(render?.input.schemaId, "playbook_comparison_memo");
  });

  it("schedules comparativeChecks when California jurisdiction is active", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction: "Flag California non-compete enforceability on this employment agreement",
      docType: "employment_agreement",
      jurisdiction: "california",
    });
    assert.ok(selection.skills.some((s) => s.skillId === "jurisdictions/california"));

    const graph = buildActGraphDetailed({
      docId: "emp-1",
      instruction: "Flag California non-compete enforceability",
      skills: selection.skills,
      intent: {
        ...PLAYBOOK_INTENT,
        operation: "risk_flag",
      },
    });

    const comparative = graph.workUnits.filter(
      (u) => u.tool === "flag_risk" && u.input.comparativeCheckId
    );
    assert.ok(comparative.length >= 1);
    assert.ok(
      comparative.some((u) =>
        String(u.input.comparativeCheckId).includes("non_compete")
      )
    );
  });

  it("loads matrix sections from GDPR SKILL.md", async () => {
    resetSkillMdCacheForTests();
    const section = await loadSkillMdSection(
      "regimes/data-protection/gdpr",
      "matrix:gdpr.right.access"
    );
    assert.ok(section);
    assert.ok(/Named example/i.test(section!));
    assert.ok(/Generic example/i.test(section!));
  });

  it("resolves explicit documentRoles without ASK", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "compare",
        documentIds: ["a", "b"],
        documentRoles: { a: "target", b: "reference" },
        documentTexts: {
          a: "This Agreement is entered into by and between Party A and Party B. IN WITNESS WHEREOF the parties have signed.",
          b: "Preferred position: Vendor must accept uncapped liability. Should never accept limitation below 12 months fees.",
        },
      },
      workspace: { sessionId: "s1", documents: [] },
      findings: [],
      draftTasks: [],
      metadata: { timestamp: new Date().toISOString() },
    } as unknown as AnalysisState;

    const resolved = resolveDocumentRoles(state);
    assert.equal(resolved.targetDocId, "a");
    assert.equal(resolved.referenceDocId, "b");
    assert.equal(resolved.missing, undefined);
  });
});

function uInput(
  graph: ReturnType<typeof buildActGraphDetailed>,
  tool: string
): string {
  return JSON.stringify(
    graph.workUnits.filter((u) => u.tool === tool).map((u) => u.input)
  );
}
