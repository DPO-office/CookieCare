export type ScanDepth = "Lite" | "Medium" | "Deep" | "Enterprise";

export interface ScanFormState {
  url: string;
  scanDepth: ScanDepth;
}
