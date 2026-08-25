import type { DraftState } from "../../models/draft-state.js";
import type { StructuredFacts } from "../../models/structured-facts.js";
import type {
  CanonicalRequirement,
  DraftRequirementsMap,
  DraftRequirementsState,
  RequirementConflict,
} from "../../models/draft-requirements.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";
import {
  getRequiredFactCatalog,
  isFactSatisfied,
  resolveDocTypeKey,
  sanitizeKnownFacts,
  type RequiredFactCatalogEntry,
} from "./core-deal-facts.js";

function readFactValue(
  facts: Record<string, unknown>,
  entry: RequiredFactCatalogEntry
): unknown {
  if (entry.id === "parties") {
    if (Array.isArray(facts.parties) && facts.parties.length >= 2) {
      return facts.parties;
    }
    if (facts.partyA && facts.partyB) {
      return [facts.partyA, facts.partyB];
    }
    return facts.parties ?? null;
  }
  if (entry.id === "transferMechanism") {
    if (isFactSatisfied(facts, "transferMechanism")) {
      return (
        facts.transferMechanism ??
        facts.sccModule ??
        (facts.ukIdta === true ? "UK IDTA" : facts.dataTransfer) ??
        null
      );
    }
    return null;
  }
  const direct = facts[entry.id];
  if (direct !== undefined && direct !== null) return direct;
  for (const alias of entry.aliases ?? []) {
    if (facts[alias] !== undefined && facts[alias] !== null) return facts[alias];
  }
  return null;
}

function exclusionHits(
  facts: Record<string, unknown>,
  requirementId: string
): boolean {
  const excluded = facts.excludedRequirements;
  if (!Array.isArray(excluded)) return false;
  const needle = requirementId.toLowerCase();
  return excluded.some((e) => {
    if (typeof e !== "string") return false;
    const n = e.toLowerCase();
    return n === needle || n.includes(needle) || needle.includes(n);
  });
}

/**
 * Resolve catalog requirements against structuredFacts.
 * ASK authority: status missing/conflict → ask; satisfied/assumed/n/a → never ask.
 */
