import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  benchmarkDocumentGraph,
  buildDocumentGraph,
  type GoldDocumentGraph,
} from "../src/modules/analysis/capabilities/ingest/document-structure/index.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

function usage(): never {
  console.error("Usage: npm run audit:document-structure -- [--gold gold.json] <document-or-directory> [...]");
  process.exit(1);
}

function inputFiles(inputs: string[]): string[] {
  const files: string[] = [];
  for (const input of inputs) {
    const absolute = path.resolve(input);
    if (!fs.existsSync(absolute)) throw new Error(`Input does not exist: ${absolute}`);
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      files.push(absolute);
      continue;
    }
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const extension = path.extname(entry.name).toLowerCase();
      if (entry.isFile() && MIME_BY_EXTENSION[extension]) files.push(path.join(absolute, entry.name));
    }
  }
  return [...new Set(files)].sort();
}

function argumentsFrom(argv: string[]): { inputs: string[]; goldPath?: string } {
  const inputs: string[] = [];
  let goldPath: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--gold") {
      goldPath = argv[++index];
      if (!goldPath) usage();
    } else {
      inputs.push(argv[index]);
    }
  }
  if (!inputs.length) usage();
  return { inputs, goldPath };
}

const options = argumentsFrom(process.argv.slice(2));
const goldByFile = options.goldPath
  ? JSON.parse(fs.readFileSync(path.resolve(options.goldPath), "utf8")) as Record<string, GoldDocumentGraph>
  : undefined;

const results = [];
for (const filePath of inputFiles(options.inputs)) {
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const fingerprint = crypto.createHash("sha256").update(buffer).digest("hex");
  const graph = await buildDocumentGraph({
    artifactId: `audit_${fingerprint.slice(0, 24)}`,
    fileId: `audit_file_${fingerprint.slice(0, 24)}`,
    documentVersionId: `audit_version_${fingerprint.slice(0, 24)}`,
    fileName,
    mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
    buffer,
    enableLlmRelations: false,
    enableLlmAdjudication: false,
  });
  const gold = goldByFile?.[fileName];
  results.push({
    file: fileName,
    sourceSha256: graph.sourceSha256,
    parser: graph.parser,
    identity: graph.identity,
    counts: {
      nodes: graph.nodes.length,
      structuralEdges: graph.structuralEdges.length,
      definitions: graph.definitions.length,
      relations: graph.relationEdges.length,
      resolved: graph.relationEdges.filter((edge) => edge.status === "resolved").length,
      ambiguous: graph.relationEdges.filter((edge) => edge.status === "ambiguous").length,
      unresolved: graph.relationEdges.filter((edge) => edge.status === "unresolved_internal").length,
      external: graph.relationEdges.filter((edge) => edge.status === "external").length,
      unresolvedTargets: graph.unresolvedTargets.length,
    },
    quality: graph.quality,
    warningCodes: [...new Set(graph.warnings.map((warning) => warning.code))],
    benchmark: gold ? benchmarkDocumentGraph(graph, gold) : undefined,
  });
}

console.log(JSON.stringify({ schema: "document-structure-audit/v1", results }, null, 2));
