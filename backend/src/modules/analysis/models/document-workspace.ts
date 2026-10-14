import type { Locator } from "./locator.js";
import type { ClauseObject } from "./clause-object.js";
import type { PlaybookPosition } from "./rule-source.js";
import type { CanonicalDocumentGraph } from "../capabilities/ingest/document-structure/types.js";

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
  /** Stable source node in the upload-time canonical document graph. */
  structuralNodeId?: string;
}

export interface SegmentedDocument {
  docId: string;
  title?: string;
  role: DocumentRole;
  docType?: string;
  fullText: string;
  segments: DocumentSegment[];
  clauses: ClauseObject[];
  /** Versioned upload-time structure; PLAN/ACT consume projections from this artifact. */
  structureGraph?: CanonicalDocumentGraph;
  /** Cached playbook positions when role is reference. */
  playbookPositions?: PlaybookPosition[];
}

export interface AnalysisWorkspace {
  sessionId: string;
  documents: SegmentedDocument[];
}
