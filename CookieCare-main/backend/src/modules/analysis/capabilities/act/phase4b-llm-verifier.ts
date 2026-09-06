/**
 * LLM-backed bundle verifier (additive to Phase 4B).
 *
 * Reads the Phase 3C bundle for one requirement + the Phase 4A element
 * schema and produces the same `RequirementMatrix` shape as the deterministic
 * verifier — one ElementVerdict per authored element with cites and quotes.
 *
 * Runs alongside the deterministic verifier, not instead of it. Neither drives
 * live compliance yet; Phase 5 keeps consuming its current input. This exists
 * so a reviewer can compare LLM verdicts against deterministic verdicts on the
 * same bundle before we nominate one as canonical.
 *
 * Guarantees enforced deterministically after the LLM call:
 *   • every expected element appears exactly once
 *   • every cited evidenceSpanId exists in the supplied bundle
 *   • every quote is a byte-exact substring of the cited item's quotedText
 *   • no scope-incompatible item is jointly relied upon
 *   • state is one of the allowed values
 * A validation failure triggers ONE bounded repair attempt. Second failure →
 * `verification_incomplete` — never a silent gap.
 */

import type { AnalysisState } from "../../models/analysis-state.js";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type {
  ElementSchema,
  RequirementElementSchema,
} from "./element-schemas.js";
import type {
  ElementVerdict,
  ElementVerdictState,
  RequirementMatrix,
} from "./phase4-verify.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
  Phase3ScopeVector,
} from "./phase3-investigate.js";

const ALLOWED_STATES: ElementVerdictState[] = [
  "supported",
  "contradicted",
  "not_located",
  "ambiguous",
  "unresolved_dependency",
  "not_applicable",
];

const SYSTEM_PROMPT = [
  "You are a legal-compliance evidence checker.",
  "For each authored element, decide whether the supplied bundle of quoted document passages supports, contradicts, or leaves the element open.",
  "Judge each element against the WHOLE bundle collectively — different elements may cite different items; one element may cite multiple items.",
  "Rules you MUST follow:",
  "1. Only cite evidenceSpanIds present in the input bundle. Never invent an id.",
  "2. Every quote you emit MUST be a byte-exact substring of the cited item's quotedText.",
  "3. Do NOT output a compliance status for the requirement — only per-element states.",
  "4. Do NOT combine items whose scope contradicts (e.g. controller_to_controller vs controller_to_processor) as joint support for the same element.",
  "5. Return exactly one entry per expected elementId.",
  "6. `state` must be one of: supported, contradicted, not_located, ambiguous, unresolved_dependency, not_applicable.",
  "7. Use `not_applicable` only for a conditional element whose applicabilityRule is not satisfied by the bundle.",
  "8. Do NOT treat two legal obligations as the same merely because they share a word or an abbreviation. Read the element's exact proposition and require the passage to address THAT specific obligation, not a nearby or similarly-named one. Example failure mode to avoid: a 'Data Protection Impact Assessment' clause (a distinct GDPR obligation) is NOT evidence for a 'Transfer Impact Assessment' element just because both contain the word 'assessment' — verify the passage is actually about the element's own subject matter before citing it.",
  "9. Do NOT treat the mere existence of one mechanism as proof that a related but separate obligation was also satisfied. Example: a clause naming a transfer mechanism (e.g. Standard Contractual Clauses) proves that mechanism exists — it does NOT by itself prove a distinct requirement to assess or document supplementary measures, unless the passage itself performs or refers to that assessment.",
  "10. When in doubt between `supported` and `not_located`/`ambiguous`, prefer the more conservative state. A plausible-sounding passage that does not actually state the element's proposition is not evidence for it.",
].join("\n");

interface RawVerdict {
  elementId: string;
  state: string;
  evidenceSpanIds?: string[];
  quotes?: Array<{ spanId?: string; quote?: string }>;
  scope?: Record<string, unknown>;
  establishedFact?: string;
  gapDescription?: string;
  contribution?: string;
}

function schemaFor(schema: RequirementElementSchema) {
  return {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            elementId: {
              type: "string",
              enum: schema.elements.map((e) => e.elementId),
            },
            state: { type: "string", enum: ALLOWED_STATES },
            evidenceSpanIds: { type: "array", items: { type: "string" } },
            quotes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  spanId: { type: "string" },
                  quote: { type: "string" },
                },
                required: ["spanId", "quote"],
              },
            },
            scope: { type: "object" },
            establishedFact: { type: "string" },
            gapDescription: { type: "string" },
          },
          required: ["elementId", "state"],
        },
      },
    },
    required: ["verdicts"],
  };
}

