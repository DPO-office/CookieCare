import { KB_SCHEMA_VERSION, type Provision } from "../../schemas/index.js";
import { EVALUATION_CORPUS_VERSION, validateCorpus, type CaseOutput, type EvaluationCase, type PipelineRun } from "../contracts.js";

const GDPR_URL = "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng";
const GDPR_FAMILY = "eu-2016-679-oj-en";
const GDPR_VERSION = "gdpr-oj-en-synthetic-layout-v1";

// Official legislative wording; layout and page positions are synthetic test inputs.
// These are developer-prepared candidates, not legally reviewed reference answers.
const GDPR = {
  parent: "Processing by a processor shall be governed by a contract or other legal act under Union or Member State law, that is binding on the processor with regard to the controller and that sets out the subject-matter and duration of the processing, the nature and purpose of the processing, the type of personal data and categories of data subjects and the obligations and rights of the controller. That contract or other legal act shall stipulate, in particular, that the processor:",
  a: "processes the personal data only on documented instructions from the controller, including with regard to transfers of personal data to a third country or an international organisation, unless required to do so by Union or Member State law to which the processor is subject; in such a case, the processor shall inform the controller of that legal requirement before processing, unless that law prohibits such information on important grounds of public interest;",
  b: "ensures that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality;",
  c: "takes all measures required pursuant to Article 32;",
  d: "respects the conditions referred to in paragraphs 2 and 4 for engaging another processor;",
  p2: "The processor shall not engage another processor without prior specific or general written authorisation of the controller. In the case of general written authorisation, the processor shall inform the controller of any intended changes concerning the addition or replacement of other processors, thereby giving the controller the opportunity to object to such changes.",
  p4: "Where a processor engages another processor for carrying out specific processing activities on behalf of the controller, the same data protection obligations as set out in the contract or other legal act between the controller and the processor as referred to in paragraph 3 shall be imposed on that other processor by way of a contract or other legal act under Union or Member State law, in particular providing sufficient guarantees to implement appropriate technical and organisational measures in such a manner that the processing will meet the requirements of this Regulation. Where that other processor fails to fulfil its data protection obligations, the initial processor shall remain fully liable to the controller for the performance of that other processor's obligations.",
  p5: "Adherence of a processor to an approved code of conduct as referred to in Article 40 or an approved certification mechanism as referred to in Article 42 may be used as an element by which to demonstrate sufficient guarantees as referred to in paragraphs 1 and 4 of this Article.",
  p6: "Without prejudice to an individual contract between the controller and the processor, the contract or the other legal act referred to in paragraphs 3 and 4 of this Article may be based, in whole or in part, on standard contractual clauses referred to in paragraphs 7 and 8 of this Article, including when they are part of a certification granted to the controller or processor pursuant to Articles 42 and 43.",
};

function block(id: string, text: string, page: number, readingOrder: number, version = GDPR_VERSION): EvaluationCase["blocks"][number] {
  return { id, text, page, readingOrder, sourceVersionId: version, bbox: null, extractionMethod: "docling", itemRef: `#/texts/${readingOrder}` };
}

function provision(id: string, path: string[], blocks: EvaluationCase["blocks"], options: Partial<Provision> = {}): Provision {
  const sourceVersionId = blocks[0].sourceVersionId;
  return {
    schemaVersion: KB_SCHEMA_VERSION, id, revision: 1, sourceVersionId,
    citation: { instrumentId: sourceVersionId === GDPR_VERSION ? "eu-2016-679" : "synthetic-instrument", sourceVersionId, path, label: path.join("/") },
    parentId: null, kind: "paragraph", text: blocks.map(b => b.text).join(" "),
    fragments: blocks.map(b => ({ blockId: b.id, start: 0, end: b.text.length })),
    reconstructionStatus: "complete", normalization: blocks.length > 1 ? ["line_breaks"] : [], ...options,
  };
}

function fixture(id: string, category: EvaluationCase["category"], description: string,
  blocks: EvaluationCase["blocks"], provisions: Provision[], options: Partial<EvaluationCase> = {}): EvaluationCase {
  return {
    id, sourceFamily: GDPR_FAMILY, sourceVersionId: GDPR_VERSION, split: "development", category, description,
    provenance: { kind: "legal_text_with_synthetic_layout", referenceUrl: GDPR_URL,
      note: "Page labels are simulated from the plan, not verified PDF locations. All offsets address these test blocks only." },
    humanReview: { status: "pending" }, pageInventory: [...new Set(blocks.map(b => b.page))], blocks,
    expected: {
      caseId: id, provisions, requirements: [], coverageStatus: "partial", missingPages: [],
      dispositions: blocks.map(b => ({ blockId: b.id, status: "assigned" as const,
        provisionIds: provisions.filter(p => p.fragments.some(f => f.blockId === b.id)).map(p => p.id) })),
    }, ...options,
  };
}

