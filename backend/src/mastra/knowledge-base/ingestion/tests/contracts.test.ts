import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessScopeSchema, CoverageSchema, InvestigationProfileSchema, KB_SCHEMA_VERSION,
  LegalDateSchema, PublicationManifestSchema, RequirementSchema, SearchEntrySchema, SourceVersionSchema,
  hashRevision, hashText, validateSourceLinks,
} from "../schemas/index.js";
import { classifyPilotInput } from "../scope.js";
import { loadPilotCorpus } from "../evaluation/fixtures/pilot.js";

function sourceFixture() {
  const fixture = loadPilotCorpus()[0];
  const target = fixture.expected.provisions[1];
  const requirement = RequirementSchema.parse({
    schemaVersion: KB_SCHEMA_VERSION, id: "draft-a", revision: 1, contentHash: hashText("draft"),
    createdAt: "2026-10-09T00:00:00Z", authorship: { kind: "generated", model: "test", promptVersion: "v1" },
    ruleId: "gdpr.art28.3.a", title: "Instructions", actor: "processor", action: "process", object: "personal data", modality: "must",
    applicability: { jurisdictions: ["EU"], relationshipScopes: ["controller_to_processor"], guidance: "Check the relationship" },
    conditions: [], exceptions: [], alternatives: [], unresolvedIssues: [], reviewStatus: "draft",
    sources: [{ provision: { id: target.id, revision: target.revision }, role: "target", exactQuote: target.text, start: 0, end: target.text.length }],
  });
  const coverage = CoverageSchema.parse({
    sourceVersionId: fixture.sourceVersionId, originalPageCount: null,
    pages: fixture.pageInventory.map(page => ({ page, status: "extracted" })), blocks: fixture.expected.dispositions,
    extractionStatus: "partial", reviewStatus: "unreviewed", reviewedProvisionIds: [],
  });
  return { blocks: fixture.blocks, provisions: fixture.expected.provisions, requirements: [requirement], coverage };
}

test("revision hashes are deterministic and change with content, alternatives or order", () => {
  assert.equal(hashRevision({ a: 1, b: [2, 3] }), hashRevision({ b: [2, 3], a: 1 }));
  assert.notEqual(hashRevision({ b: [2, 3] }), hashRevision({ b: [3, 2] }));
  assert.notEqual(hashRevision({ operator: "all" }), hashRevision({ operator: "any" }));
  for (const value of [undefined, NaN, Infinity, new Date(), { a: undefined }]) assert.throws(() => hashRevision(value));
});

test("private, workspace and curated shared scopes have distinct required identities", () => {
  assert.ok(AccessScopeSchema.safeParse({ visibility: "private", ownerUserId: "u1" }).success);
  assert.ok(AccessScopeSchema.safeParse({ visibility: "workspace", ownerUserId: "u1", workspaceId: "w1" }).success);
  assert.ok(AccessScopeSchema.safeParse({ visibility: "curated_shared", curatorUserId: "u1" }).success);
  assert.equal(AccessScopeSchema.safeParse({ visibility: "workspace", organisationId: "org" }).success, false);
  assert.equal(AccessScopeSchema.safeParse({ visibility: "private", ownerUserId: "u1", workspaceId: "w1" }).success, false);
});

test("unknown legal dates remain null and calendar dates are validated", () => {
  assert.equal(LegalDateSchema.parse(null), null);
  assert.equal(LegalDateSchema.safeParse("2026-02-30").success, false);
  const source = {
    schemaVersion: KB_SCHEMA_VERSION, id: "v1", sourceId: "s1", uploadRevision: 2,
    objectKey: "private/s1/v1.pdf", checksum: hashText("pdf"), originalFileName: "source.pdf",
    mimeType: "application/pdf", byteSize: 42, language: null, uploadedAt: "2026-10-09T00:00:00Z",
    enactedOn: null, effectiveFrom: null, effectiveUntil: null, originalPageCount: null, extractionVersion: null, supportStatus: "pending",
  };
  assert.equal(SourceVersionSchema.parse(source).effectiveFrom, null);
  assert.equal(SourceVersionSchema.safeParse({ ...source, schemaVersion: "2.0.0" }).success, false);
});

