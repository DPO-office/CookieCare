export type EvidenceRole = "primary" | "supporting" | "dependency" | "definition" | "limitation" | "contradictory" | "context";
export interface EvidencePassage {
  evidenceId: string;
  nodeId: string;
  documentId: string;
  text: string;
  range: [
    number,
    number
  ];
  path: string;
  role: EvidenceRole;
  relationshipScope: string;
  contributesToElementIds: string[];
  reason: string;
  confidence: number;
}
export interface EvidenceDependency {
  id: string;
  edgeId?: string;
  referenceText?: string;
  referenceRange?: [number, number];
  targetMention?: string;
  sourceNodeId: string;
  targetNodeIds: string[];
  state: string;
  effect: string;
}
/** A search can finish while leaving material evidence unavailable. Empty elementIds means whole-check scope. */
export interface CoverageIssue {
  reason: string;
  elementIds: string[];
  evidenceIds: string[];
  materiality: "material" | "immaterial" | "unknown";
}
export interface VerificationBundle {
  documentVersions: Array<{
    documentId: string;
    hash: string;
  }>;
  bundleId: string;
  hash: string;
  checkId: string;
  passages: EvidencePassage[];
  dependencies: EvidenceDependency[];
  executionStatus: "complete" | "incomplete" | "unknown";
  coverageReasons: string[];
  coverageIssues?: CoverageIssue[];
  investigationWarnings: string[];
  unestablishedElementIds: string[];
}
export interface VerifiedCitation {
  evidenceId: string;
  documentId: string;
  nodeId: string;
  quote: string;
  range: [
    number,
    number
  ];
  path: string;
  originalRole: EvidenceRole;
  use: "proof" | "related" | "conflict";
  explanation: string;
}
