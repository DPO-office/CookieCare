import type { Locator } from "./locator.js";
import type { ClauseObject } from "./clause-object.js";
import type { PlaybookPosition } from "./rule-source.js";

export type DocumentRole =
  | "primary"
  | "target"
  | "reference"
  | "prior_version"
  | "comparison_target"
  | "unknown";

export interface DocumentSegment {
  locator: Locator;
  text: string;
  kind: "heading" | "clause" | "paragraph" | "schedule";
}

export interface SegmentedDocument {
  docId: string;
  title?: string;
  role: DocumentRole;
  docType?: string;
  fullText: string;
  segments: DocumentSegment[];
  clauses: ClauseObject[];
  /** Cached playbook positions when role is reference. */
  playbookPositions?: PlaybookPosition[];
}

export interface AnalysisWorkspace {
  sessionId: string;
  documents: SegmentedDocument[];
}
