import { LegalDocument } from "../../shared/types";

export interface DraftAgreementProps {
  documents: LegalDocument[];
  authToken: string;
  onRefresh: () => void;
  onSelectDocument: (doc: LegalDocument | null) => void;
  initialDocumentId?: string;
}

export type DraftMode = "Basic" | "Advanced";
export type DraftDepth = "Short" | "Standard" | "Deep";
export type AdvancedStep = "selector" | "proactive" | "reactive";
export type ClauseTab = "clauses" | "custom";

export interface AdvancedField {
  id: string;
  name: string;
  defaultValue: string;
  description: string;
}

export interface TemplateFolder {
  name: string;
  count: number;
  items: string[];
}

export interface ClauseCategory {
  name: string;
  count: number;
  items: string[];
}