export interface LlmVerifyInput {
  state: AnalysisState;
  requirementId: string;
  schema: RequirementElementSchema;
  bundle: Phase3Bundle;
}

export interface LlmVerifyOutcome {
  matrix: RequirementMatrix;
  llmCallOk: boolean;
  llmError?: string;
  repairAttempted: boolean;
  validationErrors: string[];
}

export async function verifyRequirementWithLlm(
  input: LlmVerifyInput
): Promise<LlmVerifyOutcome> {
  const { state, requirementId, schema, bundle } = input;
  const expectedElementIds = schema.elements.map((e) => e.elementId);
  const bundleIds = new Set(bundle.items.map((i) => i.spanId));
  const itemById = new Map(bundle.items.map((i) => [i.spanId, i]));

  const prompt = buildPrompt(schema, bundle);

  let raw: { verdicts: RawVerdict[] } | undefined;
  let firstError: string | undefined;
  try {
    raw = await callLlm(state, prompt, schema);
  } catch (err) {
    firstError = err instanceof Error ? err.message : String(err);
  }

  const firstAttempt = raw
    ? validate(raw.verdicts, expectedElementIds, bundleIds, itemById, bundle)
    : { verdicts: null, errors: [firstError ?? "llm_call_failed"] };

  if (firstAttempt.verdicts) {
    return {
      matrix: buildMatrix(requirementId, bundle, schema, firstAttempt.verdicts),
      llmCallOk: true,
      repairAttempted: false,
      validationErrors: [],
    };
  }

  // One bounded repair attempt with the validation feedback.
  let repairRaw: { verdicts: RawVerdict[] } | undefined;
  let repairError: string | undefined;
  try {
    repairRaw = await callLlm(
      state,
      `${prompt}\n\nYour previous response was rejected. Reasons:\n${firstAttempt.errors.map((e) => `- ${e}`).join("\n")}\nReturn a corrected JSON object that fixes ALL of these.`,
      schema
    );
  } catch (err) {
    repairError = err instanceof Error ? err.message : String(err);
  }
  const secondAttempt = repairRaw
    ? validate(repairRaw.verdicts, expectedElementIds, bundleIds, itemById, bundle)
    : { verdicts: null, errors: [repairError ?? "llm_repair_failed"] };

  if (secondAttempt.verdicts) {
    return {
      matrix: buildMatrix(requirementId, bundle, schema, secondAttempt.verdicts),
      llmCallOk: true,
      repairAttempted: true,
      validationErrors: firstAttempt.errors,
    };
  }

  // Both attempts failed — never silently promote to Gap.
  return {
    matrix: verificationIncompleteMatrix(requirementId, bundle, schema),
    llmCallOk: !firstError && !repairError,
    llmError: firstError ?? repairError,
    repairAttempted: true,
    validationErrors: [...firstAttempt.errors, ...secondAttempt.errors],
  };
}

function buildPrompt(schema: RequirementElementSchema, bundle: Phase3Bundle): string {
  const elementRows = schema.elements
    .map(
      (el) =>
        `- ${el.elementId} (${el.kind}): ${el.proposition}\n  proofGuidance: ${el.proofGuidance}\n  nonProofTraps: ${JSON.stringify(el.nonProofTraps)}\n  applicabilityRule: ${el.applicabilityRule ?? "(always applicable)"}`
    )
    .join("\n");
  const partitionRows = bundle.partitions
    .map(
      (p) =>
        `- ${p.partitionId}: scope=${JSON.stringify(p.scope)} spans=${p.itemSpanIds.slice(0, 10).join(",")}`
    )
    .join("\n");
  const depRows = bundle.dependencies
    .map((d) => `- ${d.reference} → ${d.state} (${d.targetSpanIds.slice(0, 3).join(",")})`)
    .join("\n");
  const itemRows = bundle.items
    .map((i) => {
      const text = i.quotedText.length > 900 ? `${i.quotedText.slice(0, 900)}…` : i.quotedText;
      return `[${i.spanId}]\n  path: ${i.structuralPath}\n  scope: ${JSON.stringify(i.scope)}\n  quotedText: """${text}"""`;
    })
    .join("\n\n");

  return [
    `Requirement: ${schema.title} (${schema.legalCitation})`,
    `AggregationRule: ${schema.aggregationRule}`,
    "",
    "Elements to judge (return exactly one verdict per elementId):",
    elementRows,
    "",
    "Bundle scope partitions:",
    partitionRows || "(none)",
    "",
    "Bundle same-document dependencies:",
    depRows || "(none)",
    "",
    "Bundle items (evidenceSpanId → quotedText):",
    itemRows,
    "",
    "Return {verdicts: [{ elementId, state, evidenceSpanIds[], quotes[{spanId, quote}], scope, establishedFact, gapDescription }]}.",
  ].join("\n");
}

