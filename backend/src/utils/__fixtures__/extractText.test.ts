/**
 * extractText.test.ts
 *
 * Deterministic unit tests for structure-aware page assembly.
 * Imports the real implementation from pdf-page-assemble.ts.
 *
 * Run from backend/:
 *   node --import ./node_modules/tsx/dist/loader.mjs --test \
 *     src/utils/__fixtures__/extractText.test.ts
 */

process.env.GOOGLE_CLOUD_PROJECT ??= "extract-text-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assemblePageTwoPass,
  assembleSorted,
  type PdfTextItem,
} from "../pdf-page-assemble.js";

function item(
  str: string,
  x: number,
  y: number,
  w = 100,
  _h = 10,
  hasEOL = false
): PdfTextItem {
  return { str, x, y, width: w, hasEOL };
}

function marker(label: string, y: number): PdfTextItem {
  return item(label, 72, y, 17, 10);
}

function body(str: string, y: number, eol = false): PdfTextItem {
  return item(str, 100, y, 420, 9, eol);
}

describe("same-line assignment baseline", () => {
  it("standard case: body below marker is always assigned to that marker", () => {
    const items = [
      marker("1.", 500),
      body("First clause body.", 488),
      body("Second line of first clause.", 476),
      marker("2.", 450),
      body("Second clause body.", 438),
    ];
    const result = assemblePageTwoPass(items);
    const idx1body = result.indexOf("First clause body");
    const idx2body = result.indexOf("Second clause body");
    const idx1marker = result.indexOf("1.");
    const idx2marker = result.indexOf("2.");
    assert.ok(idx1marker >= 0, "Marker 1 must appear");
    assert.ok(idx2marker >= 0, "Marker 2 must appear");
    assert.ok(idx1body > idx1marker, "First body after marker 1");
    assert.ok(idx1body < idx2marker, "First body before marker 2");
    assert.ok(idx2body > idx2marker, "Second body after marker 2");
  });

  it("inlines marker and first body item when they are on the same Y", () => {
    const items = [
      marker("3.1.", 300),
      body("The Supplier shall comply.", 300),
      body("Second line.", 288),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(
      result.includes("3.1. The Supplier shall comply."),
      "Marker and same-line body must be inlined"
    );
  });

  it("genuine preamble above all markers goes first", () => {
    const items = [
      body("DATA PROTECTION ANNEX", 750),
      body("I Whereas:", 738),
      marker("1.", 600),
      body("Clause 1 body.", 588),
    ];
    const result = assemblePageTwoPass(items);
    const idxPreamble = result.indexOf("DATA PROTECTION ANNEX");
    const idxClause = result.indexOf("Clause 1 body.");
    assert.ok(idxPreamble < idxClause, "Preamble must precede clause 1 body");
    assert.ok(idxPreamble === 0, "Preamble must be at the start");
  });
});

describe("Pattern C — re-saved PDF opening-sentence displacement", () => {
  it("ORIGINAL layout: 6.2/6.3/6.4 correct ordering", () => {
    const items = [
      marker("6.2.", 202.8),
      body("If the audit/assessment", 202.8),
      body("cause, Randstad Digital", 189.9, true),
      body("measures taken", 177.5, true),
      body("reasonable cooperation", 165.0, true),
      body("Randstad Digital.", 152.5),
      marker("6.3.", 139.0),
      body("The Supplier's adherence", 139.0, true),
      body("an element by which", 126.1, true),
      body("Protection Annex.", 113.6),
      marker("6.4.", 100.1),
      body("The audit right defined", 100.1, true),
      body("Breach.", 87.2),
    ];
    const result = assemblePageTwoPass(items);

    const idx62 = result.indexOf("6.2.");
    const idx63 = result.indexOf("6.3.");
    const idx64 = result.indexOf("6.4.");
    assert.ok(idx62 >= 0 && idx63 >= 0 && idx64 >= 0);
    assert.ok(idx62 < idx63 && idx63 < idx64);

    const adherenceIdx = result.indexOf("The Supplier's adherence");
    assert.ok(adherenceIdx > idx63);
    assert.ok(adherenceIdx < idx64);
    assert.ok(result.indexOf("The audit right defined") > idx64);
  });

  it("MODIFIED layout: displaced openings go to 6.3 and 6.4, not the previous clause", () => {
    const items = [
      body("If the audit/assessment referred to in article 6.1", 215.1),
      marker("6.2.", 211.1),
      body("cause, Randstad Digital has the right", 202.3, true),
      body("measures taken so that they are in line", 190.3, true),
      body("cooperation with this and immediately implement", 178.3),
      body("The Supplier's adherence to an approved certification mechanism", 166.3, true),
      marker("6.3.", 147.2),
      body("an element by which the Supplier may demonstrate", 154.3, true),
      body("Protection Annex.", 142.3),
      body("The audit right defined in the present clause shall also be applicable", 129.5),
      marker("6.4.", 108.3),
      body("Breach.", 117.5),
      body("4", 46.0),
    ];
    const result = assemblePageTwoPass(items);

    const idx62 = result.indexOf("6.2.");
    const idx63 = result.indexOf("6.3.");
    const idx64 = result.indexOf("6.4.");
    assert.ok(idx62 < idx63 && idx63 < idx64);

    const adherenceIdx = result.indexOf("The Supplier's adherence");
    assert.ok(
      adherenceIdx > idx63,
      `'The Supplier's adherence' must appear AFTER 6.3`
    );
    assert.ok(adherenceIdx < idx64);

    const auditIdx = result.indexOf("The audit right defined");
    assert.ok(auditIdx > idx64, `'The audit right defined' must appear AFTER 6.4`);

    const elementIdx = result.indexOf("an element by which");
    assert.ok(elementIdx > idx63 && elementIdx < idx64);
    assert.ok(!result.includes("\n4\n") && !result.endsWith("\n4"));
  });

  it("MODIFIED 6.3 content matches original 6.3 content", () => {
    const orig = [
      marker("6.3.", 139.0),
      body("The Supplier's adherence to an approved certification mechanism", 139.0, true),
      body("an element by which the Supplier may demonstrate compliance", 126.1, true),
      body("Protection Annex.", 113.6),
    ];
    const mod = [
      body("The Supplier's adherence to an approved certification mechanism", 166.3, true),
      marker("6.3.", 147.2),
      body("an element by which the Supplier may demonstrate compliance", 154.3, true),
      body("Protection Annex.", 142.3),
    ];
    const resultOrig = assemblePageTwoPass(orig);
    const resultMod = assemblePageTwoPass(mod);
    for (const s of [resultOrig, resultMod]) {
      assert.ok(s.includes("The Supplier's adherence"));
      assert.ok(s.includes("an element by which"));
      assert.ok(s.includes("Protection Annex."));
    }
  });

  it("body item ~21 pt above its marker is assigned via content repair, not a global Y radius", () => {
    const items = [
      marker("6.4.", 108.3),
      body("Breach.", 117.5),
      body("audit right", 129.5),
    ];
    const result = assemblePageTwoPass(items);
    const idx64 = result.indexOf("6.4.");
    assert.ok(idx64 >= 0);
    assert.ok(result.indexOf("audit right") > idx64);
    assert.ok(result.indexOf("Breach.") > idx64);
  });

  it("distant capital preamble is not captured by a later marker", () => {
    const items = [
      marker("1.", 200),
      body("Normal body that is long enough not to look like a fragment.", 188),
      body("Too far above", 229),
    ];
    const result = assemblePageTwoPass(items);
    const preambleIdx = result.indexOf("Too far above");
    const markerIdx = result.indexOf("1.");
    assert.ok(
      preambleIdx < markerIdx,
      "Item well above the marker must stay preamble"
    );
  });
});

describe("Pattern A — sentence continuation must not open a new clause", () => {
  it("lowercase continuation after an incomplete sentence stays with the previous clause", () => {
    const items = [
      marker("3.7.", 400),
      body("The Supplier shall ensure that", 388),
      marker("3.8.", 376),
      body("all relevant personnel are bound by confidentiality.", 364),
      marker("3.9.", 320),
      body("The Processor shall implement appropriate measures.", 308),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(
      result.includes("The Supplier shall ensure that"),
      "3.7 body must remain"
    );
    assert.ok(
      result.includes("all relevant personnel"),
      "continuation text must remain"
    );
    // 3.8 must not own the continuation as a separate heading block
    const idx37 = result.indexOf("3.7.");
    const idxCont = result.indexOf("all relevant personnel");
    const idx39 = result.indexOf("3.9.");
    assert.ok(idx37 >= 0 && idxCont > idx37);
    assert.ok(idx39 > idxCont);
    const between = result.slice(idx37, idxCont);
    assert.ok(
      !between.includes("3.8."),
      `continuation must not start a 3.8 clause, got: ${JSON.stringify(between)}`
    );
  });

  it("lowercase first body is demoted even after a completed previous sentence", () => {
    const items = [
      marker("6.1.", 400),
      body("The Controller may audit the facilities used for Processing.", 388),
      marker("6.2.", 376),
      body("processing of Personal Data under this Annex for compliance.", 364),
      marker("6.3.", 320),
      body("The Supplier shall keep records of that audit.", 308),
    ];
    const result = assemblePageTwoPass(items);
    const idx61 = result.indexOf("6.1.");
    const idxProc = result.indexOf("processing of Personal Data");
    const idx63 = result.indexOf("6.3.");
    assert.ok(idx61 >= 0 && idxProc > idx61 && idx63 > idxProc);
    const between = result.slice(idx61, idxProc);
    assert.ok(
      !between.includes("6.2."),
      `lowercase wrap must not open 6.2, got: ${JSON.stringify(between)}`
    );
  });

  it("demotes a marker glued onto a mid-sentence leftover after a completed clause", () => {
    const items = [
      marker("2.2.", 400),
      body("The Processor shall Process Personal Data only on documented instructions.", 388),
      marker("2.3.", 376),
      body("Randstad Digital’s behalf, Supplier shall:", 364),
      marker("2.4.", 320),
      body("Where the Processor is required to Process Personal Data by law it shall notify.", 308),
    ];
    const result = assemblePageTwoPass(items);
    const idx22 = result.indexOf("2.2.");
    const idxWrap = result.indexOf("Randstad Digital");
    const idx24 = result.indexOf("2.4.");
    assert.ok(idx22 >= 0 && idxWrap > idx22 && idx24 > idxWrap);
    const between = result.slice(idx22, idxWrap);
    assert.ok(
      !between.includes("2.3."),
      `wrap leftover must not open 2.3, got: ${JSON.stringify(between)}`
    );
  });

  it("genuine nested list after a colon remains separate clauses", () => {
    const items = [
      marker("3.", 400),
      body("The Supplier shall:", 388),
      marker("3.1.", 376),
      body("process personal data only on documented instructions;", 364),
      marker("3.2.", 352),
      body("implement appropriate technical measures.", 340),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(result.includes("3.1."));
    assert.ok(result.includes("3.2."));
    assert.ok(result.indexOf("3.1.") < result.indexOf("process personal data"));
    assert.ok(result.indexOf("3.2.") < result.indexOf("implement appropriate"));
  });
});

describe("Pattern B — standalone numeric fragments", () => {
  it("footer page number is not emitted as a clause", () => {
    const items = [
      marker("6.4.", 120),
      body("The audit right defined in this clause applies.", 108),
      body("4", 46.0),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(result.includes("6.4."));
    assert.ok(!/(^|\n)4(\n|$)/.test(result), `got: ${JSON.stringify(result)}`);
  });

  it("empty numeric marker with no body is not emitted", () => {
    const items = [
      marker("10.1.", 400),
      body("Sub-processors shall be bound by written terms.", 388),
      marker("11.", 200),
      marker("12.", 150),
      body("This clause governs notices.", 138),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(result.includes("10.1."));
    assert.ok(result.includes("12."));
    assert.ok(
      !result.includes("11."),
      "empty marker 11. must not become its own clause"
    );
  });
});

describe("Fix 2 — Roman numeral same-line grouping", () => {
  it("ORIGINAL: Roman numeral and heading on exact same Y are grouped", () => {
    const items: PdfTextItem[] = [
      item("I.", 121, 441.3, 5, 9),
      item(" ", 126, 441.3, 24, 0),
      item("Annex I.A (List of Parties) shall be formed by...", 144, 441.3, 380, 9, true),
      item("Supplier respectively...", 144, 428.8, 336, 9),
      item("II.", 118.5, 416.3, 7.5, 9),
      item(" ", 126, 416.3, 24, 0),
      item("Annex I.B (Description of Transfer) shall be formed...", 144, 416.3, 379, 9, true),
      item("and/or Agreement which describe the same;", 144, 403.8, 177, 9),
    ];
    const result = assembleSorted(items);
    const idxII = result.indexOf("II.");
    const idxAnnexIB = result.indexOf("Annex I.B");
    assert.ok(idxII >= 0 && idxAnnexIB >= 0);
    const between = result.slice(idxII + 3, idxAnnexIB);
    assert.ok(!between.includes("\n"));
  });

  it("MODIFIED: Roman numeral 2.9pt above its heading text is still grouped", () => {
    const items: PdfTextItem[] = [
      item("I.", 121, 448.1, 5, 9),
      item(" ", 126, 448.1, 24, 0),
      item("Annex I.A (List of Parties) shall be formed by...", 144.1, 450.0, 390, 9, true),
      item("Supplier respectively...", 144.1, 438.0, 337, 9),
      item(
        "Annex I.B (Description of Transfer) shall be formed by the relevant schedule(s)",
        144.1,
        426.0,
        390,
        9,
        true
      ),
      item("II.", 118.5, 423.1, 7.5, 9),
      item("Agreement which describe the same;", 144.1, 414.0, 148, 9),
      item(
        "Annex I.C (Competent Supervisory Authority) shall refer to the supervisory authority responsible",
        144.1,
        402.0,
        390,
        9,
        true
      ),
      item("III.", 116, 398.0, 10, 9),
      item("for supervising Randstad Digital's compliance.", 144.1, 390.0, 371, 9),
    ];
    const result = assembleSorted(items);
    const idxII = result.indexOf("II.");
    const idxAnnexIB = result.indexOf("Annex I.B");
    const between = result.slice(Math.min(idxII, idxAnnexIB), Math.max(idxII, idxAnnexIB));
    assert.ok(!between.includes("\n"));
    const idxIII = result.indexOf("III.");
    const idxAnnexIC = result.indexOf("Annex I.C");
    const betweenIII = result.slice(
      Math.min(idxIII, idxAnnexIC),
      Math.max(idxIII, idxAnnexIC)
    );
    assert.ok(!betweenIII.includes("\n"));
  });

  it("items with 5 pt Y gap are on separate lines", () => {
    const items: PdfTextItem[] = [
      item("Line one.", 100, 200, 200, 9),
      item("Line two.", 100, 195, 200, 9),
    ];
    const result = assembleSorted(items);
    assert.ok(
      result.includes("Line one.\nLine two.") || result.includes("Line two.\nLine one.")
    );
  });

  it("items with 3 pt Y gap are on the same line", () => {
    const items: PdfTextItem[] = [
      item("Part A", 100, 200, 60, 9),
      item("Part B", 165, 197, 60, 9),
    ];
    const result = assembleSorted(items);
    assert.ok(!result.includes("\n"));
  });
});

describe("Regression: 3.4/3.5/3.6 assignment unchanged", () => {
  it("3.4/3.5/3.6 standard layout — each marker captures its own body", () => {
    const items = [
      marker("3.4.", 400),
      body("The Supplier shall ensure that its Employees authorised to Process", 388),
      body("are bound by confidentiality obligations.", 376),
      marker("3.5.", 350),
      body("The Supplier will ensure that its Employees authorised to Process", 338),
      body("have received appropriate training.", 326),
      marker("3.6.", 300),
      body("The Supplier shall notify Randstad Digital within twenty-four hours", 288),
      body("if it detects a Data Security Breach.", 276),
    ];
    const result = assemblePageTwoPass(items);
    const idx34 = result.indexOf("3.4.");
    const idx35 = result.indexOf("3.5.");
    const idx36 = result.indexOf("3.6.");
    assert.ok(idx34 < idx35 && idx35 < idx36);
    assert.ok(result.includes("confidentiality obligations"));
    assert.ok(result.includes("appropriate training"));
    assert.ok(result.includes("Data Security Breach"));
  });
});

describe("Regression: lettered recital assembly", () => {
  it("recitals A/B/C/D with no numeric markers fall through to assembleSorted", () => {
    const items: PdfTextItem[] = [
      item("D. Where the Supplier Services are offered...", 72, 180, 450, 9),
      item("C. The Parties are of the opinion...", 72, 220, 450, 9),
      item("B. Under the Agreement, the Supplier will provide...", 72, 260, 450, 9),
      item("A. This Data Protection Annex forms part of...", 72, 300, 450, 9),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(result.indexOf("A. This Data Protection") < result.indexOf("B. Under the Agreement"));
    assert.ok(result.indexOf("B. Under the Agreement") < result.indexOf("C. The Parties"));
    assert.ok(result.indexOf("C. The Parties") < result.indexOf("D. Where the Supplier"));
  });

  it("recital A with cat sentence added — cat sentence appears in A's text block", () => {
    const items: PdfTextItem[] = [
      item("A. This Data Protection Annex forms part of the Agreement.", 72, 300, 450, 9),
      item("there is a cat in the street. it always meows.", 72, 288, 450, 9),
      item("D. Where the Supplier Services are offered...", 72, 180, 450, 9),
    ];
    const result = assemblePageTwoPass(items);
    const idxA = result.indexOf("A. This Data Protection");
    const idxCat = result.indexOf("there is a cat");
    const idxD = result.indexOf("D. Where the Supplier");
    assert.ok(idxA < idxCat && idxCat < idxD);
  });
});

describe("Regression: pages without numeric markers use assembleSorted", () => {
  it("appendix page with no numeric markers is assembled in Y-desc X-asc order", () => {
    const items: PdfTextItem[] = [
      item("Appendix 1: Data Processing Specifications", 65, 750, 300, 10),
      item("Nature and purpose of the processing", 65, 720, 300, 9),
      item("User onboarding, authentication, and access management.", 65, 700, 400, 9),
    ];
    const result = assemblePageTwoPass(items);
    assert.ok(result.indexOf("Appendix 1") < result.indexOf("Nature and purpose"));
    assert.ok(result.indexOf("Nature and purpose") < result.indexOf("User onboarding"));
  });
});

// ─── P0-1: stitchCrossPageMarkers ────────────────────────────────────────────

import { stitchCrossPageMarkers } from "../extractText.js";

describe("stitchCrossPageMarkers (P0-1 — cross-page clause heading fix)", () => {

  // ── Core case: marker at page end stitched to next page ───────────────────

  it("moves a bare numeric marker from the last non-empty line of page N to the top of page N+1", () => {
    const page1 = "4. Confidentiality\nThe Supplier shall keep all data confidential.\n5.";
    const page2 = "Data Protection\nThe Supplier shall comply with GDPR.";

    const result = stitchCrossPageMarkers([page1, page2]);

    // Page 1 must have the marker removed
    const p1Lines = result[0].split("\n").filter((l) => l.trim() !== "");
    const lastP1 = p1Lines[p1Lines.length - 1].trim();
    assert.notEqual(lastP1, "5.", "marker '5.' must be removed from page 1");

    // Page 2 must start with the marker
    const p2Lines = result[1].split("\n");
    assert.equal(p2Lines[0].trim(), "5.", "marker '5.' must be prepended to page 2");

    // Body of page 2 must still be present
    assert.ok(result[1].includes("Data Protection"), "page 2 body must be preserved");
    assert.ok(result[1].includes("The Supplier shall comply"), "page 2 body must be preserved");
  });

  it("stitches a dotted sub-section marker (e.g. '3.2.') to the next page", () => {
    const page1 = "3.1. Payment Terms\nPayment shall be due within thirty days.\n3.2.";
    const page2 = "Reporting Obligations\nThe Supplier shall report monthly.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.ok(!result[0].trimEnd().endsWith("3.2."), "3.2. must be removed from page 1 end");
    assert.ok(result[1].startsWith("3.2."), "3.2. must be at the start of page 2");
    assert.ok(result[1].includes("Reporting Obligations"), "page 2 body preserved");
  });

  it("stitches a marker when there is trailing whitespace after it on page N", () => {
    const page1 = "2. Obligations\nBody text here.\n7.   \n  ";
    const page2 = "Audit Rights\nThe Controller may audit annually.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.ok(result[1].startsWith("7."), "marker '7.' must be at the top of page 2");
    assert.ok(result[1].includes("Audit Rights"), "page 2 body preserved");
  });

  // ── Edge case: marker is the only content on the page ────────────────────

  it("handles a page that contains only the marker — page N becomes effectively empty", () => {
    const page1 = "3. Obligations\nThe Supplier shall comply with all applicable law.";
    const page2 = "4.";
    const page3 = "Term and Termination\nThis agreement shall remain in force for two years.";

    const result = stitchCrossPageMarkers([page1, page2, page3]);

    // page2 had only "4." — after consuming it, we check page3 gets it
    assert.ok(result[2].startsWith("4."), "marker '4.' must be at the top of page 3");
    assert.ok(result[2].includes("Term and Termination"), "page 3 body preserved");
  });

  // ── Negative cases: must NOT stitch ──────────────────────────────────────

  it("does NOT stitch when the last line is ordinary body text (not a marker)", () => {
    const page1 = "3. Obligations\nThe Supplier shall comply with all applicable Data Protection Law.";
    const page2 = "4. Term\nThis agreement remains in force for two years.";

    const result = stitchCrossPageMarkers([page1, page2]);

    // pages must be unchanged
    assert.equal(result[0], page1, "page 1 must be unchanged — no marker at end");
    assert.equal(result[1], page2, "page 2 must be unchanged — no stitch occurred");
  });

  it("does NOT stitch when a marker appears mid-page, not as the last non-empty line", () => {
    // "5." appears mid-page, followed by body text — must not be stitched
    const page1 = "4. Payment\nFees are due monthly.\n5.\nData Protection\nCompliance required.";
    const page2 = "6. Term\nTwo year term.";

    const result = stitchCrossPageMarkers([page1, page2]);

    // page 1 must be unchanged — "5." is not the last non-empty line
    assert.equal(result[0], page1, "page 1 must be unchanged — '5.' is not the last line");
    assert.equal(result[1], page2, "page 2 must be unchanged — no stitch should occur");
  });

  it("does NOT stitch when the last line looks like a marker but has extra text (not bare)", () => {
    // "5. Data Protection" is not bare — has trailing content
    const page1 = "4. Term\nFees are due.\n5. Data Protection";
    const page2 = "The Supplier shall comply with GDPR.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.equal(result[0], page1, "page 1 unchanged — '5. Data Protection' is not a bare marker");
    assert.equal(result[1], page2, "page 2 unchanged");
  });

  it("does NOT stitch when there is only one page (no next page to stitch to)", () => {
    const page1 = "3. Obligations\nBody text.\n4.";

    const result = stitchCrossPageMarkers([page1]);

    assert.equal(result[0], page1, "single-page input must be returned unchanged");
  });

  it("does NOT stitch an empty page", () => {
    const result = stitchCrossPageMarkers(["", "4. Term\nBody text."]);
    assert.equal(result[0], "", "empty page 1 must stay empty");
    assert.equal(result[1], "4. Term\nBody text.", "page 2 must be unchanged");
  });

  // ── Exact-copy baseline must remain unchanged ─────────────────────────────

  it("identical two-page document with no trailing markers produces identical output", () => {
    const page1 = "1. Definitions\nPersonal Data means any information relating to an identified person.\n2. Scope\nThis agreement applies to all processing activities.";
    const page2 = "3. Obligations\nThe Supplier shall comply with applicable data protection law.\n4. Liability\nNeither party shall be liable for indirect losses.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.equal(result[0], page1, "page 1 unchanged — no trailing marker");
    assert.equal(result[1], page2, "page 2 unchanged — no trailing marker");
  });

  // ── pageBreaks integrity after stitch ─────────────────────────────────────

  it("page break offsets computed after stitching are consistent with the joined text", () => {
    // Simulate extractPdfWithPdfJs pageBreaks computation on stitched pages
    const page1 = "4. Confidentiality\nBody text.\n5.";
    const page2 = "Data Protection\nCompliance body.";

    const stitched = stitchCrossPageMarkers([page1, page2]);

    // Recompute pageBreaks the same way extractPdfWithPdfJs does
    const pageBreaks: number[] = [0];
    let cumulative = 0;
    for (let i = 0; i < stitched.length - 1; i++) {
      cumulative += stitched[i].length + 1; // +1 for "\n"
      pageBreaks.push(cumulative);
    }

    const joined = stitched.join("\n");

    // pageBreaks[0] must always be 0
    assert.equal(pageBreaks[0], 0, "pageBreaks[0] must be 0");

    // pageBreaks[1] must point exactly to the start of page 2 in the joined text
    assert.equal(
      joined[pageBreaks[1]],
      stitched[1][0],
      "pageBreaks[1] must point to the first char of page 2 in the joined string"
    );
  });

  // ── Multi-page stitch: multiple markers across pages ─────────────────────

  it("stitches independently across multiple page boundaries", () => {
    const pages = [
      "1. Scope\nThis agreement applies.\n2.",
      "Obligations\nThe Supplier shall comply.\n3.",
      "Data Protection\nGDPR applies here.",
    ];

    const result = stitchCrossPageMarkers(pages);

    // page 1: "2." removed from end
    assert.ok(!result[0].trimEnd().endsWith("2."), "page 1: '2.' removed from end");

    // page 2: starts with "2.", ends without "3."
    assert.ok(result[1].startsWith("2."), "page 2: starts with '2.'");
    assert.ok(!result[1].trimEnd().endsWith("3."), "page 2: '3.' removed from end");

    // page 3: starts with "3."
    assert.ok(result[2].startsWith("3."), "page 3: starts with '3.'");
    assert.ok(result[2].includes("Data Protection"), "page 3: body preserved");
  });

  // ── Parenthesis-style marker: "5)" ────────────────────────────────────────

  it("stitches a parenthesis-style bare marker ('5)') to the next page", () => {
    const page1 = "4) Term\nTwo year initial term.\n5)";
    const page2 = "Data Protection Obligations\nMust comply with GDPR.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.ok(result[1].startsWith("5)"), "marker '5)' must be at top of page 2");
    assert.ok(result[1].includes("Data Protection"), "page 2 body preserved");
  });

  // ── Regression: normal pages with numeric text in the body are not affected ─

  it("body text ending with a year number (e.g. '2024') is not stitched", () => {
    const page1 = "2. Term\nThis agreement was entered into in 2024";
    const page2 = "3. Obligations\nCompliance required.";

    const result = stitchCrossPageMarkers([page1, page2]);

    assert.equal(result[0], page1, "page ending with '2024' must not be stitched");
    assert.equal(result[1], page2, "page 2 unchanged");
  });
});