test("pilot intake preserves explicit unsupported and unreadable statuses", () => {
  assert.equal(classifyPilotInput({ mimeType: "application/msword", language: "en", readable: true }), "unsupported");
  assert.equal(classifyPilotInput({ mimeType: "application/pdf", language: "en", readable: false }), "unreadable");
  for (const language of [null, "en", "fr"]) {
    assert.equal(classifyPilotInput({ mimeType: "application/pdf", language, readable: true }), "review_required");
  }
});

test("complete coverage needs independent pages and accounted blocks", () => {
  const base = { sourceVersionId: "v1", originalPageCount: 1, pages: [{ page: 1, status: "confirmed_empty" }],
    blocks: [], extractionStatus: "complete", reviewStatus: "unreviewed", reviewedProvisionIds: [] };
  assert.ok(CoverageSchema.safeParse(base).success);
  for (const change of [
    { originalPageCount: null }, { originalPageCount: 2 }, { pages: [{ page: 1, status: "missing" }] },
    { blocks: [{ blockId: "b1", status: "unresolved", reason: "missing text" }] },
    { pages: [...base.pages, ...base.pages] }, { reviewedProvisionIds: ["p1"] },
  ]) assert.equal(CoverageSchema.safeParse({ ...base, ...change }).success, false);
});

test("retained source fragments and exact quotes validate together", () => {
  assert.deepEqual(validateSourceLinks(sourceFixture()), []);
});

for (const defect of ["wrong_version", "wrong_revision", "invented_quote", "bad_offset", "missing_block", "missing_parent", "cycle", "bad_disposition", "unaccounted_block"] as const) {
  test(`source validation catches ${defect}`, () => {
    const input = sourceFixture();
    const target = input.provisions[1];
    if (defect === "wrong_version") input.blocks[1].sourceVersionId = "another-upload";
    if (defect === "wrong_revision") input.requirements[0].sources[0].provision.revision = 2;
    if (defect === "invented_quote") input.requirements[0].sources[0].exactQuote = "invented text";
    if (defect === "bad_offset") target.fragments[0].end += 10000;
    if (defect === "missing_block") input.blocks.splice(1, 1);
    if (defect === "missing_parent") target.parentId = "absent-parent";
    if (defect === "cycle") input.provisions[0].parentId = target.id;
    if (defect === "bad_disposition") input.coverage.blocks[1] = { blockId: input.blocks[1].id, status: "assigned", provisionIds: ["fake"] };
    if (defect === "unaccounted_block") input.coverage.blocks.splice(1, 1);
    assert.ok(validateSourceLinks(input).length > 0);
  });
}

test("complete coverage cannot hide a page with no extraction blocks", () => {
  const input = sourceFixture();
  input.coverage.originalPageCount = 69;
  input.coverage.pages = Array.from({ length: 69 }, (_, index) => ({ page: index + 1, status: index >= 66 ? "extracted" : "confirmed_empty" }));
  input.coverage.extractionStatus = "complete";
  assert.ok(validateSourceLinks(input).some(issue => issue.code === "missing_extraction_blocks"));
});

test("provisions cannot invent wording while pointing at a genuine source fragment", () => {
  const input = sourceFixture();
  input.provisions[1].text += " Invented obligation.";
  assert.ok(validateSourceLinks(input).some(issue => issue.code === "source_text_mismatch"));
});

test("documented normalization permits a line-end join but retains genuine hyphens", () => {
  const fixture = loadPilotCorpus().find(c => c.id === "line-end-hyphen")!;
  const input = { blocks: fixture.blocks, provisions: fixture.expected.provisions, requirements: [], coverage: {
    sourceVersionId: fixture.sourceVersionId, originalPageCount: 1, pages: [{ page: 1, status: "extracted" }],
    blocks: fixture.expected.dispositions, extractionStatus: "complete", reviewStatus: "unreviewed", reviewedProvisionIds: [],
  } };
  assert.deepEqual(validateSourceLinks(input), []);
  input.provisions[0].normalization = [];
  assert.ok(validateSourceLinks(input).some(issue => issue.code === "source_text_mismatch"));
});

