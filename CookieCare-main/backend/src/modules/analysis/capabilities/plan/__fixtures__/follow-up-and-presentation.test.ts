import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntentClassification } from "../../../models/intent.js";
import {
  classifyFollowUpKind,
  detectDocumentPresentation,
  heuristicClassify,
  isNarrativeInstruction,
  isNewAnalysisFollowUpInstruction,
  isTabularInstruction,
} from "../intent-heuristics.js";
import {
  applyExplicitPresentation,
  inheritFollowUpIntent,
  isMaterialTopicShift,
} from "../follow-up-intent.js";
import { replicateGraphForTargets } from "../../../skills/runtime/graph/replicate-graph-for-targets.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { PackageResolution } from "../../../skills/runtime/graph/resolve-packages.js";

const PRIOR: IntentClassification = {
  scope: "whole_document",
  operation: "compliance_check",
  standard: "regime_pack:regimes/data-protection/gdpr",
  standardConcept: "GDPR",
  outputForm: "memo",
  documentPresentation: "unified",
  reportType: "regime_compliance_memo",
  compound: false,
  subIntents: [],
  requirements: [
    {
      id: "gdpr.art28",
      description: "Article 28 processor terms",
      type: "verification",
      priority: "required",
    },
  ],
  confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
};

describe("presentation heuristics", () => {
  it("detects tabular and narrative asks", () => {
    assert.equal(isTabularInstruction("Present findings as a table."), true);
    assert.equal(isTabularInstruction("show this in tabular mode"), true);
    assert.equal(isNarrativeInstruction("rewrite this in narrative mode"), true);
    assert.equal(isNarrativeInstruction("give me a memo in prose"), true);
  });

  it("detects individual vs combined document presentation", () => {
    assert.equal(
      detectDocumentPresentation(
        "Analyze each attached document individually rather than as a single combined review."
      ),
      "individual"
    );
    assert.equal(
      detectDocumentPresentation("Give me a combined review of both DPAs"),
      "unified"
    );
  });

  it("heuristicClassify honors an explicit table ask", () => {
    const classified = heuristicClassify(
      "Review this DPA for GDPR Article 28.\n\nPresent findings as a table."
    );
    assert.equal(classified.outputForm, "table");
    assert.equal(classified.confidence.outputForm, 1);
  });
});

describe("follow-up kind", () => {
  it("treats format-only follow-ups as presentation changes", () => {
    assert.equal(
      classifyFollowUpKind({
        instruction: "Now show this as a table.",
        hasPriorConversation: true,
        hasPriorFindings: true,
      }),
      "presentation_change"
    );
  });

  it("treats short clarifying questions as conversational Q&A", () => {
    assert.equal(
      classifyFollowUpKind({
        instruction: "What about the liability cap you flagged?",
        hasPriorConversation: true,
        hasPriorFindings: true,
      }),
      "conversational_qa"
    );
  });

  it("treats a new analytical ask as new analysis", () => {
    assert.equal(
      classifyFollowUpKind({
        instruction: "Now check the same DPA for CCPA service-provider restrictions.",
        hasPriorConversation: true,
        hasPriorFindings: true,
      }),
      "new_analysis"
    );
  });

  it("treats can-you-also-check follow-ups as new analysis, not conversational Q&A", () => {
    const instruction =
      "can you also check GDPR 28 clauses in this DPA and provide me in detailed way how things are mentioned in it";
    assert.equal(isNewAnalysisFollowUpInstruction(instruction), true);
    assert.equal(
      classifyFollowUpKind({
        instruction,
        hasPriorConversation: true,
        hasPriorFindings: true,
      }),
      "new_analysis"
    );
  });
});

