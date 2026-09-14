import assert from "node:assert/strict";
import test from "node:test";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { buildDocumentGraph } from "../build-document-graph.js";
import { benchmarkDocumentGraph } from "../benchmark.js";

const TEXT = [
  "1. Purpose",
  "2. Processing",
  "2.1 Instructions",
  "2.1.1 The remaining processing details are set out in Appendix 1.",
  "Appendix 2 to this DPA describes a separate control.",
  "6. Security",
  "7. Incidents",
  "8. Assistance",
  "9. Audit",
  "10. Deletion",
  "11. General",
  "11.4 This provision remains effective.",
  "12. Liability",
  "13. Term",
  "Appendix 1",
  "A. Processing subject matter",
].join("\n");

async function pdfBuffer(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({ autoFirstPage: true, size: "A4" });
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    for (const line of lines) pdf.text(line);
    pdf.end();
  });
}

test("builds legal numbering independently from reference edges", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-1",
    fileId: "doc-1",
    documentVersionId: "version-1",
    fileName: "dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(TEXT),
    enableLlmRelations: false,
  });

  const root = graph.nodes.find((node) => node.kind === "document")!;
  const appendix = graph.nodes.find((node) => node.kind === "appendix" && node.displayLabel === "1")!;
  const clause11 = graph.nodes.find((node) => node.displayLabel === "11")!;
  const clause114 = graph.nodes.find((node) => node.displayLabel === "11.4")!;
  const clause13 = graph.nodes.find((node) => node.displayLabel === "13")!;

  assert.equal(clause114.parentId, clause11.nodeId);
  assert.equal(clause13.parentId, root.nodeId);
  assert.equal(appendix.parentId, root.nodeId);
  assert.equal(graph.nodes.some((node) => node.kind === "appendix" && node.text.startsWith("Appendix 2 to this DPA")), false);

  const edge = graph.relationEdges.find((candidate) => candidate.targetMention.toLowerCase() === "appendix 1");
  assert.ok(edge);
  assert.equal(edge?.targetNodeId, appendix.nodeId);
  assert.equal(edge?.semanticEffect, "details_provided_by");
  assert.equal(edge?.status, "resolved");
  assert.equal(graph.canonicalText.slice(edge!.evidenceRange[0], edge!.evidenceRange[1]), edge!.evidenceText);
  assert.equal(graph.quality.status, "needs_review");
  assert.equal(graph.quality.analysisMode, "degraded");
});

test("accepts grounded LLM-only relations and rejects invented evidence", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-2",
    fileId: "doc-2",
    documentVersionId: "version-2",
    fileName: "contract.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("6. Incident response\n7. These duties continue following termination."),
    enableLlmRelations: true,
  }, {
    discoverRelations: async (skeleton) => {
      const source = skeleton.nodes.find((node) => node.displayLabel === "7")!;
      return [
        { sourceNodeId: source.nodeId, targetMention: "clause 6", semanticEffect: "survives",
          evidenceText: "These duties continue following termination.", explicit: false },
        { sourceNodeId: source.nodeId, targetMention: "clause 6", semanticEffect: "overrides",
          evidenceText: "invented language", explicit: false },
      ];
    },
  });

  assert.equal(graph.relationEdges.filter((edge) => edge.detectedBy.includes("llm_discovery")).length, 1);
  assert.ok(graph.warnings.some((warning) => warning.code === "llm_relation_evidence_not_grounded"));
});

test("keeps missing internal references unresolved", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-3",
    fileId: "doc-3",
    documentVersionId: "version-3",
    fileName: "dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("12.3 The details appear in Schedule 11.3.4."),
    enableLlmRelations: false,
  });
  const edge = graph.relationEdges.find((candidate) => candidate.targetMention.toLowerCase() === "schedule 11.3.4");
  assert.equal(edge?.status, "unresolved_internal");
  assert.equal(edge?.targetNodeId, undefined);
});

