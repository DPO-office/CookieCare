import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";

export type DocumentTypeId =
  | "dpa"
  | "nda"
  | "msa"
  | "sla"
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

  if (/\bdata processing agreement\b|\barticle 28\b|\bprocessor\b.*\bcontroller\b|\bdpa\b/.test(sample))
    return "dpa";
  if (/\bnon-?disclosure\b|\bnda\b|\bconfidential information\b/.test(sample)) return "nda";
  if (/\bmaster service(s)? agreement\b|\bmsa\b/.test(sample)) return "msa";
  if (/\bservice level agreement\b|\bsla\b|\buat\b.*\bservice credit/.test(sample)) return "sla";
  if (/\bemployment agreement\b|\bemployee\b.*\bemployer\b|\bnon-compete\b/.test(sample))
    return "employment-agreement";
  if (/\bvendor agreement\b|\bsupplier agreement\b|\bthird.?party risk/.test(sample))
    return "vendor-agreement";
  if (/\bai system\b|\bartificial intelligence\b|\bautomated decision/.test(sample))
    return "ai-vendor-agreement";
  if (/\bshareholder\b|\bshareholders agreement\b|\bstockholder/.test(sample))
    return "shareholder-agreement";
  if (/\bagreement\b|\bcontract\b/.test(sample)) return "commercial-agreement";
  if (/\bservice agreement\b/.test(sample)) return "service-agreement";

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