test("complete block coverage cannot hide substantive text outside assigned spans", () => {
  const fixture = loadPilotCorpus().find(c => c.id === "table-reading-order")!;
  const provision = fixture.expected.provisions[0];
  provision.fragments[0].end = 5;
  provision.text = fixture.blocks[0].text.slice(0, 5);
  const issues = validateSourceLinks({ blocks: fixture.blocks, provisions: [provision], requirements: [], coverage: {
    sourceVersionId: fixture.sourceVersionId, originalPageCount: 1, pages: [{ page: 1, status: "extracted" }],
    blocks: fixture.expected.dispositions, extractionStatus: "complete", reviewStatus: "unreviewed", reviewedProvisionIds: [],
  } });
  assert.ok(issues.some(issue => issue.code === "unassigned_text"));
});

test("investigation profiles enforce conditional guidance and aggregation references", () => {
  const profile = {
    hypothesis: "Personnel confidentiality is established", evidenceHints: ["personnel"], proofStandard: "Operative personnel obligations",
    proofElements: [{ id: "personnel", description: "Personnel commitment", kind: "mandatory", nonProofTraps: ["Generic corporate confidentiality"], evidenceQueries: [] }],
    applicabilityGuidance: "Controller-to-processor terms", proofGuidance: [], nonProofTraps: [], remediationGuidance: [],
    relationshipScopes: ["controller_to_processor"], relatedRuleIds: [], verificationVersion: "1.0.0", aggregation: { elementId: "personnel" },
  };
  assert.ok(InvestigationProfileSchema.safeParse(profile).success);
  assert.equal(InvestigationProfileSchema.safeParse({ ...profile, aggregation: { elementId: "fake" } }).success, false);
  assert.equal(InvestigationProfileSchema.safeParse({ ...profile, proofElements: [...profile.proofElements, ...profile.proofElements] }).success, false);
  assert.equal(InvestigationProfileSchema.safeParse({ ...profile, proofElements: [{ ...profile.proofElements[0], kind: "conditional" }] }).success, false);
  assert.ok(InvestigationProfileSchema.safeParse({ ...profile, proofElements: [{ ...profile.proofElements[0], kind: "conditional", applicabilityGuidance: "Only when used" }] }).success);
});

test("search entries retain exact whitespace and reject hash, dimension and nonfinite-vector errors", () => {
  const text = "  exact search text\n";
  const entry = {
    schemaVersion: KB_SCHEMA_VERSION, id: "e1", indexVersion: "i1", sourceVersionId: "v1", recordKind: "provision",
    record: { id: "p1", revision: 1 }, purpose: "legal_passage", proofElementId: null, text, textHash: hashText(text),
    embedding: { model: "test", dimensions: 2, configurationVersion: "1", documentTask: "document", queryTask: "query", vector: [0.1, 0.2] },
  };
  assert.equal(SearchEntrySchema.parse(entry).text, text);
  assert.equal(SearchEntrySchema.safeParse({ ...entry, textHash: hashText(text.trim()) }).success, false);
  assert.equal(SearchEntrySchema.safeParse({ ...entry, embedding: { ...entry.embedding, dimensions: 3 } }).success, false);
  assert.equal(SearchEntrySchema.safeParse({ ...entry, embedding: { ...entry.embedding, vector: [Infinity, 0] } }).success, false);
  assert.equal(SearchEntrySchema.safeParse({ ...entry, purpose: "evidence_query" }).success, false);
});

test("active publication shape requires both indexes and exact approved revision references", () => {
  const manifest = {
    schemaVersion: KB_SCHEMA_VERSION, id: "publication1", manifestHash: hashText("manifest"), sourceVersionIds: ["v1"],
    reviewedScope: [{ id: "p1", revision: 1 }],
    approvedRecords: [{ kind: "provision", record: { id: "p1", revision: 1 }, revisionHash: hashText("revision"), reviewDecisionId: "review1" }],
    indexVersion: "i1", lexicalStatus: "ready", denseStatus: "ready", state: "active", createdAt: "2026-10-09T00:00:00Z",
  };
  assert.ok(PublicationManifestSchema.safeParse(manifest).success);
  assert.equal(PublicationManifestSchema.safeParse({ ...manifest, denseStatus: "pending" }).success, false);
  assert.equal(PublicationManifestSchema.safeParse({ ...manifest, lexicalStatus: "failed" }).success, false);
});
