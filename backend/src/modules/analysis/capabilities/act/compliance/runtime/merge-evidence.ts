import { createHash } from "node:crypto";
import type { CoverageIssue, VerificationBundle } from "../contracts/index.js";

const issuesFor = (bundle: VerificationBundle): CoverageIssue[] => bundle.coverageIssues
  ?? bundle.coverageReasons.map(reason => ({ reason, elementIds: [], evidenceIds: [], materiality: "unknown" }));

/** Additional searches add evidence; they cannot silently discard previously located clauses. */
export function mergeEvidenceBundles(previous: VerificationBundle, next: VerificationBundle): VerificationBundle {
  if (previous.checkId !== next.checkId)
    throw new Error("additional_evidence_scope_mismatch");
  const passages = new Map(previous.passages.map(p => [p.evidenceId, p]));
  for (const p of next.passages)
    passages.set(p.evidenceId, p);
  const dependencies = new Map(previous.dependencies.map(d => [d.id, d]));
  for (const d of next.dependencies)
    dependencies.set(d.id, d);
  const locatedNodes = new Set([...passages.values()].map(p => p.nodeId));
  for (const [id, dependency] of dependencies) {
    // A known graph target previously absent from the bundle is now supplied.
    // Truly unresolved graph references have no identified target to resolve.
    if (dependency.state === "unresolved_internal" && dependency.targetNodeIds.length
      && dependency.targetNodeIds.every(nodeId => locatedNodes.has(nodeId))) {
      dependencies.set(id, { ...dependency, state: "resolved_internal" });
    }
  }
  const issues = new Map([...issuesFor(previous), ...issuesFor(next)]
    .map(issue => [JSON.stringify([issue.reason, [...issue.evidenceIds].sort()]), issue]));
  // A different search cannot silently clear an earlier omission. Only receipt
  // of every omitted passage clears that issue; historical uncertainty remains.
  const coverageIssues = [...issues.values()].filter(issue =>
    !issue.evidenceIds.length || !issue.evidenceIds.every(id => passages.has(id)));
  const { hash: _hash, ...content } = {
    ...next,
    passages: [...passages.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
    dependencies: [...dependencies.values()].sort((a, b) => a.id.localeCompare(b.id)),
    coverageIssues,
    coverageReasons: [...new Set([...previous.coverageReasons, ...next.coverageReasons])],
  };
  return { ...content, hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

/** Audit hashes include every change. Reverification excludes narrative-only churn. */
export function evidenceMateriallyChanged(previous: VerificationBundle, next: VerificationBundle): boolean {
  const project = (b: VerificationBundle) => ({
    checkId: b.checkId, documents: [...b.documentVersions].sort((a,b)=>a.documentId.localeCompare(b.documentId)),
    passages: [...b.passages].sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId)).map(({reason: _reason, confidence: _confidence, ...p}) => ({ ...p, contributesToElementIds: [...p.contributesToElementIds].sort() })),
    dependencies: [...b.dependencies].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>({...d,targetNodeIds:[...d.targetNodeIds].sort()})), executionStatus: b.executionStatus,
    coverageReasons: [...b.coverageReasons].sort(), coverageIssues: issuesFor(b).map(i=>({...i,elementIds:[...i.elementIds].sort(),evidenceIds:[...i.evidenceIds].sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    unestablishedElementIds: [...b.unestablishedElementIds].sort(),
  });
  return JSON.stringify(project(previous)) !== JSON.stringify(project(next));
}
