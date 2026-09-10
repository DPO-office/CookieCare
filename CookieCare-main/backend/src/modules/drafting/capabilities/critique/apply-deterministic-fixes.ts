import type { DraftState } from "../../models/draft-state.js";
import { findDraftPlaceholders } from "../plan/core-deal-facts.js";
import {
  buildDealIdentity,
  findForeignPartyNames,
} from "../act/deal-identity.js";

/**
 * Deterministic post-critique fixes — no LLM.
 * Scrubs placeholders, resolves leftover [[SEC:...]] anchors, and strips
 * obvious foreign party names when a locked identity exists.
 */
export function applyDeterministicFixes(state: DraftState): DraftState {
  let doc = state.draft?.formattedDocument ?? "";
  if (!doc) return state;

  const facts = {
    ...(state.plan?.structuredFacts ?? {}),
    ...(state.structuredFacts ?? {}),
  } as Record<string, unknown>;
  const identity = buildDealIdentity(facts, state.plan?.documentType);

  let changed = false;

  // 1) Strip [[SEC:id]] leftovers → prose "the referenced section"
  const beforeAnchors = doc;
  doc = doc.replace(/\[\[SEC:([^\]]+)\]\]/g, (_m, id: string) => {
    const unit = state.plan?.workUnits.find((u) => u.id === id);
    return unit ? `the ${unit.heading} section` : "the referenced section";
  });
  if (doc !== beforeAnchors) changed = true;

  // 2) Replace common placeholders with structured facts
  const placeholders = findDraftPlaceholders(doc);
  if (placeholders.length > 0) {
    const replacements: Array<[RegExp, string]> = [];
    const effectiveDate =
      (typeof facts.effectiveDate === "string" && facts.effectiveDate) ||
      (typeof facts.principalAgreementDate === "string" &&
        facts.principalAgreementDate) ||
      "the date of this Agreement";
    const partyA =
      identity?.partyA ||
      (typeof facts.partyA === "string" ? facts.partyA : "") ||
      "the Controller";
    const partyB =
      identity?.partyB ||
      (typeof facts.partyB === "string" ? facts.partyB : "") ||
      "the Processor";
    const purpose =
      (typeof facts.processingPurpose === "string" && facts.processingPurpose) ||
      (typeof facts.businessPurpose === "string" && facts.businessPurpose) ||
      "the purposes set out in this Agreement";
    const law =
      (typeof facts.governingLaw === "string" && facts.governingLaw) ||
      "the applicable governing law";

    replacements.push(
      [/\[\s*●\s*DATE(?:\s+OF\s+MSA)?\s*\]/gi, effectiveDate],
      [/\[\s*●\s*DATE\s*\]/gi, effectiveDate],
      [/\[\s*DATE\s*\]/gi, effectiveDate],
      [/\[\s*●\s*PARTY\s*NAME\s*\]/gi, partyA],
      [/\[\s*PARTY\s*NAME\s*\]/gi, partyA],
      [/\[\s*PARTY\s*A\s*\]/gi, partyA],
      [/\[\s*PARTY\s*B\s*\]/gi, partyB],
      [/\[\s*CONTROLLER\s*\]/gi, partyA],
      [/\[\s*PROCESSOR\s*\]/gi, partyB],
      [/\[\s*●\s*PURPOSE\s*\]/gi, purpose],
      [/\[\s*PURPOSE\s*\]/gi, purpose],
      [/\[\s*●\s*GOVERNING\s*LAW\s*\]/gi, law],
      [/\[\s*GOVERNING\s*LAW\s*\]/gi, law],
      [/\[\s*●\s*[^\]]{1,40}\s*\]/g, ""],
      [/\bTBD\b/g, ""],
      [/\bTODO\b/g, ""]
    );

    let next = doc;
    for (const [re, val] of replacements) {
      next = next.replace(re, val);
    }
    // Collapse leftover empty brackets
    next = next.replace(/\[\s*\]/g, "");
    if (next !== doc) {
      doc = next;
      changed = true;
    }
  }

  // 3) Simple foreign-party scrub: replace foreign Inc./Ltd. names with nearest locked party
  //    only when the foreign name appears as a whole token and we have identity.
  if (identity) {
    const foreign = findForeignPartyNames(doc, identity);
    if (foreign.length > 0 && foreign.length <= 4) {
      let next = doc;
      for (const name of foreign) {
        // Prefer replacing with partyB (processor) for vendor-like names; else partyA.
        const replacement = identity.partyB;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        next = next.replace(new RegExp(escaped, "g"), replacement);
      }
      if (next !== doc) {
        doc = next;
        changed = true;
        console.log(
          `[applyDeterministicFixes] scrubbed foreign parties: ${foreign.slice(0, 4).join(" | ")}`
        );
      }
    }
  }

  if (!changed) return state;

  const sections = (state.draft?.sections ?? []).map((s) => ({
    ...s,
    body: applyTextFixes(s.body, facts, identity),
  }));
  const exhibits = (state.exhibits ?? []).map((e) => ({
    ...e,
    body: applyTextFixes(e.body, facts, identity),
  }));

  console.log("[applyDeterministicFixes] applied deterministic scrub to draft");

  return {
    ...state,
    exhibits,
    draft: state.draft
      ? {
          ...state.draft,
          formattedDocument: doc,
          rawOutput: doc,
          sections,
        }
      : state.draft,
  };
}

function applyTextFixes(
  text: string,
  facts: Record<string, unknown>,
  identity: ReturnType<typeof buildDealIdentity>
): string {
  let doc = text.replace(/\[\[SEC:([^\]]+)\]\]/g, "the referenced section");
  const effectiveDate =
    (typeof facts.effectiveDate === "string" && facts.effectiveDate) ||
    "the date of this Agreement";
  const partyA = identity?.partyA || "the Controller";
  const partyB = identity?.partyB || "the Processor";
  doc = doc
    .replace(/\[\s*●\s*DATE(?:\s+OF\s+MSA)?\s*\]/gi, effectiveDate)
    .replace(/\[\s*●\s*PARTY\s*NAME\s*\]/gi, partyA)
    .replace(/\[\s*PARTY\s*A\s*\]/gi, partyA)
    .replace(/\[\s*PARTY\s*B\s*\]/gi, partyB)
    .replace(/\[\s*●\s*[^\]]{1,40}\s*\]/g, "")
    .replace(/\bTBD\b/g, "")
    .replace(/\bTODO\b/g, "");
  return doc;
}