function synthetic(id: string, description: string, texts: string[], options: Partial<EvaluationCase> = {}): EvaluationCase {
  const version = `${id}-v1`;
  const blocks = texts.map((text, index) => block(`${id}-b${index}`, text, 1, index, version));
  const provisions = blocks.map((b, index) => provision(`${id}-p${index}`, [String(index + 1)], [b]));
  return fixture(id, "layout", description, blocks, provisions, {
    sourceFamily: id, sourceVersionId: version,
    provenance: { kind: "synthetic", referenceUrl: null, note: "Invented document wording for a deterministic engineering test; not a legal authority." },
    ...options,
  });
}

function buildPilot(): EvaluationCase[] {
  const cases: EvaluationCase[] = [];
  const pointBlocks = [
    block("opening", GDPR.parent, 67, 0),
    ...(["a", "b", "c", "d"] as const).map((letter, i) => block(`point-${letter}`, GDPR[letter], 67 + Number(i > 1), i + 1)),
    block("paragraph-2", GDPR.p2, 67, 5), block("paragraph-4", GDPR.p4, 68, 6),
  ];
  const pointProvisions = [
    provision("gdpr-28-3", ["28", "3"], [pointBlocks[0]]),
    ...["a", "b", "c", "d"].map((letter, i) => provision(`gdpr-28-3-${letter}`, ["28", "3", letter], [pointBlocks[i + 1]], { kind: "point", parentId: "gdpr-28-3" })),
    provision("gdpr-28-2", ["28", "2"], [pointBlocks[5]]), provision("gdpr-28-4", ["28", "4"], [pointBlocks[6]]),
  ];
  const points = fixture("gdpr-28-3-a-d", "gdpr_article28", "Lettered points retain their parent opening and explicit dependencies. Definitions and Article 32 remain unresolved in this bounded excerpt.", pointBlocks, pointProvisions);
  const common = { actor: "processor", modality: "must" as const, conditions: [], exceptions: [], alternatives: [] };
  points.expected.requirements = [
    { ...common, ruleId: "gdpr.art28.3.a", action: "process only on documented controller instructions", object: "personal data, including international transfers",
      exceptions: ["Processing required by applicable Union or Member State law", "Prior legal-requirement notice prohibited by law on important public-interest grounds"],
      conditions: ["If processing is required by law, inform the controller before processing unless the notice exception applies"],
      supportingCitationPaths: [["28", "3"], ["28", "3", "a"]], dependencies: [{ path: ["4", "7"], status: "unresolved" }, { path: ["4", "8"], status: "unresolved" }] },
    { ...common, ruleId: "gdpr.art28.3.b", action: "ensure personnel confidentiality", object: "persons authorised to process personal data",
      alternatives: ["Personnel confidentiality commitment", "Appropriate statutory confidentiality obligation"],
      supportingCitationPaths: [["28", "3"], ["28", "3", "b"]], dependencies: [] },
    { ...common, ruleId: "gdpr.art28.3.c", action: "take all measures required by Article 32", object: "security of processing",
      supportingCitationPaths: [["28", "3"], ["28", "3", "c"]], dependencies: [{ path: ["32"], status: "unresolved" }] },
    { ...common, ruleId: "gdpr.art28.3.d", action: "respect paragraphs 2 and 4 when engaging another processor", object: "subprocessor engagement",
      conditions: ["When engaging another processor"], supportingCitationPaths: [["28", "3"], ["28", "3", "d"], ["28", "2"], ["28", "4"]],
      dependencies: [{ path: ["28", "2"], status: "resolved" }, { path: ["28", "4"], status: "resolved" }] },
  ];
  cases.push(points);

  const split = GDPR.p5.indexOf("Article 42");
  const continuationBlocks = [block("p5-start", GDPR.p5.slice(0, split).trimEnd(), 68, 0), block("p5-end", GDPR.p5.slice(split), 69, 1), block("p6", GDPR.p6, 69, 2)];
  cases.push(fixture("gdpr-28-5-continuation", "gdpr_article28", "Join paragraph 5 across simulated pages 68-69. Article 42 is inline text; paragraph 6 is separate.", continuationBlocks, [
    provision("gdpr-28-5", ["28", "5"], continuationBlocks.slice(0, 2)), provision("gdpr-28-6", ["28", "6"], [continuationBlocks[2]]),
  ]));

  const headers = synthetic("headers-footers", "Repeated furniture is classified explicitly, while substantive words are retained.", ["Official test journal", "The processor shall retain the log.", "Page 1"]);
  headers.expected.provisions = [headers.expected.provisions[1]];
  headers.expected.dispositions = [
    { blockId: headers.blocks[0].id, status: "classified", classification: "header", reason: "Repeated page furniture" },
    { blockId: headers.blocks[1].id, status: "assigned", provisionIds: [headers.expected.provisions[0].id] },
    { blockId: headers.blocks[2].id, status: "classified", classification: "page_number", reason: "Page label" },
  ];
  cases.push(headers);
  const top = synthetic("page-top-paragraph", "A genuine new numbered paragraph at the top of a page remains separate.", ["5. The assurance may be used.", "6. The agreement may use standard clauses."]);
  top.blocks[1].page = 2;
  top.pageInventory = [1, 2];
  cases.push(top);
  const hyphen = synthetic("line-end-hyphen", "Only a documented line-end hyphen join changes source typography; genuine hyphens remain.", ["The inter-\nnational transfer remains subject-matter specific."]);
  hyphen.expected.provisions[0].text = "The international transfer remains subject-matter specific.";
  hyphen.expected.provisions[0].normalization = ["line_end_hyphen"];
  cases.push(hyphen);
  const columns = synthetic("two-column-order", "Read down the left column before the right column.", ["Left opening", "Left continuation", "Right opening", "Right continuation"]);
  columns.blocks.forEach((b, i) => { b.bbox = { left: i < 2 ? 0 : 100, top: i % 2 * 20, right: i < 2 ? 90 : 190, bottom: i % 2 * 20 + 10, coordinateOrigin: "top_left" }; });
  columns.expected.provisions = [provision("column-left", ["1"], columns.blocks.slice(0, 2)), provision("column-right", ["2"], columns.blocks.slice(2))];
  columns.expected.dispositions = columns.blocks.map((b, i) => ({ blockId: b.id, status: "assigned", provisionIds: [i < 2 ? "column-left" : "column-right"] }));
  cases.push(columns);
  const table = synthetic("table-reading-order", "Retain table headings and row order without inventing prose.", ["Actor | Action\nProcessor | Retain log\nController | Review log"]);
  table.expected.provisions[0].kind = "table";
  cases.push(table);
  const restart = synthetic("numbering-restart", "Schedule A and Schedule B each restart at paragraph 1 without sharing an identity.", ["1. Schedule A duty.", "1. Schedule B duty."]);
  restart.expected.provisions[0].citation.path = ["schedule", "A", "1"];
  restart.expected.provisions[1].citation.path = ["schedule", "B", "1"];
  cases.push(restart);
  const missing = synthetic("missing-extraction-block", "The independent page inventory detects a missing page even when the parsed text is internally consistent.", ["1. Only the first page was extracted."]);
  missing.category = "damaged";
  missing.pageInventory = [1, 2];
  missing.expected.coverageStatus = "needs_review";
  missing.expected.missingPages = [2];
  cases.push(missing);
  const alternatives = synthetic("exceptions-and-alternatives", "Keep an OR choice and a statutory-storage exception; neither becomes an unconditional AND obligation.", ["At the customer's choice, delete or return the records unless law requires storage."]);
  alternatives.expected.requirements = [{
    ruleId: "synthetic.retention", actor: "supplier", action: "delete or return", object: "records", modality: "must",
    conditions: ["At the customer's choice"], exceptions: ["Law requires storage"], alternatives: ["Delete", "Return"],
    supportingCitationPaths: [["1"]], dependencies: [],
  }];
  cases.push(alternatives);
  for (const status of ["unsupported", "unreadable"] as const) {
    const example = synthetic(`${status}-input`, `${status} input is explicit rather than a false successful extraction.`, ["Unusable extraction fragment"]);
    example.category = status === "unsupported" ? "unsupported" : "damaged";
    example.expected.provisions = [];
    example.expected.coverageStatus = status;
    example.expected.dispositions = [{ blockId: example.blocks[0].id, status: "unresolved", reason: `${status} input` }];
    cases.push(example);
  }
  return validateCorpus(cases);
}

export function loadPilotCorpus(): EvaluationCase[] {
  return buildPilot();
}

/** An oracle self-check, not output from an implemented ingestion pipeline. */
export function referenceRun(corpus = loadPilotCorpus()): PipelineRun {
  return { schemaVersion: KB_SCHEMA_VERSION, corpusVersion: EVALUATION_CORPUS_VERSION,
    pipelineVersion: "reference-self-check-v1", cases: structuredClone(corpus.map(c => c.expected)) as CaseOutput[] };
}
