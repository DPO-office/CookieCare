/**
 * Kinded analysis packages: inventory vs evaluation vs named-rule, and no
 * extraction→check_against_rule fallback. Deterministic — no LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import { resolvePackages } from "../../../skills/runtime/graph/resolve-packages.js";
import { buildActGraphDetailed } from "../../../skills/runtime/graph/build-act-graph.js";
import { selectSkills } from "../../../skills/runtime/selection/select-skills.js";
import type { InstructionFocus } from "../../../models/analysis-plan.js";
import type { IntentRequirement } from "../../../models/intent.js";
import { extractExplicitScope, filterIdsByScope } from "../../../skills/runtime/focus/extract-explicit-scope.js";
import {
  bothSkills,
  gdpr,
  intent,
} from "../../../__test-helpers__/package-graph-fixtures.js";

const ART28_REVIEW =
  "Perform a rigorous GDPR Article 28 compliance review. Verify mandatory Article 28(3) clauses.";

const TRANSFER_INSTRUCTION =
  "Analyse all international data transfer provisions. Identify whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced; whether Schrems II supplementary measures are addressed; transfers to third countries and the legal basis for each; and any gaps in transfer mechanisms.";

function focus(partial: Partial<InstructionFocus>): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: TRANSFER_INSTRUCTION,
    ...partial,
  };
}

describe("kinded analysis packages — international transfers", () => {
  it("selects inventory + evaluation and does not fan out Chapter V rule checks", () => {
    const skills = bothSkills();
    const extraction: IntentRequirement = {
      id: "international_data_transfer",
      description: "Analyse all international data transfer provisions",
      type: "extraction",
      priority: "required",
    };
    const verification: IntentRequirement = {
      id: "transfer_mechanism_identification",
      description: "Identify whether SCCs, BCRs, or adequacy decisions are referenced",
      type: "verification",
      priority: "required",
    };
    const resolution = resolvePackages(
      skills,
      focus({
        ruleIds: [
          "gdpr.art44",
          "gdpr.art45.1",
          "gdpr.art46",
          "gdpr.art47",
          "gdpr.art48",
          "gdpr.art49",
        ],
        requirements: [
          { id: "international_data_transfer", label: "Analyse all international data transfer provisions" },
          { id: "transfer_mechanism_identification", label: "Identify SCC/BCR/adequacy" },
        ],
        requirementMappings: [
          {
            requirementId: "international_data_transfer",
            capabilityIds: ["gdpr.art44", "gdpr.art46"],
            source: "phrase_map",
          },
          {
            requirementId: "transfer_mechanism_identification",
            capabilityIds: ["gdpr.art46", "gdpr.art47"],
            source: "phrase_map",
          },
        ],
      }),
      [extraction, verification]
    );
    const ids = resolution.packages.map((p) => p.pkg.id);
    assert.ok(ids.includes("international_transfer_inventory"));
    assert.ok(ids.includes("international_transfer_evaluation"));
    assert.equal(resolution.leftoverRuleIds.length, 0);

    const { workUnits } = buildActGraphDetailed({
      docId: "mastercard-dpa",
      instruction: TRANSFER_INSTRUCTION,
      skills,
      intent: intent([extraction, verification]),
      focus: focus({
        ruleIds: ["gdpr.art44", "gdpr.art45.1", "gdpr.art46", "gdpr.art47", "gdpr.art48", "gdpr.art49"],
        requirements: [
          { id: "international_data_transfer", label: "Analyse all international data transfer provisions" },
        ],
        requirementMappings: [
          {
            requirementId: "international_data_transfer",
            capabilityIds: ["gdpr.art44"],
            source: "phrase_map",
          },
        ],
      }),
    });
    const tools = workUnits.map((u) => u.tool);
    assert.ok(tools.includes("inventory_provisions"));
    assert.ok(tools.includes("evaluate_package"));
    const chapterVChecks = workUnits.filter(
      (u) =>
        u.tool === "check_against_rule" &&
        /^gdpr\.art4[4-9]/.test(String(u.input.ruleId ?? ""))
    );
    assert.equal(chapterVChecks.length, 0, "Chapter V must not run as check_against_rule");
  });

  it("inventory-only instruction does not schedule Chapter V evaluation", () => {
    const skills = bothSkills();
    const extraction: IntentRequirement = {
      id: "international_data_transfer",
      description: "List every international transfer mechanism mentioned in this DPA.",
      type: "extraction",
      priority: "required",
    };
    const { workUnits } = buildActGraphDetailed({
      docId: "dpa",
      instruction: "List every international transfer mechanism mentioned in this DPA.",
      skills,
      intent: intent([extraction]),
      focus: focus({
        instructionText: "List every international transfer mechanism mentioned in this DPA.",
        requirements: [
          { id: "international_data_transfer", label: "List every international transfer mechanism" },
        ],
      }),
    });
    const tools = workUnits.map((u) => u.tool);
    assert.ok(tools.includes("inventory_provisions"));
    assert.ok(!tools.includes("evaluate_package"));
    assert.equal(
      workUnits.filter((u) => u.tool === "check_against_rule").length,
      0
    );
  });

  it("auto-pairs the transfers overlay for an international-transfer DPA review", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction: TRANSFER_INSTRUCTION,
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
    assert.ok(ids.includes("regimes/data-protection/international-transfers"));
  });

  it("privacy library path makes transfers overlay available", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction: TRANSFER_INSTRUCTION,
      docType: "dpa",
      promptLibraryId: "privacy",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
    assert.ok(ids.includes("regimes/data-protection/international-transfers"));
  });

  it("resolves catalog-style extraction ids to inventory via semanticTopics, not Chapter V rules", () => {
    const skills = bothSkills();
    const chapterV = [
      "gdpr.art44",
      "gdpr.art45.1",
      "gdpr.art46",
      "gdpr.art47",
      "gdpr.art48",
      "gdpr.art49",
    ];
    const catalogStyleIds = [
      "scc_reference",
      "bcr_reference",
      "adequacy",
      "schrems_ii",
      "third_country_transfers",
    ] as const;
    const intentReqs: IntentRequirement[] = catalogStyleIds.map((id) => ({
      id,
      description: `Extract ${id.replace(/_/g, " ")}`,
      type: "extraction" as const,
      priority: "required" as const,
    }));
    const resolution = resolvePackages(
      skills,
      focus({
        ruleIds: chapterV.slice(0, catalogStyleIds.length),
        requirements: catalogStyleIds.map((id) => ({
          id,
          label: `Extract ${id.replace(/_/g, " ")}`,
        })),
        requirementMappings: catalogStyleIds.map((id, index) => ({
          requirementId: id,
          capabilityIds: [chapterV[index % chapterV.length]!],
          source: "catalog_llm" as const,
        })),
      }),
      intentReqs
    );
    for (const id of catalogStyleIds) {
      assert.equal(
        resolution.requirementToPackageId[id],
        "international_transfer_inventory",
        `${id} should resolve to inventory via semanticTopics`
      );
    }
    assert.ok(
      !resolution.leftoverRuleIds.some((id) => /^gdpr\.art4[4-9]/.test(id)),
      "Chapter V rules must not leak as leftover checks for extraction reqs"
    );
  });

  it("matches unaliased extraction ids when requirement text hits a package topic", () => {
    const skills = bothSkills();
    const extraction: IntentRequirement = {
      id: "cross_border_safeguards",
      description: "Find all cross-border safeguard provisions in the agreement",
      type: "extraction",
      priority: "required",
    };
    const resolution = resolvePackages(
      skills,
      focus({
        requirements: [
          { id: "cross_border_safeguards", label: extraction.description },
        ],
        requirementMappings: [
          {
            requirementId: "cross_border_safeguards",
            capabilityIds: ["gdpr.art46"],
            source: "catalog_llm",
          },
        ],
        ruleIds: ["gdpr.art46"],
      }),
      [extraction]
    );
    assert.equal(
      resolution.requirementToPackageId.cross_border_safeguards,
      "international_transfer_inventory"
    );
  });

  it("does not auto-pair transfers for a DSR-only instruction", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction:
        "Review this DPA for GDPR data subject rights assistance (Articles 15-22) and Art 12(3) timeframes.",
      docType: "dpa",
    });
    const ids = selection.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
    assert.ok(!ids.includes("regimes/data-protection/international-transfers"));
  });
});

describe("kinded analysis packages — named rule vs unsupported extraction", () => {
  it("audit-right verification uses the Article 28 evaluation package, not inventory", () => {
    const skill = gdpr();
    const { workUnits } = buildActGraphDetailed({
      docId: "dpa",
      instruction: "Does the DPA contain an audit right?",
      skills: [skill],
      intent: intent([
        {
          id: "audit_right",
          description: "Does the DPA contain an audit right?",
          type: "verification",
          priority: "required",
        },
      ]),
      focus: focus({
        instructionText: "Does the DPA contain an audit right?",
        ruleIds: ["gdpr.art28.3.h"],
        requirements: [{ id: "audit_right", label: "Does the DPA contain an audit right?" }],
        requirementMappings: [
          {
            requirementId: "audit_right",
            capabilityIds: ["gdpr.art28.3.h"],
            source: "phrase_map",
          },
        ],
      }),
    });
    const tools = workUnits.map((u) => u.tool);
    assert.ok(tools.includes("evaluate_package") || tools.includes("check_against_rule"));
    assert.ok(!tools.includes("inventory_provisions"));
  });

  it("unsupported extraction is explicit not_supported, not silent rule fan-out", () => {
    const skill = gdpr();
    const extraction: IntentRequirement = {
      id: "subprocessor_inventory",
      description: "List every subprocessor named in the agreement",
      type: "extraction",
      priority: "required",
    };
    const resolution = resolvePackages(
      [skill],
      focus({
        instructionText: extraction.description,
        ruleIds: ["gdpr.art28.2"],
        requirements: [{ id: "subprocessor_inventory", label: extraction.description }],
        requirementMappings: [
          {
            requirementId: "subprocessor_inventory",
            capabilityIds: ["gdpr.art28.2"],
            source: "catalog_llm",
          },
        ],
      }),
      [extraction]
    );
    assert.equal(
      resolution.requirementPaths.find((p) => p.requirementId === "subprocessor_inventory")
        ?.status,
      "not_supported"
    );
    assert.ok(!resolution.leftoverRuleIds.includes("gdpr.art28.2"));

    const { workUnits } = buildActGraphDetailed({
      docId: "dpa",
      instruction: extraction.description,
      skills: [skill],
      intent: intent([extraction]),
      focus: focus({
        instructionText: extraction.description,
        ruleIds: ["gdpr.art28.2"],
        requirements: [{ id: "subprocessor_inventory", label: extraction.description }],
        requirementMappings: [
          {
            requirementId: "subprocessor_inventory",
            capabilityIds: ["gdpr.art28.2"],
            source: "catalog_llm",
          },
        ],
      }),
    });
    const art282 = workUnits.filter(
      (u) => u.tool === "check_against_rule" && String(u.input.ruleId) === "gdpr.art28.2"
    );
    assert.equal(art282.length, 0);
    const aggregate = workUnits.find((u) => u.tool === "aggregate_requirements");
    assert.ok(aggregate);
    const unsupported = aggregate?.input.unsupportedRequirements as Array<{ requirementId: string }>;
    assert.ok(unsupported?.some((item) => item.requirementId === "subprocessor_inventory"));
  });
});

describe("kinded analysis packages — existing GDPR grouped eval", () => {
  it("still groups Article 28(3) into evaluate_package", () => {
    const skill = gdpr();
    const resolution = resolvePackages([skill], focus({ ruleIds: ["gdpr.art28.3.a"] }));
    assert.ok(
      resolution.packages.some((p) => p.pkg.id === "gdpr.art28.3.mandatory_clauses")
    );
  });

  it("does not schedule leftover checks for out-of-scope catalog rules", () => {
    const skill = gdpr();
    const scope = extractExplicitScope(ART28_REVIEW);
    const resolution = resolvePackages(
      [skill],
      focus({
        instructionText: ART28_REVIEW,
        ruleIds: filterIdsByScope(
          [
            "gdpr.art28.1",
            "gdpr.art28.3.a",
            "gdpr.art32",
            "gdpr.art38",
            "gdpr.art39.1.a-c",
          ],
          scope
        ),
        selectedPackageIds: ["gdpr.art28.particulars", "gdpr.art28.3.mandatory_clauses"],
        explicitScope: scope,
      })
    );
    assert.ok(
      !resolution.leftoverRuleIds.some((id) => /^gdpr\.art(29|3[0-9])/.test(id)),
      `unexpected out-of-scope leftovers: ${resolution.leftoverRuleIds.join(", ")}`
    );
    assert.ok(!resolution.leftoverRuleIds.includes("gdpr.art32"));
  });
});

describe("doc-type DPA — broad analysis without regime packages", () => {
  const DPA_INSTRUCTION =
    "do the in depth anaysis of DPA that is uploaded and with all the pointers of DPA. check everything around the dpa and provide me the anaysis";

  it("selects doc-types/dpa for a DPA doc-type hint and instruction", () => {
    resetSkillRegistryForTests();
    const selection = selectSkills({
      instruction: DPA_INSTRUCTION,
      docType: "dpa",
    });
    assert.ok(selection.skills.some((skill) => skill.skillId === "doc-types/dpa"));
  });

  it("schedules structural checks instead of only aggregate when requirements are unmapped", () => {
    resetSkillRegistryForTests();
    const dpa = getSkillById("doc-types/dpa")!;
    const global = getSkillById("_global")!;
    const requirements: IntentRequirement[] = [
      {
        id: "dpa.overall_analysis",
        description: "Provide an in-depth analysis of the Data Processing Addendum (DPA).",
        type: "verification",
        priority: "required",
      },
      {
        id: "dpa.key_pointers",
        description: "Identify and analyze all key pointers/elements within the DPA.",
        type: "extraction",
        priority: "required",
      },
      {
        id: "dpa.comprehensive_review",
        description: "Conduct a comprehensive review of all aspects related to the DPA.",
        type: "verification",
        priority: "required",
      },
    ];
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: DPA_INSTRUCTION,
      skills: [global, dpa],
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements,
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      focus: {
        ruleIds: [],
        matrixRowIds: [],
        riskCategoryIds: [],
        instructionText: DPA_INSTRUCTION,
        requirements: requirements.map((req) => ({ id: req.id, label: req.description })),
      },
    });

    const tools = new Set(workUnits.map((unit) => unit.tool));
    assert.ok(tools.has("check_expected_clauses"), "expected DPA structural clause checks");
    assert.ok(tools.has("flag_risk"), "expected DPA structural risk pass");
    assert.ok(tools.has("extract_clauses"));
    assert.ok(tools.has("aggregate_requirements"));
    assert.equal(
      workUnits.filter((unit) => unit.tool === "check_against_rule").length,
      0
    );
  });
});
