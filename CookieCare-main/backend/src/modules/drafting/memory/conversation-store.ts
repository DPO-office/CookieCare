import crypto from "crypto";
import type { DraftState } from "../models/draft-state.js";
import {
  createEmptyConversation,
  type ConversationTurn,
  type DraftConversation,
  type ConversationRole,
} from "../models/conversation.js";
import { canonicalizeFieldId } from "../models/draft-requirements.js";
import { markRequirementsAnswered } from "../capabilities/plan/resolve-requirements.js";
import {
  parsePartyPairFromText,
  parseAddressFromText,
  parseConfidentialityTermFromText,
  parseSignatoriesFromText,
} from "../capabilities/plan/core-deal-facts.js";

export function ensureConversation(state: DraftState): DraftState {
  if (state.conversation) return state;
  const documentId = state.request?.payloadFields?.documentId ?? `doc_${crypto.randomUUID()}`;
  return {
    ...state,
    conversation: createEmptyConversation(documentId, state.organizationId ?? ""),
  };
}

export function appendConversationTurns(
  state: DraftState,
  turns: Array<{
    role: ConversationRole;
    content: string;
    documentVersion?: number;
    relatedSectionIds?: string[];
  }>
): DraftState {
  const base = ensureConversation(state);
  const nextTurns: ConversationTurn[] = turns.map((t) => ({
    id: `turn_${crypto.randomUUID()}`,
    role: t.role,
    content: t.content,
    documentVersion: t.documentVersion,
    relatedSectionIds: t.relatedSectionIds,
    createdAt: new Date().toISOString(),
  }));

  const conversation: DraftConversation = {
    ...base.conversation!,
    turns: [...base.conversation!.turns, ...nextTurns],
  };

  return { ...base, conversation };
}

/** Map ASK answer keys (question id or field) onto structuredFacts field names. */
function answersToFactPatch(
  state: DraftState,
  answers: Record<string, string>
): Record<string, string> {
  const open = state.agent?.openQuestions ?? [];
  const byId = new Map(open.map((q) => [q.id, q.field]));
  const patch: Record<string, string> = {};

  for (const [key, raw] of Object.entries(answers)) {
    const value = String(raw ?? "").trim();
    if (!value) continue;

    const fromOpen = byId.get(key);
    if (fromOpen) {
      patch[canonicalizeFieldId(fromOpen)] = value;
      continue;
    }

    // q-<field>-<index> from ask-user.ts
    const match = /^q-(.+)-(\d+)$/.exec(key);
    if (match) {
      patch[canonicalizeFieldId(match[1])] = value;
      continue;
    }

    patch[canonicalizeFieldId(key)] = value;
  }

  return patch;
}

