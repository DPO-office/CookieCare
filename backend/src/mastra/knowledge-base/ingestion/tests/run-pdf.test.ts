import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSourceMap, type SourceMap } from "../extraction/source-map.js";
import { planStructureChunks } from "../extraction/structure-chunk-plan.js";
import {
  sourceLocations,
  type CandidateSegment,
  type CandidateStructure,
  type StructureProvider,
  type StructureProviderConfig,
} from "../extraction/structure-provider.js";
import {
  createRunPdfWorkflow,
  RunPdfInputSchema,
  RunPdfOutputSchema,
} from "../workflows/run-pdf-workflow.js";

function samplePdf(content = "Generic PDF Ingestion Content"): Uint8Array {
  const stream = `BT /F1 12 Tf 72 712 Td (${content}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function mockDoclingDocument(text: string) {
  return {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1 } },
    body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }] },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: [
      {
        self_ref: "#/texts/0",
        text,
        label: "paragraph",
        prov: [{ page_no: 1 }],
      },
    ],
  };
}

function mockStructureProvider(sourceMap: SourceMap, configuration: StructureProviderConfig): StructureProvider {
  return {
    configuration,
    extract: async input => {
      const fixed = 100;
      const plan = planStructureChunks(input.sourceMap, {
        targetInputCharacters: 190_000,
        hardInputCharacters: 200_000,
        fixedInputCharacters: fixed,
      });
      await input.checkpoints?.savePlan(plan);
      const segment: CandidateSegment = {
        id: "s1",
        kind: "unit",
        type: "article",
        category: "main",
        parent: null,
        children: [],
        span: { start: 0, end: input.canonicalText.length },
        code: null,
        title: null,
        sourceSpans: sourceLocations(input.sourceMap, { start: 0, end: input.canonicalText.length }),
      };
      const candidate: CandidateStructure = {
        schemaVersion: 1,
        textHash: input.textHash,
        provider: configuration.provider,
        model: configuration.model,
        promptVersion: configuration.promptVersion,
        processingStrategy: configuration.processingStrategy,
        segments: [segment],
        references: [],
        unresolvedItems: [],
        warnings: [],
      };
      return {
        candidate,
        rawResponse: { chunkPlan: plan, chunks: [] },
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        durationMs: 12,
      };
    },
  };
}

test("run two different PDFs and confirm their artifacts remain separate", async () => {
  const tempDir = path.join(os.tmpdir(), `kb-test-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const pdfPathA = path.join(tempDir, "doc-alpha.pdf");
    const pdfPathB = path.join(tempDir, "doc-beta.pdf");
    const bytesA = samplePdf("Alpha Document Contents");
    const bytesB = samplePdf("Beta Document Contents Different Bytes");
    await writeFile(pdfPathA, bytesA);
    await writeFile(pdfPathB, bytesB);

    const hashA = createHash("sha256").update(bytesA).digest("hex");
    const hashB = createHash("sha256").update(bytesB).digest("hex");
    assert.notEqual(hashA, hashB);

    const workflow = createRunPdfWorkflow(() => ({
      extractor: {
        extract: async (_bytes, fileName) =>
          mockDoclingDocument(fileName === "doc-alpha.pdf" ? "Article 1 Alpha Scope" : "Article 1 Beta Scope"),
      },
      providerFactory: config => ({
        configuration: config,
        extract: async input => mockStructureProvider(input.sourceMap, config).extract(input),
      }),
    }));

    const runA = await workflow.createRun();
    const resultA = await runA.start({
      inputData: {
        pdfPath: pdfPathA,
        provider: "llm",
        model: "glm-5.3",
        outputDir: path.join(tempDir, "evaluation-runs", "doc-alpha.pdf", "run-a"),
      },
    });

    const runB = await workflow.createRun();
    const resultB = await runB.start({
      inputData: {
        pdfPath: pdfPathB,
        provider: "llm",
        model: "glm-5.3",
        outputDir: path.join(tempDir, "evaluation-runs", "doc-beta.pdf", "run-b"),
      },
    });

    assert.equal(resultA.status, "success");
    assert.equal(resultB.status, "success");

    if (resultA.status === "success" && resultB.status === "success") {
      assert.notEqual(resultA.result.outputDir, resultB.result.outputDir);
      assert.equal(resultA.result.pdfHash, hashA);
      assert.equal(resultB.result.pdfHash, hashB);

      const requiredFiles = [
        "original.pdf",
        "docling.json",
        "source-map.json",
        "chunk-plan.json",
        "structure-response.json",
        "structure-candidate.json",
        "references.json",
        "reconstruction.json",
        "document-model.json",
        "validation.json",
        "manifest.json",
      ];

      for (const file of requiredFiles) {
        assert.ok(existsSync(path.join(resultA.result.outputDir, file)), `doc-alpha missing ${file}`);
        assert.ok(existsSync(path.join(resultB.result.outputDir, file)), `doc-beta missing ${file}`);
      }

      const manifestA = JSON.parse(await readFile(path.join(resultA.result.outputDir, "manifest.json"), "utf8"));
      const manifestB = JSON.parse(await readFile(path.join(resultB.result.outputDir, "manifest.json"), "utf8"));

      assert.equal(manifestA.pdfSha256, hashA);
      assert.equal(manifestB.pdfSha256, hashB);
      assert.equal(manifestA.pdfFileName, "doc-alpha.pdf");
      assert.equal(manifestB.pdfFileName, "doc-beta.pdf");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("run the same PDF twice and confirm two distinct run directories", async () => {
  const tempDir = path.join(os.tmpdir(), `kb-test-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const pdfPath = path.join(tempDir, "repeat-document.pdf");
    const bytes = samplePdf("Repeat Document Contents");
    await writeFile(pdfPath, bytes);

    const workflow = createRunPdfWorkflow(() => ({
      extractor: {
        extract: async () => mockDoclingDocument("Article 1 Repeat Policy Scope"),
      },
      providerFactory: config => ({
        configuration: config,
        extract: async input => mockStructureProvider(input.sourceMap, config).extract(input),
      }),
    }));

    const runId1 = `run-1-${randomUUID()}`;
    const runId2 = `run-2-${randomUUID()}`;

    const run1 = await workflow.createRun();
    const result1 = await run1.start({
      inputData: {
        pdfPath,
        provider: "llm",
        model: "glm-5.3",
        runId: runId1,
        outputDir: path.join(tempDir, "evaluation-runs", "repeat-document.pdf", runId1),
      },
    });

    const run2 = await workflow.createRun();
    const result2 = await run2.start({
      inputData: {
        pdfPath,
        provider: "llm",
        model: "glm-5.3",
        runId: runId2,
        outputDir: path.join(tempDir, "evaluation-runs", "repeat-document.pdf", runId2),
      },
    });

    assert.equal(result1.status, "success");
    assert.equal(result2.status, "success");

    if (result1.status === "success" && result2.status === "success") {
      assert.notEqual(result1.result.runId, result2.result.runId);
      assert.notEqual(result1.result.outputDir, result2.result.outputDir);
      assert.ok(existsSync(result1.result.outputDir));
      assert.ok(existsSync(result2.result.outputDir));
      assert.ok(existsSync(path.join(result1.result.outputDir, "manifest.json")));
      assert.ok(existsSync(path.join(result2.result.outputDir, "manifest.json")));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("confirm Docling is invoked during every new execution", async () => {
  const tempDir = path.join(os.tmpdir(), `kb-test-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const pdfPath = path.join(tempDir, "test-docling-calls.pdf");
    await writeFile(pdfPath, samplePdf("Docling Invocation Check"));

    let doclingCalls = 0;
    const workflow = createRunPdfWorkflow(() => ({
      extractor: {
        extract: async () => {
          doclingCalls++;
          return mockDoclingDocument("Article 1 Scope");
        },
      },
      providerFactory: config => ({
        configuration: config,
        extract: async input => mockStructureProvider(input.sourceMap, config).extract(input),
      }),
    }));

    for (let i = 0; i < 3; i++) {
      const run = await workflow.createRun();
      const runId = `docling-run-${i}`;
      const res = await run.start({
        inputData: {
          pdfPath,
          provider: "llm",
          model: "glm-5.3",
          runId,
          outputDir: path.join(tempDir, "evaluation-runs", "test-docling-calls.pdf", runId),
        },
      });
      assert.equal(res.status, "success");
    }

    assert.equal(doclingCalls, 3, "Docling must be called on every run execution");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("reject missing, non-PDF, oversized, or unreadable files", async () => {
  const tempDir = path.join(os.tmpdir(), `kb-test-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const workflow = createRunPdfWorkflow(() => ({
      extractor: { extract: async () => mockDoclingDocument("Article 1") },
    }));

    const getErrorMessage = (res: any) => {
      if (res.error instanceof Error) return res.error.message;
      if (res.error?.message) return String(res.error.message);
      return JSON.stringify(res.error);
    };

    // 1. Missing file
    const missingRun = await workflow.createRun();
    const missingRes = await missingRun.start({
      inputData: {
        pdfPath: path.join(tempDir, "missing-file.pdf"),
        provider: "llm",
        model: "glm-5.3",
      },
    });
    assert.equal(missingRes.status, "failed");
    assert.match(getErrorMessage(missingRes), /PDF file not found/);

    // 2. Non-PDF (missing %PDF- header)
    const nonPdfPath = path.join(tempDir, "not-a-pdf.pdf");
    await writeFile(nonPdfPath, Buffer.from("plain text without PDF header"));
    const nonPdfRun = await workflow.createRun();
    const nonPdfRes = await nonPdfRun.start({
      inputData: {
        pdfPath: nonPdfPath,
        provider: "llm",
        model: "glm-5.3",
      },
    });
    assert.equal(nonPdfRes.status, "failed");
    assert.match(getErrorMessage(nonPdfRes), /Uploaded file is not a valid PDF/);

    // 3. Oversized file (> 25 MiB)
    const oversizedPath = path.join(tempDir, "oversized.pdf");
    const largeBuffer = Buffer.alloc(25 * 1024 * 1024 + 1024);
    largeBuffer.write("%PDF-1.4\n");
    await writeFile(oversizedPath, largeBuffer);
    const oversizedRun = await workflow.createRun();
    const oversizedRes = await oversizedRun.start({
      inputData: {
        pdfPath: oversizedPath,
        provider: "llm",
        model: "glm-5.3",
      },
    });
    assert.equal(oversizedRes.status, "failed");
    assert.match(getErrorMessage(oversizedRes), /exceeds maximum allowed size of 25 MiB/);

    // 4. Unreadable file (%PDF- header but malformed structure that pdf inspection rejects)
    const unreadablePath = path.join(tempDir, "unreadable.pdf");
    await writeFile(unreadablePath, Buffer.from("%PDF-corrupted-bytes-with-no-catalog-or-pages-xref"));
    const unreadableRun = await workflow.createRun();
    const unreadableRes = await unreadableRun.start({
      inputData: {
        pdfPath: unreadablePath,
        provider: "llm",
        model: "glm-5.3",
      },
    });
    assert.equal(unreadableRes.status, "failed");
    assert.match(getErrorMessage(unreadableRes), /PDF file is unreadable/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("confirm chunk requests remain below 200,000 characters", () => {
  const unitsText = Array.from({ length: 400 }, (_, i) => `Article ${i + 1}\nProvision text paragraph ${i + 1}.`);
  const rawDoc = {
    schema_name: "DoclingDocument",
    version: "1",
    pages: { "1": { page_no: 1 } },
    body: { self_ref: "#/body", children: unitsText.map((_, i) => ({ $ref: `#/texts/${i}` })) },
    furniture: { self_ref: "#/furniture", children: [] },
    tables: [],
    texts: unitsText.map((text, i) => ({
      self_ref: `#/texts/${i}`,
      text,
      label: "paragraph",
      prov: [{ page_no: 1 }],
    })),
  };
  const sourceMap = buildSourceMap(rawDoc, 1);
  const fixedInputCharacters = 200;

  const plan = planStructureChunks(sourceMap, {
    targetInputCharacters: 190_000,
    hardInputCharacters: 200_000,
    fixedInputCharacters,
  });

  assert.ok(plan.chunks.length > 0);
  assert.equal(plan.hardInputCharacters, 200_000);
  for (const chunk of plan.chunks) {
    assert.ok(
      chunk.assembledInputCharacters <= 200_000,
      `Chunk ${chunk.chunkId} assembledInputCharacters (${chunk.assembledInputCharacters}) exceeds 200,000`,
    );
  }
});

test("confirm no GDPR path or extracted GDPR text is required", async () => {
  const tempDir = path.join(os.tmpdir(), `kb-test-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const customPdfPath = path.join(tempDir, "cookiecare-internal-policy.pdf");
    await writeFile(customPdfPath, samplePdf("CookieCare Internal Compliance Policy 2026"));

    const workflow = createRunPdfWorkflow(() => ({
      extractor: {
        extract: async () =>
          mockDoclingDocument(
            "CookieCare Security Policy\nSection 1 Definitions\nCustomer means any person.\nSection 2 Obligations\nAll cookies must be consented to.",
          ),
      },
      providerFactory: config => ({
        configuration: config,
        extract: async input => mockStructureProvider(input.sourceMap, config).extract(input),
      }),
    }));

    const run = await workflow.createRun();
    const runId = "custom-policy-run";
    const result = await run.start({
      inputData: {
        pdfPath: customPdfPath,
        provider: "llm",
        model: "glm-5.3",
        runId,
        outputDir: path.join(tempDir, "evaluation-runs", "cookiecare-internal-policy.pdf", runId),
      },
    });

    assert.equal(result.status, "success");
    if (result.status === "success") {
      assert.equal(result.result.pdfHash, createHash("sha256").update(samplePdf("CookieCare Internal Compliance Policy 2026")).digest("hex"));
      assert.ok(result.result.provisionCount >= 1);
      assert.ok(["needs_review", "candidate_ready"].includes(result.result.validationStatus));

      const manifestPath = path.join(result.result.outputDir, "manifest.json");
      assert.ok(existsSync(manifestPath));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.equal(manifest.pdfFileName, "cookiecare-internal-policy.pdf");
      assert.equal(manifest.pipelineVersion, "kb-run-pdf-v1");
      assert.ok(!manifest.pdfPath.includes("CELEX"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