async function callLlm(
  state: AnalysisState,
  prompt: string,
  schema: RequirementElementSchema
): Promise<{ verdicts: RawVerdict[] }> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const raw = await executeJsonCompletion<{ verdicts: RawVerdict[] }>(
    prompt,
    SYSTEM_PROMPT,
    schemaFor(schema),
    LLMTask.STRUCTURAL_JSON,
    LLMProvider.GEMINI,
    { tracker }
  );
  if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
  return raw ?? { verdicts: [] };
}

function validate(
  raw: RawVerdict[] | undefined,
  expectedIds: string[],
  bundleIds: Set<string>,
  itemById: Map<string, Phase3BundleItem>,
  bundle: Phase3Bundle
): { verdicts: ElementVerdict[] | null; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) {
    return { verdicts: null, errors: ["response_is_not_array"] };
  }
  const returnedIds = new Set(raw.map((v) => v?.elementId).filter(Boolean));
  for (const eid of expectedIds) {
    if (!returnedIds.has(eid)) errors.push(`missing_element_${eid}`);
  }
  const seenIds = new Set<string>();
  for (const v of raw) {
    if (!v || typeof v.elementId !== "string") {
      errors.push("verdict_missing_elementId");
      continue;
    }
    if (!expectedIds.includes(v.elementId)) {
      errors.push(`unknown_elementId_${v.elementId}`);
      continue;
    }
    if (seenIds.has(v.elementId)) {
      errors.push(`duplicate_element_${v.elementId}`);
      continue;
    }
    seenIds.add(v.elementId);
    if (!ALLOWED_STATES.includes(v.state as ElementVerdictState)) {
      errors.push(`invalid_state_${v.elementId}_${v.state}`);
    }
    for (const sid of v.evidenceSpanIds ?? []) {
      if (!bundleIds.has(sid)) {
        errors.push(`fabricated_evidenceSpanId_${v.elementId}_${sid}`);
      }
    }
    for (const q of v.quotes ?? []) {
      if (!q.spanId || !q.quote) {
        errors.push(`quote_missing_fields_${v.elementId}`);
        continue;
      }
      const item = itemById.get(q.spanId);
      if (!item) {
        errors.push(`quote_spanId_not_in_bundle_${v.elementId}_${q.spanId}`);
        continue;
      }
      if (!item.quotedText.includes(q.quote)) {
        errors.push(`quote_not_exact_substring_${v.elementId}_${q.spanId}`);
      }
    }
    // Scope compatibility across cited items.
    if (v.state === "supported" && (v.evidenceSpanIds?.length ?? 0) > 1) {
      const scopes = (v.evidenceSpanIds ?? [])
        .map((sid) => itemById.get(sid)?.scope)
        .filter(Boolean) as Phase3ScopeVector[];
      if (!allScopesCompatible(scopes)) {
        errors.push(`incompatible_scope_joint_support_${v.elementId}`);
      }
    }
  }
  if (errors.length > 0) return { verdicts: null, errors };

  const verdicts: ElementVerdict[] = raw.map((v) =>
    toElementVerdict(v, itemById, bundle)
  );
  return { verdicts, errors: [] };
}

