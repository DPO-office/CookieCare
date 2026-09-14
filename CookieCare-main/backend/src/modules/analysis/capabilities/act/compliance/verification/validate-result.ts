import { z } from "zod";
import type { ApplicabilityDecision, VerificationDecision, VerificationRequest, VerifiedCitation } from "../contracts/index.js";
import { expandVerificationResponse, verificationWireSchema } from "./response-schema.js";
const applicability = z.object({ state: z.enum(["applicable", "not_applicable", "unknown"]), basis: z.string().min(1), evidenceIds: z.array(z.string()), contextFactIds: z.array(z.string()) });
const citation = z.object({ evidenceId: z.string(), quote: z.string().min(1), use: z.enum(["proof", "related", "conflict"]), explanation: z.string().min(1) });
const concern = z.object({ description: z.string().min(1), evidenceIds: z.array(z.string()), materiality: z.enum(["material", "immaterial", "unknown"]) });
const rawSchema = z.object({
  checkId: z.string(), ruleHash: z.string(), bundleHash: z.string(), applicability,
  elements: z.array(z.object({ elementId: z.string(), state: z.enum(["supported", "contradicted", "not_located", "ambiguous", "unresolved_dependency", "not_applicable"]), applicability, citations: z.array(citation), establishedFact: z.string(), missingProof: z.string(), roleReassessment: z.string(),
    actorScope: z.object({ relationshipScope:z.string(),basis:z.string(),evidenceIds:z.array(z.string()) }), limitations:z.array(concern),conflicts:z.array(concern) })),
  dependencies: z.array(z.object({ id: z.string(), elementIds: z.array(z.string()), materiality: z.enum(["material", "immaterial", "unknown"]), reason: z.string().min(1) })),
  // Narrative is optional enrichment, not a condition for a valid evidence matrix.
  answers: z.array(z.unknown()).optional().default([]),
});
export function verificationResponseSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(verificationWireSchema) as Record<string, unknown>;
  // Gemini responseSchema uses its Schema subset; strict checks remain in Zod.
  function compatible(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(compatible); return; }
    const object=value as Record<string,unknown>;
    for (const key of ["$schema","additionalProperties","minLength"]) delete object[key];
    if ("const" in object) {
      // Gemini Schema enums are strings; numeric protocol literals remain a
      // strict local Zod check instead of an invalid provider enum.
      if (typeof object.const === "string") object.enum = [object.const];
      delete object.const;
    }
    Object.values(object).forEach(compatible);
  }
  compatible(schema);
  return schema;
}
/** Typography normalization with a reversible offset map; ambiguous occurrences are rejected. */
export function locateSourceQuote(source: string, quote: string): [
  number,
  number
] | undefined {
  function normalize(text: string) {
    let value = "";
    const starts: number[] = [], ends: number[] = [];
    for (let i = 0;i < text.length;i++) {
      const c = text[i].replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").toLowerCase();
      if (/\s/.test(c)) {
        if (value.endsWith(" ")) {
          ends[ends.length - 1] = i + 1;
          continue;
        }
        value += " ";
        starts.push(i);
        ends.push(i + 1);
      }
      else
        for (const part of c) {
          value += part;
          starts.push(i);
          ends.push(i + 1);
        }
    }
    return { value, starts, ends };
  }
  const s = normalize(source), q = normalize(quote).value.trim(), at = s.value.indexOf(q);
  if (!q || at < 0 || s.value.indexOf(q, at + 1) >= 0)
    return undefined;
  return [s.starts[at], s.ends[at + q.length - 1]];
}
export function validateVerification(raw: unknown, r: VerificationRequest): {
  decision?: VerificationDecision;
  errors: string[];
  validatedElements?: VerificationDecision["elements"];
  warnings?: string[];
} {
  const expanded = expandVerificationResponse(raw);
  if (expanded.errors.length) return { errors: expanded.errors };
  const parsed = rawSchema.safeParse(expanded.value);
  if (!parsed.success)
    return { errors: parsed.error.issues.map(i => i.path.join(".") + ": " + i.message) };
  const value = parsed.data, errors: string[] = [], warnings = [...expanded.warnings], rule = r.check.rule!;
  if (!rule)
    return { errors: ["baseline_unavailable"] };
  if (r.bundle.checkId !== r.check.checkId)
    errors.push("bundle_check_mismatch");
  if (JSON.stringify(r.bundle.documentVersions) !== JSON.stringify(r.check.documents))
    errors.push("document_version_mismatch");
  if (new Set(r.bundle.passages.map(p => p.evidenceId)).size !== r.bundle.passages.length)
    errors.push("duplicate_evidence_identity");
  for (const p of r.bundle.passages)
    if (p.range[1] - p.range[0] !== p.text.length || p.range[0] < 0)
      errors.push("invalid_source_offsets:" + p.evidenceId);
  if (value.checkId !== r.check.checkId || value.ruleHash !== rule.hash || value.bundleHash !== r.bundle.hash)
    errors.push("identity_or_version_mismatch");
  const passages = new Map(r.bundle.passages.map(p => [p.evidenceId, p]));
  const expected = new Set(rule.elements.map(e => e.id)), seen = new Set<string>();
  const factIds = new Set(r.context.facts.map(f => f.id));
  function checkApplicability(a: ApplicabilityDecision, label: string) {
    if (a.evidenceIds.some(id => !passages.has(id)) || a.contextFactIds.some(id => !factIds.has(id)))
      errors.push(label + ": fabricated_applicability_basis");
    if (a.state === "not_applicable" && !a.evidenceIds.length && !a.contextFactIds.length)
      errors.push(label + ": ungrounded_not_applicable");
  }
  checkApplicability(value.applicability, "rule");
  const fatalIdentityError = errors.length > 0;
  const validElementIds = new Set<string>();
  const reviewRequired: string[] = [];
  const elements = value.elements.map(e => {
    const errorsBefore = errors.length;
    if (!expected.has(e.elementId) || seen.has(e.elementId))
      errors.push("invalid_element:" + e.elementId);
    seen.add(e.elementId);
    checkApplicability(e.applicability, e.elementId);
    if ((e.state === "not_applicable") !== (e.applicability.state === "not_applicable"))
      errors.push("applicability_state_mismatch:" + e.elementId);
    if (value.applicability.state === "not_applicable" && e.state !== "not_applicable")
      errors.push("rule_applicability_mismatch:" + e.elementId);
    const authored = rule.elements.find(a => a.id === e.elementId);
    if (e.state === "not_applicable" && authored?.kind === "mandatory" && value.applicability.state !== "not_applicable")
      errors.push("unconditional_element_excluded:" + e.elementId);
    if (e.applicability.state !== "applicable")
      reviewRequired.push("applicability:" + e.elementId);
    const citations: VerifiedCitation[] = [], scopes = new Set<string>();
    for (const c of e.citations) {
      const p = passages.get(c.evidenceId), range = p && locateSourceQuote(p.text, c.quote);
      if (!p || !range) {
        errors.push("unverified_quote:" + e.elementId + ":" + c.evidenceId);
        continue;
      }
      if (!r.check.documents.some(d => d.documentId === p.documentId))
        errors.push("document_out_of_scope:" + p.documentId);
      if (c.use === "proof" || c.use === "conflict") {
        if (p.relationshipScope && p.relationshipScope !== "unspecified")
          scopes.add(p.relationshipScope);
        if (rule.relationshipScopes.length && p.relationshipScope && p.relationshipScope !== "unspecified" && !rule.relationshipScopes.includes(p.relationshipScope))
          errors.push("actor_scope_mismatch:" + e.elementId);
        if (c.use === "proof" && p.role !== "primary") {
          if (!e.roleReassessment.trim())
            errors.push("unexplained_role_reassessment:" + e.elementId);
          reviewRequired.push("role_reassessment:" + e.elementId);
        }
        if (["context", "definition"].includes(p.role) && !e.citations.some(x => { const item = passages.get(x.evidenceId); return x.use === "proof" && item && !["context", "definition"].includes(item.role); }))
          errors.push("context_only_proof:" + e.elementId);
      }
      citations.push({ ...c, quote: p.text.slice(...range), documentId: p.documentId, nodeId: p.nodeId, path: p.path, range: [p.range[0] + range[0], p.range[0] + range[1]], originalRole: p.role });
    }
    if (scopes.size > 1)
      errors.push("incompatible_joint_scope:" + e.elementId);
    if (e.state === "supported" && !citations.some(c => c.use === "proof"))
      errors.push("support_without_proof:" + e.elementId);
    if (e.state === "contradicted" && !citations.some(c => c.use === "conflict"))
      errors.push("contradiction_without_evidence:" + e.elementId);
    if (e.state === "contradicted")
      reviewRequired.push("conflict:" + e.elementId);
    const elementCitations = new Set(citations.map(c=>c.evidenceId));
    if (e.actorScope.evidenceIds.some(id=>!elementCitations.has(id))) errors.push("ungrounded_actor_scope:"+e.elementId);
    if ((e.state==="supported" || e.state==="contradicted") && rule.relationshipScopes.length) {
      if (!rule.relationshipScopes.includes(e.actorScope.relationshipScope)) reviewRequired.push("actor_scope_unresolved:"+e.elementId);
      else if (!e.actorScope.basis.trim() || !e.actorScope.evidenceIds.length) errors.push("ungrounded_actor_scope:"+e.elementId);
    }
    for (const c of [...e.limitations,...e.conflicts]) {
      if (!c.evidenceIds.length || c.evidenceIds.some(id=>!elementCitations.has(id))) errors.push("ungrounded_concern:"+e.elementId);
      if (c.materiality !== "immaterial") reviewRequired.push("material_concern:"+e.elementId);
    }
    if (errors.length === errorsBefore) validElementIds.add(e.elementId);
    return { ...e, citations };
  });
  for (const id of expected)
    if (!seen.has(id))
      errors.push("missing_element:" + id);
  const citedIds = new Set(elements.flatMap(e => e.citations.map(c => c.evidenceId)));
  for (const a of [value.applicability, ...value.elements.map(e => e.applicability)]) {
    if (a.state === "not_applicable" && a.evidenceIds.some(id => !citedIds.has(id)))
      errors.push("applicability_requires_exact_source_citation");
  }
  const depIds = new Set(r.bundle.dependencies.map(d => d.id)), seenDeps = new Set<string>();
  for (const d of value.dependencies) {
    if (!depIds.has(d.id) || seenDeps.has(d.id) || d.elementIds.some(id => !expected.has(id)))
      errors.push("invalid_dependency:" + d.id);
    seenDeps.add(d.id);
    if (d.materiality !== "immaterial" && r.bundle.dependencies.find(x => x.id === d.id)?.state !== "resolved_internal")
      reviewRequired.push("dependency:" + d.id);
  }
  for (const id of depIds)
    if (!seenDeps.has(id)) {
      value.dependencies.push({ id, elementIds: [...expected], materiality: "unknown", reason: "Dependency materiality was not established by verification." });
      warnings.push("missing_dependency:" + id);
      if (r.bundle.dependencies.find(x => x.id === id)?.state !== "resolved_internal") reviewRequired.push("dependency:" + id);
    }
  const questions = new Set(r.context.questions.map(q => q.id)), answered = new Set<string>();
  const answerSchema = z.object({ questionId: z.string(), answer: z.string().min(1), elementIds: z.array(z.string()), evidenceIds: z.array(z.string()) });
  const answers: VerificationDecision["answers"] = [];
  for (const candidate of value.answers) {
    const parsedAnswer = answerSchema.safeParse(candidate);
    if (!parsedAnswer.success) { warnings.push("invalid_answer_shape"); continue; }
    const a = parsedAnswer.data;
    if (!a.elementIds.length || a.evidenceIds.some(id=>!citedIds.has(id)) || !questions.has(a.questionId) || answered.has(a.questionId) || a.elementIds.some(id => !expected.has(id))) {
      warnings.push("unlinked_answer:" + a.questionId); continue;
    }
    answered.add(a.questionId);
    answers.push(a);
  }
  for (const id of questions)
    if (!answered.has(id))
      warnings.push("missing_answer:" + id);
  const validatedElements = fatalIdentityError || errors.some(e => /^(invalid_element|missing_element|invalid_dependency|applicability_requires|rule_applicability)/.test(e))
    ? [] : elements.filter(e => validElementIds.has(e.elementId));
  return errors.length ? { errors, warnings, validatedElements }
    : { decision: { ...value, elements, answers, warnings, reviewRequired: [...new Set(reviewRequired)] }, errors: [], warnings, validatedElements };
}