describe("topic shift detection", () => {
  it("detects a shift from international transfers to GDPR Article 28", () => {
    const prior: IntentClassification = {
      ...PRIOR,
      standard: "regime_pack:regimes/data-protection/international-transfers",
      standardConcept: "International Data Transfer",
      requirements: [
        {
          id: "international_data_transfer.provisions_analysis",
          description: "Analyze transfer provisions",
          type: "coverage",
          priority: "required",
        },
      ],
    };
    const current: IntentClassification = {
      ...PRIOR,
      standard: "regime_pack:regimes/data-protection/gdpr",
      standardConcept: "GDPR Article 28",
      requirements: [
        {
          id: "gdpr.article28.compliance_check",
          description: "Check GDPR Article 28 clauses",
          type: "verification",
          priority: "required",
        },
        {
          id: "gdpr.article28.details_extraction",
          description: "Extract Article 28 details",
          type: "extraction",
          priority: "required",
        },
      ],
    };
    assert.equal(isMaterialTopicShift(prior, current), true);
  });
});

describe("explicit presentation overlays", () => {
  it("lets current-turn tabular wording override a narrative UI setting", () => {
    const next = applyExplicitPresentation(PRIOR, "now present this as a table", {
      answerStyle: "narrative",
      documentPresentation: "unified",
    });
    assert.equal(next.outputForm, "table");
    assert.equal(next.documentPresentation, "unified");
  });

  it("honors the individual UI mode when the text does not contradict it", () => {
    const next = applyExplicitPresentation(PRIOR, "Review these DPAs", {
      documentPresentation: "individual",
    });
    assert.equal(next.documentPresentation, "individual");
  });
});

describe("inherit follow-up intent", () => {
  it("keeps the prior legal ask when the user only changes format", () => {
    const current = applyExplicitPresentation(PRIOR, "show as a table", {
      answerStyle: "tabular",
    });
    const inherited = inheritFollowUpIntent(current, PRIOR, "presentation_change");
    assert.equal(inherited.operation, "compliance_check");
    assert.equal(inherited.standard, PRIOR.standard);
    assert.equal(inherited.outputForm, "table");
    assert.equal(inherited.requirements.length, 1);
  });

  it("inherits the prior standard for a short follow-up question", () => {
    const current: IntentClassification = {
      ...PRIOR,
      operation: "explain_qa",
      standard: "none",
      outputForm: "memo",
      requirements: [],
      confidence: { scope: 0.8, operation: 0.6, standard: 0.4, outputForm: 0.8 },
    };
    const inherited = inheritFollowUpIntent(current, PRIOR, "conversational_qa");
    assert.equal(inherited.standard, PRIOR.standard);
    assert.equal(inherited.operation, "explain_qa");
    assert.equal(inherited.requirements.length, 1);
  });
});

describe("replicateGraphForTargets", () => {
  it("prefixes per-document units and keeps a single render", () => {
    const emptyResolution: PackageResolution = {
      packages: [],
      leftoverRuleIds: [],
      leftoverMatrixRowIds: [],
      leftoverRiskCategoryIds: [],
      requirementToPackageId: {},
      requirementPaths: [],
      blockedCapabilityIds: [],
    };
    const unit = (
      workUnitId: string,
      tool: AnalysisWorkUnit["tool"],
      dependsOn: string[] = []
    ): AnalysisWorkUnit => ({
      workUnitId,
      tool,
      input: { docId: "doc" },
      dependsOn,
      outputSchema: "Finding[]",
      status: "pending",
    });
    const graphFor = (docId: string) => ({
      workUnits: [
        unit("wu-extract", "extract_clauses"),
        unit("wu-eval", "evaluate_package", ["wu-extract"]),
        {
          ...unit("wu-render", "render_output", ["wu-eval"]),
          outputSchema: "string" as const,
        },
      ].map((item) => ({ ...item, input: { ...item.input, docId } })),
      schemaId: "memo" as const,
      rendererSchemaId: "memo" as const,
      packageResolution: emptyResolution,
    });

    const merged = replicateGraphForTargets([graphFor("a"), graphFor("b")]);
    const ids = merged.workUnits.map((u) => u.workUnitId);
    assert.ok(ids.includes("d0-wu-extract"));
    assert.ok(ids.includes("d1-wu-extract"));
    assert.equal(ids.filter((id) => id === "wu-render").length, 1);
    const render = merged.workUnits.find((u) => u.workUnitId === "wu-render")!;
    assert.ok(render.dependsOn.includes("d0-wu-eval"));
    assert.ok(render.dependsOn.includes("d1-wu-eval"));
  });
});
