import fs from "node:fs";
import path from "node:path";
import { dumpStructureTreeFromAnalysis } from "./dump-structure-tree.js";

const misplaced = path.resolve(
  process.cwd(),
  "out/doc_754b36ad-91cd-4042-8ffe-6bff8722b518.json"
);
const raw = JSON.parse(fs.readFileSync(misplaced, "utf8"));
const out = dumpStructureTreeFromAnalysis({
  sessionId: raw.sessionId,
  docs: [
    {
      documentId: raw.documentId,
      sourceFile: raw.sourceFile,
      fullText: raw.fullText || "",
      nodes: raw.nodes,
      definitions: raw.definitions || [],
      references: raw.references || [],
      legacySegmentCount: raw.legacySegmentCount || 0,
    },
  ],
});
console.log(
  JSON.stringify({
    out,
    nodes: raw.nodes.length,
    clauses: raw.nodes.filter((n: { kind: string }) => n.kind === "clause").length,
    sourceFile: raw.sourceFile,
  })
);
