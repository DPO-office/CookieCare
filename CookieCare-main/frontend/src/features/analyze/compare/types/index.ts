// ─── Compare Documents — Type Definitions ────────────────────────────────────

export interface CompareFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

export interface CompareDocumentsState {
  original: CompareFile | null;
  revised: CompareFile | null;
}

export type AgreementSlot = "original" | "revised";
