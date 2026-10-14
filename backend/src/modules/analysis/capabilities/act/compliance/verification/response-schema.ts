import { z } from "zod";

const applicability = z.object({ state: z.enum(["applicable", "not_applicable", "unknown"]), basis: z.string(), evidenceIds: z.array(z.string()), contextFactIds: z.array(z.string()) });
const concern = z.object({ description: z.string(), citationIds: z.array(z.string()), materiality: z.enum(["material", "immaterial", "unknown"]) });
const scope = z.enum(["controller_to_processor", "controller_to_controller", "processor_to_processor", "unspecified"]);
/** Provider wire format only. Domain decisions keep exact, expanded citations. */
export const verificationWireSchema = z.object({
  protocolVersion: z.literal(2),
  checkId: z.string(), ruleHash: z.string(), bundleHash: z.string(), applicability,
  citations: z.array(z.object({ citationId: z.string(), evidenceId: z.string(), quote: z.string(), explanation: z.string() })),
  elements: z.array(z.object({
    elementId: z.string(), state: z.enum(["supported", "contradicted", "not_located", "ambiguous", "unresolved_dependency", "not_applicable"]), applicability,
    citations: z.array(z.object({ citationId: z.string(), use: z.enum(["proof", "related", "conflict"]) })),
    establishedFact: z.string(), missingProof: z.string(), roleReassessment: z.string(),
    actorScope: z.object({ relationshipScope: scope, basis: z.string(), citationIds: z.array(z.string()) }),
    limitations: z.array(concern), conflicts: z.array(concern),
  })),
  dependencies: z.array(z.object({ id: z.string(), elementIds: z.array(z.string()), materiality: z.enum(["material", "immaterial", "unknown"]), reason: z.string() })),
  answers: z.array(z.object({ questionId: z.string(), answer: z.string(), elementIds: z.array(z.string()), citationIds: z.array(z.string()) })),
});

/** Source quotes are still checked by validateVerification; IDs alone never prove a fact. */
export function expandVerificationResponse(raw: unknown): { value: unknown; errors: string[]; warnings: string[] } {
  if (!raw || typeof raw !== "object" || !("protocolVersion" in raw)) return { value: raw, errors: [], warnings: [] };
  const suppliedAnswers = "answers" in raw && Array.isArray(raw.answers) ? raw.answers : [];
  const parsed = verificationWireSchema.safeParse({ ...raw, answers: [] });
  if (!parsed.success) return { value: undefined, errors: parsed.error.issues.map(i => i.path.join(".") + ": " + i.message), warnings: [] };
  const value = parsed.data, errors: string[] = [], warnings: string[] = [];
  const registry = new Map(value.citations.map(c => [c.citationId, c]));
  if (registry.size !== value.citations.length) errors.push("duplicate_citation_identity");
  const resolve = (id: string, label: string) => {
    const c = registry.get(id);
    if (!c) errors.push("unknown_citation:" + label + ":" + id);
    return c;
  };
  const elements = value.elements.map(e => {
    const refs = [...e.citations];
    for (const id of [...e.actorScope.citationIds, ...e.limitations.flatMap(c => c.citationIds), ...e.conflicts.flatMap(c => c.citationIds)])
      if (!refs.some(c => c.citationId === id)) refs.push({ citationId: id, use: "related" });
    const citations = refs.flatMap(ref => {
      const c = resolve(ref.citationId, e.elementId);
      return c ? [{ evidenceId: c.evidenceId, quote: c.quote, explanation: c.explanation, use: ref.use }] : [];
    });
    const evidenceIds = (ids: string[]) => [...new Set(ids.flatMap(id => {
      const c = resolve(id, e.elementId); return c ? [c.evidenceId] : [];
    }))];
    return { ...e, citations, actorScope: { ...e.actorScope, evidenceIds: evidenceIds(e.actorScope.citationIds) },
      limitations: e.limitations.map(c => ({ ...c, evidenceIds: evidenceIds(c.citationIds) })),
      conflicts: e.conflicts.map(c => ({ ...c, evidenceIds: evidenceIds(c.citationIds) })) };
  });
  const answers = suppliedAnswers.flatMap(candidate => {
    const parsedAnswer = verificationWireSchema.shape.answers.element.safeParse(candidate);
    if (!parsedAnswer.success) { warnings.push("invalid_answer_shape"); return []; }
    const a = parsedAnswer.data;
    if (a.citationIds.some(id => !registry.has(id))) { warnings.push("invalid_answer_citation:" + a.questionId); return []; }
    return [{ ...a, evidenceIds: [...new Set(a.citationIds.map(id => registry.get(id)!.evidenceId))] }];
  });
  return { value: { ...value, elements, answers }, errors, warnings };
}
