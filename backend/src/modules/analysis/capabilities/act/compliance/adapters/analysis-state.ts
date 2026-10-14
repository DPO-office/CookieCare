import { createHash } from "node:crypto";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import { compileComplianceRule } from "../../../../skills/runtime/catalog/compile-compliance-rule.js";
import type { ComplianceCheck, VerificationBundle, VerificationContext } from "../contracts/index.js";
import type { RequirementEvidenceBundle, InvestigationRequirement } from "../investigation/index.js";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function checksFromState(state: AnalysisState): ComplianceCheck[] {
  const skills = state.activeSkills ?? [];
  const selected = state.plan?.complianceRequirementResolution?.selections ?? [];
  const units = state.plan?.workUnits.filter(u => u.tool === "run_compliance_pipeline") ?? [];
  const checks = new Map<string, ComplianceCheck>();
  const boundRules = new Set<string>();
  const ruleKey = (skillId: string, ruleId: string) => JSON.stringify([skillId, ruleId]);
  const addCheck = (selection: { skillId: string; ruleId: string; facetId: string; reason: string }, documentId: string) => {
    const document = state.workspace.documents.find(d => d.docId === documentId);
    const checkId = "check:" + hash([selection.skillId, selection.ruleId, documentId]).slice(0, 24);
    const existing = checks.get(checkId);
    if (existing) {
      existing.facetIds = [...new Set([...existing.facetIds, selection.facetId])];
      existing.selectionReasons = [...new Set([...existing.selectionReasons, selection.reason])];
      return;
    }
    const check: ComplianceCheck = {
      checkId, skillId: selection.skillId, ruleId: selection.ruleId, reviewScopeId: documentId,
      documents: document ? [{ documentId, hash: hash(document.structureGraph?.canonicalText ?? document.fullText) }] : [],
      facetIds: [selection.facetId], selectionReasons: [selection.reason]
    };
    try {
      check.rule = compileComplianceRule(skills, check.skillId, check.ruleId);
    }
    catch (error) {
      check.baselineError = String(error);
    }
    if (!document)
      check.baselineError = "review_scope_unavailable";
    checks.set(checkId, check);
  };
  for (const unit of units) {
    const documentId = String(unit.input.docId ?? "");
    const plannedIds = new Set((unit.input.requirementIds ?? unit.requirementIds ?? []) as string[]);
    const selections = selected.filter(s => {
      const legacyId = skills.find(skill => skill.skillId === s.skillId)?.regimeRules.find(rule => rule.ruleId === s.ruleId)?.legacyRequirementId;
      return !plannedIds.size || plannedIds.has(s.ruleId) || Boolean(legacyId && plannedIds.has(legacyId));
    });
    const coveredIds = new Set(selections.flatMap(s => [s.ruleId,
      skills.find(skill => skill.skillId === s.skillId)?.regimeRules.find(rule => rule.ruleId === s.ruleId)?.legacyRequirementId]));
    const persisted = [...plannedIds].filter(id => !coveredIds.has(id)).map(ruleId => {
      const owners = skills.flatMap(s => s.regimeRules.filter(r => r.ruleId === ruleId || r.legacyRequirementId === ruleId).map(r => ({ skillId: s.skillId, ruleId: r.ruleId })));
      return { ...(owners.length === 1 ? owners[0] : { skillId: "unresolved", ruleId }), facetId: unit.facetId ?? ruleId, reason: "Persisted plan binding" };
    });
    for (const selection of [...selections, ...persisted]) {
      addCheck(selection, documentId);
      boundRules.add(ruleKey(selection.skillId, selection.ruleId));
    }
  }
  // PLAN selections are authoritative even when execution bindings are absent.
  // Preserve these checks without inventing a document or combining scopes.
  for (const selection of selected) {
    if (!boundRules.has(ruleKey(selection.skillId, selection.ruleId))) addCheck(selection, "");
  }
  return [...checks.values()];
}
export function contextFromState(state: AnalysisState): VerificationContext {
  return {
    instruction: state.request.instruction,
    facts: state.intent?.partyPerspective ? [{ id: "party_perspective", text: state.intent.partyPerspective }] : [],
    questions: [{ id: "user_request", text: state.request.instruction },
    ...(state.plan?.complianceRequirementResolution?.facets ?? []).map(f => ({ id: "facet:" + f.facetId, text: f.sourceText }))],
  };
}
/** Translate frozen checks to graph-service inputs using their exact atomic owner. */
export function investigationRequirementsForChecks(state: AnalysisState, checks: ComplianceCheck[]): InvestigationRequirement[] {
  return checks.flatMap(check => {
    const skill=state.activeSkills?.find(s=>s.skillId===check.skillId);
    const rule=skill?.regimeRules.find(r=>r.ruleId===check.ruleId);
    if(!check.rule || !rule?.investigation || check.baselineError) return [];
    return check.documents.map(document=>({
      requestRequirementId:check.facetIds[0] ?? check.checkId,requirementId:check.ruleId,
      packageId:`rule:${check.skillId}`,documentId:document.documentId,
      profile:{hypothesis:rule.investigation!.hypothesis,evidenceHints:rule.investigation!.evidenceHints,proofStandard:check.rule!.proofStandard},
      evidenceScope:rule.investigation!.evidenceScope,clauseTypes:rule.investigation!.clauseTypeHints ?? skill?.clauseTypes ?? [],
      extractionTargets:rule.investigation!.extractionTargets ?? [],
      elementIds:check.rule!.elements.filter(e=>e.kind!=="optional").map(e=>e.id),proofElements:check.rule!.elements,
    }));
  });
}
export function bundleForCheck(state: AnalysisState, check: ComplianceCheck, source?: RequirementEvidenceBundle): VerificationBundle {
  const coverageReasons = [...(source?.coverageReasons ?? [])];
  const passages = (source?.passages ?? []).flatMap(p => {
    const doc = state.workspace.documents.find(d => d.docId === p.documentId);
    const text = doc?.structureGraph?.canonicalText ?? doc?.fullText;
    if (!text || text.slice(...p.sourceRange) !== p.rawText || !check.documents.some(d => d.documentId === p.documentId)) {
      coverageReasons.push("source_identity_mismatch:" + p.nodeId);
      return [];
    }
    return [{
      evidenceId: p.unitId, nodeId: p.nodeId, documentId: p.documentId, text: p.rawText, range: p.sourceRange, path: p.structuralPath,
      role: p.role, relationshipScope: p.relationshipScope ?? "unspecified", contributesToElementIds: p.contributesToElementIds, reason: p.reason, confidence: p.confidence
    }];
  });
  const base = {
    bundleId: source?.bundleId ?? "missing:" + check.checkId, checkId: check.checkId, documentVersions: check.documents, passages,
    dependencies: (source?.dependencies ?? []).map((d, index) => ({
      // Canonical graph references own identity. Historical references without
      // edge IDs remain distinct and unresolved rather than colliding in a Map.
      id: "dependency:" + hash([check.reviewScopeId, d.edgeId ?? [d.sourceNodeId, d.targetNodeIds, d.semanticEffect, d.state, index]]).slice(0, 20),
      edgeId: d.edgeId, referenceText: d.referenceText, referenceRange: d.referenceRange, targetMention: d.targetMention,
      sourceNodeId: d.sourceNodeId, targetNodeIds: d.targetNodeIds,
      state: d.state === "resolved_internal" && (!d.targetNodeIds.length || d.targetNodeIds.some(id => !passages.some(p => p.nodeId === id))) ? "unresolved_internal" as const : d.state, effect: d.semanticEffect
    })),
    executionStatus: !source || coverageReasons.some(reason => reason.startsWith("source_identity_mismatch:")) ? "incomplete" as const : source.executionStatus ?? "unknown" as const,
    coverageIssues: source?.coverageIssues,
    coverageReasons: source ? coverageReasons : ["investigation_unavailable"], investigationWarnings:source?.incompleteReasons ?? [], unestablishedElementIds: source?.unresolvedElementIds ?? check.rule?.elements.map(e => e.id) ?? []
  };
  return { ...base, hash: hash(base) };
}