test("resolves a qualified duplicate clause inside the named schedule namespace", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-qualified",
    fileId: "doc-qualified",
    documentVersionId: "version-qualified",
    fileName: "dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "5. Main agreement clause",
      "6. This obligation is subject to Clause 5 of Schedule 2.",
      "Schedule 2",
      "5. SCC clause",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const mainClause = graph.nodes.find((node) => node.namespace === "main" && node.displayLabel === "5")!;
  const scheduleClause = graph.nodes.find((node) => node.namespace === "schedule:2" && node.displayLabel === "5")!;
  const edge = graph.relationEdges.find((candidate) => candidate.targetMention.toLowerCase() === "clause 5 of schedule 2")!;
  assert.notEqual(mainClause.nodeId, scheduleClause.nodeId);
  assert.equal(edge.status, "resolved");
  assert.equal(edge.targetNodeId, scheduleClause.nodeId);
  assert.equal(edge.semanticEffect, "subject_to");
});

test("automatically accepts only a grounded high-confidence candidate adjudication", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-adjudication",
    fileId: "doc-adjudication",
    documentVersionId: "version-adjudication",
    fileName: "dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "6. This obligation is subject to Clause 5 of Schedule 2.",
      "Schedule 2",
      "5. Schedule provision",
      "STANDARD CONTRACTUAL CLAUSES",
      "Clause 5 SCC processor provision",
    ].join("\n")),
    enableLlmRelations: false,
    enableLlmAdjudication: true,
  }, {
    adjudicateRelations: async (candidateGraph) => {
      const edge = candidateGraph.relationEdges.find((item) => item.status === "ambiguous")!;
      const target = candidateGraph.nodes.find((node) => node.namespace === "schedule:2/scc" && node.displayLabel === "5")!;
      return [{
        edgeId: edge.edgeId,
        outcome: "select_candidate",
        targetNodeId: target.nodeId,
        semanticEffect: "subject_to",
        evidenceText: edge.evidenceText,
        confidence: "high",
      }];
    },
  });
  const edge = graph.relationEdges.find((item) => item.reason === "llm_adjudicated_from_bounded_candidates")!;
  assert.equal(edge.status, "resolved");
  assert.equal(graph.nodes.find((node) => node.nodeId === edge.targetNodeId)?.namespace, "schedule:2/scc");
  assert.ok(edge.verifiedBy.includes("llm_adjudicator"));
  assert.equal(graph.quality.automatedReview.resolvedRelations, 1);
});

test("resolves repeated defined terms to the nearest structural scope", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-definitions",
    fileId: "doc-definitions",
    documentVersionId: "version-definitions",
    fileName: "dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      '"Data" means information in the main agreement.',
      "1. Data must remain confidential.",
      "Schedule 1",
      '"Data" means information listed in this schedule.',
      "1. Data must be deleted.",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const mainDefinition = graph.nodes.find((node) => node.kind === "definition" && node.namespace === "main")!;
  const scheduleDefinition = graph.nodes.find((node) => node.kind === "definition" && node.namespace === "schedule:1")!;
  const mainUse = graph.nodes.find((node) => node.kind === "clause" && node.displayLabel === "1" && node.namespace === "main")!;
  const scheduleUse = graph.nodes.find((node) => node.kind === "clause" && node.displayLabel === "1" && node.namespace === "schedule:1")!;
  const mainEdge = graph.relationEdges.find((edge) => edge.sourceNodeId === mainUse.nodeId && edge.semanticEffect === "defined_by")!;
  const scheduleEdge = graph.relationEdges.find((edge) => edge.sourceNodeId === scheduleUse.nodeId && edge.semanticEffect === "defined_by")!;
  assert.equal(mainEdge.targetNodeId, mainDefinition.nodeId);
  assert.equal(scheduleEdge.targetNodeId, scheduleDefinition.nodeId);
});