export function resolveRequirements(state: DraftState): DraftState {
  const documentType =
    (typeof state.structuredFacts?.documentType === "string"
      ? state.structuredFacts.documentType
      : undefined) ||
    state.plan?.documentType ||
    state.requirements?.contractType ||
    resolveDocTypeKey(String(state.structuredFacts?.documentType ?? ""));

  const facts = sanitizeKnownFacts({
    ...(state.structuredFacts ?? {}),
  }) as Record<string, unknown>;

  const catalog = getRequiredFactCatalog(
    documentType || (typeof facts.documentType === "string" ? facts.documentType : undefined)
  );

  const prior = state.draftRequirements?.byId ?? {};
  const byId: DraftRequirementsMap = {};
  const conflicts: RequirementConflict[] = [
    ...(state.draftRequirements?.conflicts ?? []),
  ];

  for (const entry of catalog) {
    const priorReq = prior[entry.id];

    // Already answered via ASK resume or extract — keep satisfied.
    if (priorReq?.status === "satisfied" && priorReq.value != null) {
      byId[entry.id] = {
        ...priorReq,
        id: entry.id,
        priority: entry.priority,
        blocking: entry.blocking,
        question: entry.question,
        options: entry.options,
        reasonRequired: entry.reasonRequired,
        aliases: entry.aliases ?? [],
      };
      console.log(
        `[resolveRequirements] SKIP ${entry.id} status=satisfied source=${byId[entry.id].source} evidence=${JSON.stringify(byId[entry.id].evidence.slice(0, 1))}`
      );
      continue;
    }

    if (
      entry.coveredByEffectiveDate &&
      isFactSatisfied(facts, "effectiveDate") &&
      !isFactSatisfied(facts, entry.id)
    ) {
      // Use effectiveDate as stand-in for MSA date when only one date known.
      const eff = facts.effectiveDate;
      byId[entry.id] = {
        id: entry.id,
        value: eff ?? null,
        status: "assumed",
        source: "default",
        priority: entry.priority,
        evidence: [
          typeof eff === "string"
            ? `Assumed principalAgreementDate from effectiveDate (${eff})`
            : "Assumed from effectiveDate",
        ],
        aliases: entry.aliases ?? [],
        blocking: entry.blocking,
        question: entry.question,
        options: entry.options,
        reasonRequired: entry.reasonRequired,
        assumption: true,
      };
      if (typeof eff === "string") {
        facts.principalAgreementDate = eff;
      }
      console.log(
        `[resolveRequirements] SKIP ${entry.id} status=assumed source=default (coveredByEffectiveDate)`
      );
      continue;
    }

    if (exclusionHits(facts, entry.id) && entry.blocking) {
      const conflict: RequirementConflict = {
        id: `conflict-${entry.id}`,
        requirementId: entry.id,
        type: "mandatory_requirement_conflict",
        userValue: "exclude",
        skillValue: "required",
        resolution: "ask_user",
        reason: `User excluded "${entry.id}" but the document catalog marks it as mandatory.`,
      };
      conflicts.push(conflict);
      byId[entry.id] = {
        id: entry.id,
        value: null,
        status: "conflict",
        source: "mixed",
        priority: entry.priority,
        evidence: [],
        aliases: entry.aliases ?? [],
        blocking: true,
        question: `You asked to exclude "${entry.id}", but this document type requires it. How should we proceed?`,
        options: [
          "Keep the mandatory requirement",
          "Exclude anyway (accept non-compliance risk)",
          "Other (specify)",
        ],
        reasonRequired: conflict.reason,
      };
      console.log(
        `[resolveRequirements] ASK ${entry.id} status=conflict requiredBy=catalog blocking=true`
      );
      continue;
    }

    if (isFactSatisfied(facts, entry.id)) {
      const value = readFactValue(facts, entry);
      byId[entry.id] = {
        id: entry.id,
        value,
        status: "satisfied",
        source: priorReq?.source === "user" ? "user" : priorReq?.source ?? "user",
        priority: entry.priority,
        evidence: priorReq?.evidence ?? [],
        aliases: entry.aliases ?? [],
        blocking: entry.blocking,
        question: entry.question,
        options: entry.options,
        reasonRequired: entry.reasonRequired,
      };
      console.log(
        `[resolveRequirements] SKIP ${entry.id} status=satisfied source=${byId[entry.id].source}`
      );
      continue;
    }

    if (entry.safeDefault !== undefined) {
      byId[entry.id] = {
        id: entry.id,
        value: entry.safeDefault,
        status: "assumed",
        source: "default",
        priority: entry.priority,
        evidence: [],
        aliases: entry.aliases ?? [],
        blocking: entry.blocking,
        question: entry.question,
        options: entry.options,
        reasonRequired: entry.reasonRequired,
        assumption: true,
      };
      facts[entry.id] = entry.safeDefault;
      console.log(
        `[resolveRequirements] SKIP ${entry.id} status=assumed source=default`
      );
      continue;
    }

    byId[entry.id] = {
      id: entry.id,
      value: null,
      status: "missing",
      source: "skill",
      priority: entry.priority,
      evidence: [],
      aliases: entry.aliases ?? [],
      blocking: entry.blocking,
      question: entry.question,
      options: entry.options,
      reasonRequired: entry.reasonRequired,
    };
    console.log(
      `[resolveRequirements] ASK ${entry.id} status=missing requiredBy=${resolveDocTypeKey(documentType) || "universal"}-catalog blocking=${entry.blocking}`
    );
  }

  // Preserve any prior satisfied non-catalog facts (SLAs etc.) for ACT.
  for (const [id, req] of Object.entries(prior)) {
    if (!byId[id] && req.status === "satisfied") {
      byId[id] = req;
    }
  }

  // Flatten satisfied/assumed into structuredFacts for ACT.
  const flat: Record<string, unknown> = { ...facts };
  for (const req of Object.values(byId)) {
    if (
      (req.status === "satisfied" || req.status === "assumed") &&
      req.value !== null &&
      req.value !== undefined
    ) {
      flat[req.id] = req.value;
    }
  }

  // Keep partyA/partyB when parties array is present.
  if (Array.isArray(flat.parties) && flat.parties.length >= 2) {
    if (!flat.partyA) flat.partyA = flat.parties[0];
    if (!flat.partyB) flat.partyB = flat.parties[1];
  }

  const draftRequirements: DraftRequirementsState = { byId, conflicts };
  const structuredFacts = sanitizeKnownFacts(flat) as StructuredFacts;

  return {
    ...state,
    structuredFacts,
    draftRequirements,
  };
}

/** Mark answered ASK fields as satisfied on the requirements map. */
export function markRequirementsAnswered(
  state: DraftState,
  answers: Record<string, string>
): DraftState {
  const byId: DraftRequirementsMap = {
    ...(state.draftRequirements?.byId ?? {}),
  };

  for (const [key, raw] of Object.entries(answers)) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const id = canonicalizeFieldId(key);
    const prior = byId[id];
    byId[id] = {
      id,
      value,
      status: "satisfied",
      source: "user",
      priority: prior?.priority ?? "critical",
      evidence: [...(prior?.evidence ?? []), `User answer: ${value}`],
      aliases: prior?.aliases ?? [],
      blocking: prior?.blocking ?? true,
      question: prior?.question,
      options: prior?.options,
      reasonRequired: prior?.reasonRequired,
    };
  }

  return {
    ...state,
    draftRequirements: {
      byId,
      conflicts: (state.draftRequirements?.conflicts ?? []).map((c) =>
        byId[c.requirementId]?.status === "satisfied"
          ? { ...c, resolution: "resolved" as const }
          : c
      ),
    },
  };
}

export function requirementToMissingFact(req: CanonicalRequirement): {
  field: string;
  question: string;
  severity: "critical" | "optional";
  reasonRequired?: string;
  options?: string[];
} {
  return {
    field: req.id,
    question:
      req.question ||
      `Please provide a value for ${req.id}.`,
    severity: req.blocking || req.priority === "critical" ? "critical" : "optional",
    reasonRequired: req.reasonRequired,
    options: req.options,
  };
}
