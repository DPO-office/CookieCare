import { LegalDocument } from "../../shared/types";

export interface FileContext {
  id: string;
  name: string;
  type: string;
  size: string;
  // content is intentionally absent — document content stays on the backend.
  // The backend retrieves it by document ID via RAG / DB lookup.
}

export interface KBFolder {
  id: string;
  name: string;
  isSelected: boolean;
  files: FileContext[];
}

export interface Source {
  id: string;
  title: string;
  citation: string;
  jurisdiction: string;
  documentType: string;
  officialCopy: string;
}

export interface AskAILawyerProps {
  authToken: string;
  documents?: LegalDocument[];
}

export type PopoverType = "add" | "kb" | "web" | "jurisdictions" | "format" | null;

export type OutputFormat = "Brief Summary" | "Full IRAC" | "CREAC";

export type StepperPhase =
  | "idle"
  | "division"
  | "sourcing"
  | "extracting"
  | "streaming"
  | "completed";