test("uses Docling JSON rather than plaintext flattening for DOCX", async () => {
  const buffer = await Packer.toBuffer(new Document({
    sections: [{ children: [
      new Paragraph({ text: "2 Processing", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "2.1 Instructions", heading: HeadingLevel.HEADING_2 }),
      new Paragraph("The details are set out in Appendix 1."),
      new Paragraph({ text: "Appendix 1", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Processing details"),
    ] }],
  }));
  const graph = await buildDocumentGraph({
    artifactId: "artifact-docx",
    fileId: "doc-docx",
    documentVersionId: "version-docx",
    fileName: "dpa.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
    enableLlmRelations: false,
  });
  assert.equal(graph.parser.name, "docling.rs");
  assert.ok(graph.nodes.some((node) => node.displayLabel === "2.1"));
  assert.ok(graph.nodes.some((node) => node.kind === "appendix" && node.displayLabel === "1"));
});

test("promotes numbered definitions and rejects stopword false positives", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-numbered-definitions",
    fileId: "doc-numbered-definitions",
    documentVersionId: "version-numbered-definitions",
    fileName: "generic-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "1. Definitions",
      "1.1 Definitions",
      "1.1.1 Agreement means the principal services agreement.",
      "1.1.2 Company Personal Data: Personal Data processed for Company.",
      "1.1.3 and means of such Processing are determined by law.",
      "1.2 GDPR has the meaning given in Regulation (EU) 2016/679.",
    ].join("\n")),
    enableLlmRelations: false,
  });
  assert.ok(graph.definitions.some((definition) => definition.term === "Agreement"));
  assert.ok(graph.definitions.some((definition) => definition.term === "Company Personal Data"));
  assert.equal(graph.definitions.some((definition) => definition.term.toLowerCase() === "and"), false);
  assert.equal(graph.definitions.find((definition) => definition.term === "GDPR")?.sourceKind, "imported_external");
  assert.equal(graph.nodes.find((node) => node.displayLabel === "1.1.3")?.kind, "subclause");
});

test("keeps SCC clauses in a nested instrument namespace", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-scc",
    fileId: "doc-scc",
    documentVersionId: "version-scc",
    fileName: "entrust-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "5. Main body clause",
      "5.2 The Standard Contractual Clauses in Schedule 2 are incorporated into this DPA.",
      "Schedule 2",
      "STANDARD CONTRACTUAL CLAUSES",
      "Clause 5 Processor obligations",
      "Clause 11 This clause is subject to SCC Clause 5.",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const mainFive = graph.nodes.find((node) => node.namespace === "main" && node.displayLabel === "5")!;
  const sccFive = graph.nodes.find((node) => node.namespace === "schedule:2/scc" && node.displayLabel === "5")!;
  const edge = graph.relationEdges.find((candidate) => candidate.targetMention.toLowerCase() === "scc clause 5")!;
  assert.notEqual(mainFive.nodeId, sccFive.nodeId);
  assert.equal(edge.targetNodeId, sccFive.nodeId);
  assert.equal(edge.semanticEffect, "subject_to");
});

test("converges repeated references on one canonical unresolved target", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-unresolved",
    fileId: "doc-unresolved",
    documentVersionId: "version-unresolved",
    fileName: "hcl-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "3.2 Processing details are set out in Schedule A.",
      "3.3(g) Further details are described in Schedule A.",
      "4(a) Security information is listed in Schedule A.",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const edges = graph.relationEdges.filter((edge) => edge.targetMention.toLowerCase() === "schedule a");
  assert.equal(edges.length, 3);
  assert.equal(new Set(edges.map((edge) => edge.unresolvedTargetId)).size, 1);
  assert.equal(graph.unresolvedTargets.length, 1);
  assert.equal(graph.unresolvedTargets[0].unresolvedTargetId, "unresolved://schedule/a");
});

test("expands an explicitly qualified section range into granular schedule edges", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-range",
    fileId: "doc-range",
    documentVersionId: "version-range",
    fileName: "salesforce-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "2.3 Processing details are in sections 2-4 of Schedule 2.",
      "Schedule 2",
      "2. Subject matter",
      "3. Duration",
      "4. Data categories",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const rangeEdges = graph.relationEdges.filter((edge) => /^section [234] of schedule 2$/i.test(edge.targetMention));
  assert.equal(rangeEdges.length, 3);
  assert.ok(rangeEdges.every((edge) => edge.status === "resolved" && edge.semanticEffect === "details_provided_by"));
  assert.equal(graph.relationEdges.some((edge) => /^schedule 2$/i.test(edge.targetMention) && edge.sourceNodeId === rangeEdges[0].sourceNodeId), false);
});