/** Resume ASK: merge user answers into structuredFacts and conversation, clear open questions. */
export function applyUserAnswers(
  state: DraftState,
  answers: Record<string, string>
): DraftState {
  const factsPatch = answersToFactPatch(state, answers);
  const answeredFields = new Set(Object.keys(factsPatch));

  let next = appendConversationTurns(state, [
    {
      role: "user",
      content: Object.entries(factsPatch)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    },
  ]);

  const fid = factsPatch.dataFiduciaryLegalName || factsPatch.dataFiduciary;
  const proc = factsPatch.dataProcessorLegalName || factsPatch.dataProcessor;
  if (fid && proc) {
    factsPatch.partyA = fid;
    factsPatch.partyB = proc;
    factsPatch.parties = `${fid}, ${proc}`;
  } else if (fid && !factsPatch.partyA) {
    factsPatch.partyA = fid;
  } else if (proc && !factsPatch.partyB) {
    factsPatch.partyB = proc;
  }

  if (factsPatch.parties && (!factsPatch.partyA || !factsPatch.partyB)) {
    const parsed = parsePartyPairFromText(String(factsPatch.parties));
    if (parsed?.partyA && !factsPatch.partyA) factsPatch.partyA = parsed.partyA;
    if (parsed?.partyB && !factsPatch.partyB) factsPatch.partyB = parsed.partyB;
  }

  if (factsPatch.partyA && factsPatch.partyB && !factsPatch.parties) {
    factsPatch.parties = `${factsPatch.partyA}, ${factsPatch.partyB}`;
  }

  if (factsPatch.governingLaw && !factsPatch.jurisdiction) {
    factsPatch.jurisdiction = factsPatch.governingLaw;
  } else if (factsPatch.jurisdiction && !factsPatch.governingLaw) {
    factsPatch.governingLaw = factsPatch.jurisdiction;
  }

  if (factsPatch.privacyRegime) {
    if (!factsPatch.governingLaw) factsPatch.governingLaw = factsPatch.privacyRegime;
    if (!factsPatch.jurisdiction) factsPatch.jurisdiction = factsPatch.privacyRegime;
  } else if (factsPatch.governingLaw) {
    const gl = String(factsPatch.governingLaw).toLowerCase();
    if (gl.includes("gdpr") || gl.includes("ccpa") || gl.includes("dpdpa") || gl.includes("cpra")) {
      if (!factsPatch.privacyRegime) factsPatch.privacyRegime = factsPatch.governingLaw;
    }
  }

  // Address and details extraction
  for (const [k, v] of Object.entries(factsPatch)) {
    const keyLower = k.toLowerCase();
    const strVal = typeof v === "string" ? v : "";
    if (
      strVal &&
      (keyLower.includes("client") ||
        keyLower.includes("partya") ||
        keyLower.includes("firstparty") ||
        keyLower.includes("disclosing") ||
        keyLower.includes("fiduciary"))
    ) {
      const parsed = parseAddressFromText(strVal);
      if (parsed.address && !factsPatch.partyAAddress) factsPatch.partyAAddress = parsed.address;
      if (parsed.name && !factsPatch.partyA) factsPatch.partyA = parsed.name;
    }
    if (
      strVal &&
      (keyLower.includes("contractor") ||
        keyLower.includes("partyb") ||
        keyLower.includes("secondparty") ||
        keyLower.includes("receiving") ||
        keyLower.includes("processor"))
    ) {
      const parsed = parseAddressFromText(strVal);
      if (parsed.address && !factsPatch.partyBAddress) factsPatch.partyBAddress = parsed.address;
      if (parsed.name && !factsPatch.partyB) factsPatch.partyB = parsed.name;
    }
  }

  // Signatories extraction
  if (factsPatch.signatories || factsPatch.signers || factsPatch.authorizedsignatories) {
    const rawSigners = String(
      factsPatch.signatories || factsPatch.signers || factsPatch.authorizedsignatories
    );
    const parsedSig = parseSignatoriesFromText(rawSigners);
    if (parsedSig.partyA?.name && !factsPatch.partyASignerName) factsPatch.partyASignerName = parsedSig.partyA.name;
    if (parsedSig.partyA?.title && !factsPatch.partyASignerTitle) factsPatch.partyASignerTitle = parsedSig.partyA.title;
    if (parsedSig.partyA?.place && !factsPatch.partyAPlace) factsPatch.partyAPlace = parsedSig.partyA.place;
    if (parsedSig.partyA?.date && !factsPatch.partyADate) factsPatch.partyADate = parsedSig.partyA.date;

    if (parsedSig.partyB?.name && !factsPatch.partyBSignerName) factsPatch.partyBSignerName = parsedSig.partyB.name;
    if (parsedSig.partyB?.title && !factsPatch.partyBSignerTitle) factsPatch.partyBSignerTitle = parsedSig.partyB.title;
    if (parsedSig.partyB?.place && !factsPatch.partyBPlace) factsPatch.partyBPlace = parsedSig.partyB.place;
    if (parsedSig.partyB?.date && !factsPatch.partyBDate) factsPatch.partyBDate = parsedSig.partyB.date;
  }

  // Post-termination confidentiality survival duration
  if (!factsPatch.confidentialityTermYears) {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === "string") {
        const term = parseConfidentialityTermFromText(v);
        if (term) {
          factsPatch.confidentialityTermYears = term;
          break;
        }
      }
    }
  }

  const parsedPartyList =
    factsPatch.partyA && factsPatch.partyB
      ? [factsPatch.partyA, factsPatch.partyB]
      : factsPatch.parties
      ? String(factsPatch.parties)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : undefined;

  next = {
    ...next,
    structuredFacts: {
      ...(next.structuredFacts ?? {}),
      ...factsPatch,
    },
    requirements: next.requirements
      ? {
          ...next.requirements,
          ...(factsPatch.governingLaw
            ? { jurisdiction: factsPatch.governingLaw }
            : {}),
          ...(factsPatch.documentType
            ? { contractType: factsPatch.documentType }
            : {}),
          ...(parsedPartyList ? { parties: parsedPartyList } : {}),
        }
      : next.requirements,
    // Keep missingFacts cleared for answered fields so PLAN→ASK does not re-block.
    plan: next.plan
      ? {
          ...next.plan,
          missingFacts: (next.plan.missingFacts ?? []).filter(
            (f) => !answeredFields.has(canonicalizeFieldId(f.field))
          ),
          structuredFacts: {
            ...(next.plan.structuredFacts ?? {}),
            ...factsPatch,
          },
        }
      : next.plan,
    agent: next.agent
      ? {
          ...next.agent,
          openQuestions: [],
          stoppedReason: undefined,
          phase: "PLAN",
          askedFieldIds: [
            ...new Set([
              ...(next.agent.askedFieldIds ?? []),
              ...answeredFields,
            ]),
          ],
        }
      : next.agent,
  };

  // Mark canonical requirements satisfied so a later PLAN rebuild does not re-ask.
  next = markRequirementsAnswered(next, factsPatch);

  return next;
}
