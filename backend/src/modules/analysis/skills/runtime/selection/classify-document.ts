import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import { listDocTypeClassifiers } from "../catalog/registry.js";

export type DocumentTypeId =
  | "dpa"
  | "nda"
  | "msa"
  | "sla"
  | "saas-agreement"
  | "service-agreement"
  | "employment-agreement"
  | "vendor-agreement"
  | "ai-vendor-agreement"
  | "shareholder-agreement"
  | "commercial-agreement"
  | "unknown";

/** Deterministic doc-type classification from plain text (no LLM). */
export function classifyDocumentFromText(fullText: string): DocumentTypeId {
  const sample = fullText.slice(0, 6000).toLowerCase();
  const classifiers = listDocTypeClassifiers().sort((a, b) => b.priority - a.priority);

  for (const classifier of classifiers) {
    for (const pattern of classifier.patterns) {
      if (new RegExp(pattern, "i").test(sample)) {
        return classifier.docTypeId as DocumentTypeId;
      }
    }
  }

  return "unknown";
}

export async function classifyDocument(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): Promise<AnalysisState> {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) return state;

  const docType = classifyDocumentFromText(doc.fullText);
  const documents = state.workspace.documents.map((d) =>
    d.docId === docId ? { ...d, docType, role: "primary" as const } : d
  );
  return { ...state, workspace: { ...state.workspace, documents } };
}
