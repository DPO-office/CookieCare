import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisBranchPlan, AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { EvidencePackage } from "../../../models/evidence-package.js";
import type { Finding } from "../../../models/finding.js";
import type { IntentClassification, IntentRequirement, IntentSubIntent } from "../../../models/intent.js";
import { aggregateRequirements } from "../../act/aggregate-requirements.js";
import {
  mergeBranchOutputs,
  validateBranchOutput,
} from "../../reporting/merge-branch-outputs.js";
import { getSkillById } from "../../../skills/runtime/catalog/registry.js";
import {
  adaptiveVerificationTimeoutMs,
  branchOrchestrationMode,
  buildCompoundBranchGraph,
  decomposeCompoundSubIntents,
} from "../build-branch-orchestration.js";
import { subIntentUsesReferenceDocument } from "../build-open-plan.js";
import { explicitRiskResultLimit } from "../generate-propositions.js";

const requirement = (id: string, description: string): IntentRequirement => ({
  id,
  description,
  type: "verification",
  priority: "required",
});

const subIntent = (
  operation: IntentSubIntent["operation"],
  standard: IntentSubIntent["standard"],
  req: IntentRequirement
): IntentSubIntent => ({
  operation,
  standard,
  outputForm: operation === "compare" ? "redline_diff" : "memo",
  description: req.description,
  requirements: [req],
});

function parentIntent(): IntentClassification {
  const compliance = requirement("req.compliance", "Check the legal rule");
  const compare = requirement("req.playbook", "Compare against the playbook");
  const risk = requirement("req.risk", "Rank customer-side risks");
  return {
    scope: "cross_document",
    operation: "compliance_check",
    standard: "regime_pack:test",
    outputForm: "memo",
    reportType: "regime_compliance_memo",
    depth: "standard",
    compound: true,
    subIntents: [
      subIntent("compliance_check", "regime_pack:test", compliance),
      subIntent("compare", "reference_document:playbook", compare),
      subIntent("risk_flag", "none", risk),
    ],
    requirements: [compliance, compare, risk],
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    partyPerspective: "customer",
  };
}

function runtimePackage(facetId: string, req: IntentRequirement): EvidencePackage {
  return {
    id: `runtime.${facetId}`,
    facetId,
    kind: "evaluation",
    sourceMode: "authored",
    requirementIds: [`native.${facetId}`],
    requirementAliases: [req.id],
    capabilityIds: [],
    clauseTypes: ["uncategorized"],
    extractionTargets: [],
    requirementEvidence: {
      [`native.${facetId}`]: {
        hypothesis: req.description,
        proofStandard: `Evidence must establish: ${req.description}`,
      },
    },
  };
}

test("compound planning creates isolated operation branches and shares preparation", () => {
  const intent = parentIntent();
  const skill = getSkillById("_global");
  assert.ok(skill);
  const result = buildCompoundBranchGraph({
    parentIntent: intent,
    instruction: "Check compliance, compare the playbook, and rank customer risks.",
    skills: [skill],
    targetDocIds: ["dpa"],
    referenceDocId: "playbook",
    extraPackages: intent.requirements.map((req, index) =>
      runtimePackage(`facet_${index + 1}`, req)
    ),
    thinkingMode: "lite",
  });

  assert.deepEqual(
    result.branches.map((branch) => branch.intent.operation),
    ["compliance_check", "compare", "risk_flag"]
  );
  assert.equal(result.workUnits.filter((unit) => unit.tool === "classify_document").length, 1);
  assert.equal(result.workUnits.filter((unit) => unit.tool === "extract_clauses").length, 1);
  assert.equal(result.workUnits.filter((unit) => unit.tool === "render_output").length, 3);
  assert.equal(result.workUnits.at(-1)?.tool, "merge_branch_outputs");
  assert.ok(
    result.workUnits
      .filter((unit) => unit.tool === "evaluate_package")
      .every((unit) => Boolean(unit.facetId))
  );
});

test("mixed compliance and playbook requirements normalize into separate branches", () => {
  const intent = parentIntent();
  intent.subIntents = [
    {
      operation: "compliance_check",
      standard: "none",
      outputForm: "memo",
      description: "Legal compliance and playbook check",
      requirements: [
        intent.requirements[0]!,
        {
          ...intent.requirements[1]!,
          type: "verification",
          description: "Check against the uploaded internal playbook requirements",
        },
      ],
    },
    {
      ...intent.subIntents[2]!,
      requirements: [
        { ...intent.subIntents[2]!.requirements[0]!, type: "comparison" },
      ],
    },
  ];
  const normalized = decomposeCompoundSubIntents(intent);
  assert.deepEqual(
    normalized.subIntents.map((item) => item.operation),
    ["compliance_check", "compare", "risk_flag"]
  );
  assert.equal(normalized.subIntents[0]?.standard, intent.standard);
  assert.ok(normalized.subIntents[1]?.standard.startsWith("reference_document:"));
});