test("preserves local numbering restarts under their physical owner", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-local-numbering",
    fileId: "doc-local-numbering",
    documentVersionId: "version-local-numbering",
    fileName: "bitrix-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "Appendix 2",
      "1. Earlier appendix section",
      "6. Security measures",
      "1.1 Local control one",
      "1.2 Local control two",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const sectionSix = graph.nodes.find((node) => node.namespace === "appendix:2" && node.displayLabel === "6")!;
  const local11 = graph.nodes.find((node) => node.namespace === "appendix:2" && node.displayLabel === "1.1")!;
  const local12 = graph.nodes.find((node) => node.namespace === "appendix:2" && node.displayLabel === "1.2")!;
  assert.equal(local11.parentId, sectionSix.nodeId);
  assert.equal(local12.parentId, sectionSix.nodeId);
  assert.ok(local11.signals.includes("local_numbering_restart"));
});

test("recovers source-supported split numbering without inventing gap nodes", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-split-number",
    fileId: "doc-split-number",
    documentVersionId: "version-split-number",
    fileName: "bitrix-dpa.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "6. Security",
      "6.2 Existing clause",
      "7. Incidents",
      "7.2 Existing clause",
      "11. Data Transfers",
      "11.3 International transfers",
      "11.3.3 Transfer safeguard",
      "11. 4 The security of data and data-subject rights under GDPR.",
    ].join("\n")),
    enableLlmRelations: false,
  });
  const clause11 = graph.nodes.find((node) => node.displayLabel === "11")!;
  const clause114 = graph.nodes.find((node) => node.displayLabel === "11.4")!;
  assert.equal(clause114.parentId, clause11.nodeId);
  assert.ok(clause114.signals.includes("recovered_split_numbering"));
  assert.equal(graph.nodes.some((node) => node.displayLabel === "6.1" || node.displayLabel === "7.3"), false);
});

test("marks a supplied artifact identity mismatch", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-identity",
    fileId: "doc-identity",
    documentVersionId: "version-identity",
    fileName: "DPA-3-Entrust.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Salesforce Data Processing Addendum\n1. Terms"),
    expectedIdentity: "Entrust",
    enableLlmRelations: false,
  });
  assert.equal(graph.identity.status, "mismatch");
  assert.ok(graph.quality.criticalIssues.includes("document_identity_mismatch"));
});

test("uses the full Docling pipeline for PDF when local dependencies are ready", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-pdf",
    fileId: "doc-pdf",
    documentVersionId: "version-pdf",
    fileName: "sample-dpa.pdf",
    mimeType: "application/pdf",
    buffer: await pdfBuffer(["1. Processing", "1.1 Details are set out in Appendix 1.", "Appendix 1", "Processing details"]),
    enableLlmRelations: false,
  });
  assert.equal(graph.parser.name, "docling.rs");
  assert.notEqual(graph.parser.status, "partial_success");
  assert.ok(graph.identity.pageCount && graph.identity.pageCount >= 1);
  assert.equal(graph.quality.criticalIssues.includes("format_parser_fallback"), false);
});

test("emits a machine-readable gold graph benchmark", async () => {
  const graph = await buildDocumentGraph({
    artifactId: "artifact-benchmark",
    fileId: "doc-benchmark",
    documentVersionId: "version-benchmark",
    fileName: "benchmark.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(["1. Terms", "2. Details are set out in Appendix A.", "Appendix A", "Processing information"].join("\n")),
    enableLlmRelations: false,
  });
  const report = benchmarkDocumentGraph(graph, {
    documentName: "benchmark",
    nodes: [
      { key: "c1", kind: "clause", namespace: "main", displayLabel: "1" },
      { key: "c2", kind: "clause", namespace: "main", displayLabel: "2" },
      { key: "app", kind: "appendix", namespace: "appendix:a", displayLabel: "A" },
      { key: "app-body", kind: "paragraph", namespace: "appendix:a", titleIncludes: "Processing information", parentKey: "app" },
    ],
    definitions: [],
    relations: [{ sourceNodeKey: "c2", targetNodeKey: "app", semanticEffect: "details_provided_by", status: "resolved" }],
    traversals: [{ sourceNodeKey: "c2", targetNodeKey: "app-body", maxHops: 2 }],
  });
  assert.equal(report.pass, true);
  assert.equal(report.metrics.traversalCompleteness.value, 1);
});