function toElementVerdict(
  raw: RawVerdict,
  itemById: Map<string, Phase3BundleItem>,
  bundle: Phase3Bundle
): ElementVerdict {
  const requestedIds = (raw.evidenceSpanIds ?? []).filter((id) => itemById.has(id));
  // Same coherent-scope narrowing as the deterministic verifier — if the LLM
  // cites items across two explicit relationships, keep only the dominant
  // explicit group plus any unspecified items so Lock Gate 6 does not reject.
  const narrowedItems =
    raw.state === "supported" && requestedIds.length > 1
      ? narrowCitesToCoherentScope(requestedIds.map((id) => itemById.get(id)!))
      : requestedIds.map((id) => itemById.get(id)!);
  const evidenceSpanIds = narrowedItems.map((i) => i.spanId);
  const allowedIds = new Set(evidenceSpanIds);
  const quotes = (raw.quotes ?? [])
    .filter((q) => q.spanId && q.quote && allowedIds.has(q.spanId))
    .map((q) => {
      const item = itemById.get(q.spanId!)!;
      return {
        spanId: q.spanId!,
        quote: q.quote!,
        quoteVerified: item.quotedText.includes(q.quote!),
        charRange: item.charRange,
      };
    });
  const scope: Phase3ScopeVector =
    firstExplicitScope(narrowedItems) ??
    (raw.scope as Phase3ScopeVector | undefined) ??
    (evidenceSpanIds[0] ? itemById.get(evidenceSpanIds[0])!.scope : {});
  return {
    elementId: raw.elementId,
    state: raw.state as ElementVerdictState,
    evidenceSpanIds,
    quotes,
    scope,
    establishedFact: raw.establishedFact ?? "",
    gapDescription: raw.gapDescription ?? "",
    contribution: "individual",
  };
}

function narrowCitesToCoherentScope(items: Phase3BundleItem[]): Phase3BundleItem[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const rel = i.scope?.relationship;
    if (!rel || rel === "unspecified") continue;
    counts.set(rel, (counts.get(rel) ?? 0) + 1);
  }
  if (counts.size <= 1) return items;
  const [winnerRel] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const winners = items.filter((i) => i.scope?.relationship === winnerRel);
  const unspecified = items.filter(
    (i) => !i.scope?.relationship || i.scope.relationship === "unspecified"
  );
  return [...winners, ...unspecified];
}

function firstExplicitScope(items: Phase3BundleItem[]): Phase3ScopeVector | undefined {
  for (const i of items) {
    if (i.scope?.relationship && i.scope.relationship !== "unspecified") return i.scope;
  }
  return undefined;
}

function allScopesCompatible(scopes: Phase3ScopeVector[]): boolean {
  const nonEmpty = scopes.filter(
    (s) => s.relationship && s.relationship !== "unspecified"
  );
  if (nonEmpty.length < 2) return true;
  const first = nonEmpty[0].relationship!;
  return nonEmpty.every((s) => s.relationship === first);
}

function buildMatrix(
  requirementId: string,
  bundle: Phase3Bundle,
  schema: RequirementElementSchema,
  verdicts: ElementVerdict[]
): RequirementMatrix {
  const expectedElementIds = schema.elements.map((e) => e.elementId);
  const returnedElementIds = verdicts.map((v) => v.elementId);
  const missingElementIds = expectedElementIds.filter(
    (id) => !returnedElementIds.includes(id)
  );
  return {
    requirementId,
    bundleId: bundle.bundleId,
    schemaVersion: schema.version,
    reviewStatus: schema.reviewStatus,
    elements: verdicts,
    expectedElementIds,
    returnedElementIds,
    missingElementIds,
    estimatedTokens: bundle.estimatedTokens,
  };
}

function verificationIncompleteMatrix(
  requirementId: string,
  bundle: Phase3Bundle,
  schema: RequirementElementSchema
): RequirementMatrix {
  // Never silently gap — mark every element as its own not_located so Phase 5
  // routes to verification_incomplete (missingElementIds also non-empty).
  const verdicts: ElementVerdict[] = schema.elements.map((el: ElementSchema) => ({
    elementId: el.elementId,
    state: "not_located",
    evidenceSpanIds: [],
    quotes: [],
    scope: {},
    establishedFact: "",
    gapDescription: "LLM verification did not return a valid element matrix.",
    contribution: "individual",
  }));
  return {
    requirementId,
    bundleId: bundle.bundleId,
    schemaVersion: schema.version,
    reviewStatus: schema.reviewStatus,
    elements: verdicts,
    expectedElementIds: schema.elements.map((e) => e.elementId),
    returnedElementIds: [],
    missingElementIds: schema.elements.map((e) => e.elementId),
    estimatedTokens: bundle.estimatedTokens,
  };
}
