import type { Locator } from "./locator.js";
import type { ClauseObject } from "./clause-object.js";

export interface DocumentSegment {
  locator: Locator;
  text: string;
  kind: "heading" | "clause" | "paragraph" | "schedule";
}

export interface SegmentedDocument {
  docId: string;
  title?: string;
  role: "primary" | "reference" | "prior_version" | "comparison_target" | "unknown";
  docType?: string;
  fullText: string;
  segments: DocumentSegment[];
  clauses: ClauseObject[];
}

export interface AnalysisWorkspace {
  sessionId: string;
  documents: SegmentedDocument[];
}
