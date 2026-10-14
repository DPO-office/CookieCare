import type { AnalysisState } from "../../models/analysis-state.js";
import type { MissingClarification } from "../../models/analysis-plan.js";

export type ResolvedDocRoles = {
  targetDocId: string;
  referenceDocId?: string;
  /** All analysis targets (excludes the playbook/reference). */
  targetDocIds: string[];
  roles: Record<string, "target" | "reference">;
  missing?: MissingClarification;
};

const NORMATIVE_RE =
  /\b(must|shall|should|preferred|prohibit|required|requirement|never accept|always require)\b/i;
const SIGNATURE_RE =
  /\b(in witness whereof|signed by|signature|executed as of|counterpart)\b/i;
const BILATERAL_RE =
  /\b(party|parties|agreement|hereby agrees|between .+ and)\b/i;

/**
 * Resolve target vs reference (playbook) document roles.
 * Explicit request.documentRoles wins; else heuristic; else ASK when ambiguous.
 */
export function resolveDocumentRoles(state: AnalysisState): ResolvedDocRoles {
  const docIds = state.request.documentIds;
  const texts = state.request.documentTexts ?? {};
  const explicit = state.request.documentRoles ?? {};
  const titles = state.request.documentTitles ?? {};
  const perDocumentRoles = (ids: string[]) =>
    ids.map((id) => ({ docId: id, title: titles[id] || id }));

  if (docIds.length === 0) {
    return {
      targetDocId: "",
      targetDocIds: [],
      roles: {},
      missing: {
        field: "documentIds",
        question: "Which document should be analyzed?",
        severity: "critical",
      },
    };
  }

  const roles: Record<string, "target" | "reference"> = { ...explicit };

  // A lone upload is always the target — there is nothing to compare it
  // against, so it must never be heuristically classified as "reference"
  // even if its language happens to score as normative/playbook-like.
  if (docIds.length === 1) {
    roles[docIds[0]] = roles[docIds[0]] === "reference" ? roles[docIds[0]] : "target";
    return { targetDocId: docIds[0], targetDocIds: [docIds[0]], roles };
  }

  const std = state.intent?.standard;
  if (typeof std === "string" && std.startsWith("reference_document:")) {
    const refId = std.slice("reference_document:".length);
    if (docIds.includes(refId)) {
      roles[refId] = "reference";
    }
  }

  for (const id of docIds) {
    if (roles[id]) continue;
    const text = texts[id] ?? "";
    const score = heuristicScore(text);
    if (score === "reference" || score === "target") {
      roles[id] = score;
    }
  }

  const references = docIds.filter((id) => roles[id] === "reference");
  const targets = docIds.filter((id) => roles[id] === "target");
  const unset = docIds.filter((id) => !roles[id]);

  if (references.length > 1) {
    return {
      targetDocId: targets[0] ?? docIds[0],
      targetDocIds: targets.length ? targets : [docIds[0]],
      roles,
      missing: {
        field: "documentRoles",
        question:
          "Multiple documents look like playbooks/references. Mark exactly one as the playbook (reference) and one as the target agreement.",
        severity: "critical",
        perDocumentRoles: perDocumentRoles(docIds),
      },
    };
  }

  if (references.length === 1 && targets.length === 0 && unset.length >= 1) {
    for (const id of unset) roles[id] = "target";
    const targetDocId = unset[0] ?? docIds.find((id) => id !== references[0])!;
    return {
      targetDocId,
      targetDocIds: docIds.filter((id) => roles[id] === "target"),
      referenceDocId: references[0],
      roles,
    };
  }

  if (references.length === 1 && targets.length >= 1) {
    return {
      targetDocId: targets[0],
      targetDocIds: targets,
      referenceDocId: references[0],
      roles,
    };
  }

  if (unset.length >= 2 || (unset.length === 1 && targets.length === 0 && references.length === 0)) {
    return {
      targetDocId: docIds[0],
      targetDocIds: docIds,
      roles,
      missing: {
        field: "documentRoles",
        question:
          "You uploaded multiple documents. Mark which is the target agreement and which (if any) is a playbook/reference to compare against.",
        severity: "critical",
        perDocumentRoles: perDocumentRoles(docIds),
      },
    };
  }

  if (targets.length >= 1) {
    return {
      targetDocId: targets[0],
      targetDocIds: targets,
      referenceDocId: references[0],
      roles,
    };
  }

  roles[docIds[0]] = "target";
  return { targetDocId: docIds[0], targetDocIds: [docIds[0]], roles };
}

function heuristicScore(text: string): "target" | "reference" | "ambiguous" {
  if (!text.trim()) return "ambiguous";
  const sample = text.slice(0, 12_000);
  const normative = NORMATIVE_RE.test(sample);
  const signature = SIGNATURE_RE.test(sample);
  const bilateral = BILATERAL_RE.test(sample);

  if (normative && !signature) return "reference";
  if (bilateral && signature) return "target";
  if (bilateral && !normative) return "target";
  if (normative && bilateral) return "ambiguous";
  return "ambiguous";
}