test("comparison-typed risk requirements do not inherit the playbook", () => {
  assert.equal(
    subIntentUsesReferenceDocument({ operation: "risk_flag", standard: "none" }),
    false
  );
  assert.equal(
    subIntentUsesReferenceDocument({
      operation: "compare",
      standard: "reference_document:uploaded_reference",
    }),
    true
  );
});

test("generic ranked-risk wording bounds the investigation breadth", () => {
  assert.equal(explicitRiskResultLimit("Rank the top 5 onboarding risks"), 5);
  assert.equal(explicitRiskResultLimit("Give me the first 3 material issues"), 3);
  assert.equal(explicitRiskResultLimit("Review the agreement for risk"), undefined);
});

test("real authored compliance package stays in its branch beside open compare and risk packages", () => {
  const legal = requirement(
    "gdpr.article28.processor_obligations",
    "Check every mandatory Article 28 processor obligation"
  );
  const compare = requirement("req.playbook", "Compare against the uploaded playbook");
  const risk = requirement("req.risk", "Rank customer-side onboarding risks");
  const intent: IntentClassification = {
    ...parentIntent(),
    subIntents: [
      subIntent("compliance_check", "regime_pack:regimes/data-protection/gdpr", legal),
      subIntent("compare", "reference_document:playbook", compare),
      subIntent("risk_flag", "none", risk),
    ],
    requirements: [legal, compare, risk],
  };
  const skills = ["_global", "doc-types/dpa", "regimes/data-protection/gdpr"]
    .map((id) => getSkillById(id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  const result = buildCompoundBranchGraph({
    parentIntent: intent,
    instruction: "Check GDPR compliance, compare the playbook, and rank customer risks.",
    skills,
    targetDocIds: ["dpa"],
    referenceDocId: "playbook",
    focus: {
      ruleIds: [],
      matrixRowIds: [],
      riskCategoryIds: [],
      instructionText: "Check every mandatory Article 28 processor obligation",
      requirements: [{ id: legal.id, label: legal.description }],
      selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
    },
    extraPackages: [runtimePackage("facet_2", compare), runtimePackage("facet_3", risk)],
  });
  const complianceUnits = result.workUnits.filter(
    (unit) => unit.facetId === "facet_1" && unit.tool === "evaluate_package"
  );
  assert.ok(
    complianceUnits.some((unit) =>
      String(unit.input.packageId).startsWith("gdpr.art28")
    )
  );
  assert.ok(
    result.workUnits
      .filter((unit) => unit.facetId === "facet_2")
      .every((unit) => !String(unit.input.packageId ?? "").startsWith("gdpr.art28"))
  );
});

test("duplicate equivalent sub-intents reuse one investigation", () => {
  const intent = parentIntent();
  intent.subIntents.push({ ...intent.subIntents[2]! });
  const skill = getSkillById("_global");
  assert.ok(skill);
  const result = buildCompoundBranchGraph({
    parentIntent: intent,
    instruction: "Rank risks and provide negotiation advice.",
    skills: [skill],
    targetDocIds: ["dpa"],
    extraPackages: intent.requirements.map((req, index) =>
      runtimePackage(`facet_${index + 1}`, req)
    ),
  });
  assert.equal(result.branches.filter((branch) => branch.intent.operation === "risk_flag").length, 1);
});

test("negotiation drafting is derived from an existing risk investigation", () => {
  const intent = parentIntent();
  intent.subIntents.push({
    operation: "draft_suggestion",
    standard: "none",
    outputForm: "memo",
    description: "Suggest negotiation actions for the ranked risks",
    requirements: [requirement("req.negotiation", "Recommend negotiation actions")],
  });
  const skill = getSkillById("_global");
  assert.ok(skill);
  const result = buildCompoundBranchGraph({
    parentIntent: intent,
    instruction: "Rank risks and suggest negotiation actions.",
    skills: [skill],
    targetDocIds: ["dpa"],
    extraPackages: [
      runtimePackage("facet_1", intent.requirements[0]!),
      runtimePackage("facet_2", intent.requirements[1]!),
      runtimePackage("facet_3", intent.requirements[2]!),
      runtimePackage("facet_4", requirement("req.negotiation", "Recommend negotiation actions")),
    ],
  });
  assert.equal(result.branches.length, 3);
  const riskBranch = result.branches.find((branch) => branch.intent.operation === "risk_flag");
  assert.ok(riskBranch?.intent.requirements.some((item) => item.id === "req.negotiation"));
});

test("LOCK cannot use a sibling playbook branch finding", () => {
  const state = {
    request: { sessionId: "s", instruction: "compound", documentIds: [], documentTexts: {} },
    workspace: { documents: [] },
    intent: parentIntent(),
    findings: [],
    draftTasks: [],
    metadata: { timestamp: "now", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
    plan: {
      intent: parentIntent(),
      workUnits: [],
      missingClarifications: [],
      outputForm: "memo",
      rendererSchemaId: "memo",
      pinnedVersions: { clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
      branches: [
        { facetId: "facet_1", intent: { ...parentIntent(), compound: false, subIntents: [], requirements: [requirement("req.same", "Legal check")] }, requirementBindings: [], requirementExecutionPaths: [] },
      ],
    },
  } as unknown as AnalysisState;
  const sibling: Finding = {
    findingId: "playbook-finding",
    facetId: "facet_2",
    kind: "compliance",
    category: "other_known_risk",
    status: "present",
    claim: "The playbook says this is required.",
    evidence: [],
    taxonomyVersion: "1",
    requirementId: "req.same",
  };
  const unit = {
    workUnitId: "facet_1-wu-aggregate",
    facetId: "facet_1",
    tool: "aggregate_requirements",
    input: { facetId: "facet_1" },
    dependsOn: [],
    outputSchema: "string",
    status: "pending",
  } satisfies AnalysisWorkUnit;
  const result = aggregateRequirements(state, unit, [sibling]);
  assert.ok(
    (result.state.requirementAssessments ?? []).every(
      (assessment) => !assessment.supportingFindingIds.includes("playbook-finding")
    )
  );
});

test("adaptive timeout respects Lite and Deep caps", () => {
  assert.equal(adaptiveVerificationTimeoutMs({ thinkingMode: "lite", selectedCandidateCount: 1, evidenceChars: 1_000 }), 45_000);
  assert.equal(adaptiveVerificationTimeoutMs({ thinkingMode: "lite", selectedCandidateCount: 100, evidenceChars: 1_000_000 }), 75_000);
  assert.equal(adaptiveVerificationTimeoutMs({ thinkingMode: "deep", selectedCandidateCount: 1, evidenceChars: 1_000 }), 90_000);
  assert.equal(adaptiveVerificationTimeoutMs({ thinkingMode: "deep", selectedCandidateCount: 100, evidenceChars: 1_000_000 }), 150_000);
  assert.equal(branchOrchestrationMode("unexpected"), "off");
});

test("merge keeps a successful branch when a sibling branch fails", () => {
  const branch = (facetId: string, order: number, label: string): AnalysisBranchPlan => ({
    facetId,
    order,
    label,
    instruction: label,
    intent: { ...parentIntent(), compound: false, subIntents: [] },
    targetDocIds: ["dpa"],
    capabilityContract: { operation: "explain_qa", defaultReportType: "qa_answer", supportsOpenPropositions: true, bypassRegimeCatalog: true, needsOpenInventory: false, leanVerifiedGraph: true, evidenceCardinality: "single_or_multi_passage", allowRelatedChecks: false, allowComparativeChecks: false, outlineDesigner: "none", allowBluf: false },
    reportSpec: { reportType: "qa_answer", depth: "narrow", sections: ["key_findings", "evidence"] },
    rendererSchemaId: "qa_thread",
    activeSkillIds: ["_global"],
    requirementExecutionPaths: [],
    requirementBindings: [],
    workUnitIds: [],
    timeBudget: { thinkingMode: "lite", baseVerificationMs: 45_000, maxVerificationMs: 75_000, hardCeilingMs: 180_000, retryFailedRequirements: 0, estimatedCriticalPathMs: 45_000 },
  });
  const state = {
    request: { sessionId: "s", instruction: "compound", documentIds: [], documentTexts: {} },
    workspace: { documents: [] },
    findings: [],
    draftTasks: [],
    metadata: { timestamp: "now", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
    plan: { branches: [branch("facet_1", 0, "Answer"), branch("facet_2", 1, "Risk")] },
    branchReports: { facet_1: "The verified answer contains enough grounded detail to release safely." },
    branchDiagnostics: { facet_1: { status: "complete" }, facet_2: { status: "incomplete", failedLayer: "ACT", reason: "timeout" } },
  } as unknown as AnalysisState;
  const merged = mergeBranchOutputs(state, { workUnitId: "merge", tool: "merge_branch_outputs", input: { branchOrder: ["facet_1", "facet_2"] }, dependsOn: [], outputSchema: "string", status: "pending" }, []);
  assert.match(merged.state.renderedOutput ?? "", /^# Analysis report/);
  assert.match(merged.state.renderedOutput ?? "", /1 of 2 workstreams completed/);
  assert.match(merged.state.renderedOutput ?? "", /## 1\. Compliance review/);
  assert.match(merged.state.renderedOutput ?? "", /## 2\. Compliance review/);
  assert.match(merged.state.renderedOutput ?? "", /verified answer/);
  assert.match(merged.state.renderedOutput ?? "", /Analysis incomplete/);
  assert.equal(validateBranchOutput("system prompt leaked here with enough words to pass", 0, false).valid, false);
});
