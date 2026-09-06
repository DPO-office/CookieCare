import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { execSync } from "child_process";

const require = createRequire(path.resolve("backend/package.json"));
const mammoth = require("mammoth");

const OUT = "logs/analysis/eval/_bundle_audit_final.json";
const BITRIX = "C:/Users/abhinav.yadav_randst/Downloads/DPA - 1.docx";
const MC_PDF =
  "C:/Users/abhinav.yadav_randst/Downloads/Mastercard_Data_Processing_Agreement.pdf";

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function loadEvents(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function bundleItems(ev, req) {
  return (
    ev.find(
      (e) =>
        e.event === "compliance.bundle.created" && e.requirementId === req
    )?.items || []
  );
}

function verifyMap(ev, req) {
  return ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" && e.requirementId === req
    )
    .map((e) => `${e.elementId}=${e.state}`);
}

function assess(ev, req) {
  const a = ev.find(
    (e) =>
      e.event === "compliance.assess.result" && e.requirementId === req
  );
  return a
    ? { status: a.status, reasonCodes: a.reasonCodes || [] }
    : null;
}

function hits(items, re) {
  return items
    .filter((i) => re.test(norm(i.quotedText) + " " + norm(i.structuralPath)))
    .map((i) => ({
      path: i.structuralPath,
      len: (i.quotedText || "").length,
      q: norm(i.quotedText).slice(0, 240),
    }));
}

async function extractBitrix() {
  const r = await mammoth.extractRawText({
    buffer: fs.readFileSync(BITRIX),
  });
  return r.value;
}

function extractPdf(pdfPath) {
  // Use pdf-parse-fork from backend if available
  try {
    const pdfParse = require("pdf-parse-fork");
    const data = fs.readFileSync(pdfPath);
    // pdf-parse may be sync-unfriendly; use dynamic
    return pdfParse(data).then((d) => d.text);
  } catch (e) {
    return Promise.reject(e);
  }
}

async function main() {
  const bxDoc = await extractBitrix();
  let mcDoc = "";
  let mcSource = "none";
  try {
    mcDoc = await extractPdf(MC_PDF);
    mcSource = MC_PDF;
    fs.writeFileSync(
      "logs/analysis/eval/_mastercard_from_pdf.txt",
      mcDoc,
      "utf8"
    );
  } catch (e) {
    mcSource = `pdf_extract_failed:${e.message}`;
  }

  const bxEv = loadEvents(
    "logs/analysis/an_ff125c81-71fb-4f3e-bb8f-57011885fbae.compliance.log"
  );
  const mcEv = loadEvents(
    "logs/analysis/an_91c6b78b-ee53-41bc-a71b-3203c3f56695.compliance.log"
  );

  const bxG = bundleItems(bxEv, "art28_3_g_deletion_return");
  const bxF = bundleItems(bxEv, "art28_3_f_security_assistance");
  const mcG = bundleItems(mcEv, "art28_3_g_deletion_return");
  const mcF = bundleItems(mcEv, "art28_3_f_security_assistance");

  // If PDF extract empty, use bundle reconstruction
  if (!mcDoc || mcDoc.length < 500) {
    mcDoc = mcEv
      .filter((e) => e.event === "compliance.bundle.created")
      .flatMap((e) => (e.items || []).map((i) => i.quotedText || ""))
      .join("\n");
    mcSource = "reconstructed_from_bundles_fallback";
  }

  const bxDocN = norm(bxDoc);
  const mcDocN = norm(mcDoc);

  const bitrixDocTruth = {
    source: BITRIX,
    chars: bxDoc.length,
    return_word_count: (bxDoc.match(/\breturn\b/gi) || []).length,
    has_g2_delete: /deletion on term expiry|instructs alaio to delete/.test(
      bxDocN
    ),
    has_g3_return_obligation:
      /shall return|must return|return all personal data|return the personal data|return the same/.test(
        bxDocN
      ),
    has_g1_chooser:
      /at the (choice|option)|sole option|delete or return|return or delete|return and deletion/.test(
        bxDocN
      ),
    has_g4_proviso: /unless any applicable law requires storage/.test(bxDocN),
    has_f3_dpia:
      /data protection impact assessment/.test(bxDocN) &&
      /articles 35 and 36/.test(bxDocN),
  };

  const mcDocTruth = {
    source: mcSource,
    chars: mcDoc.length,
    has_356: /3\.5\.6 return and deletion of personal data/.test(mcDocN),
    has_g1_sole_option: /sole option/.test(mcDocN),
    has_g2_delete: /securely delete/.test(mcDocN),
    has_g3_return: /or return the same|return the same to mastercard/.test(
      mcDocN
    ),
    has_g4_proviso: /unless applicable local law requires storage/.test(
      mcDocN
    ),
    has_f3_dpia: /data protection impact assessment/.test(mcDocN),
    quote_356: (() => {
      const i = mcDocN.indexOf("3.5.6 return and deletion");
      return i < 0 ? null : mcDocN.slice(i, i + 450);
    })(),
    quote_355: (() => {
      const i = mcDocN.indexOf("3.5.5 cooperation and assistance");
      return i < 0 ? null : mcDocN.slice(i, i + 420);
    })(),
  };

  const bxBundle = {
    g_count: bxG.length,
    has_clause_2_5: hits(bxG, /clause-2\.5(?!\.)|deletion on term expiry/),
    has_g4_proviso: hits(bxG, /unless any applicable law requires storage/),
    has_fabricated_return: hits(
      bxG,
      /shall return|return all personal data|return or delete|or return the same/
    ),
    f_has_10: hits(bxF, /clause-10|data protection impact assessment/),
    f_has_6_4: hits(bxF, /clause-6\.4|security assistance/),
    verifyG: verifyMap(bxEv, "art28_3_g_deletion_return"),
    verifyF: verifyMap(bxEv, "art28_3_f_security_assistance"),
    assessG: assess(bxEv, "art28_3_g_deletion_return"),
    assessF: assess(bxEv, "art28_3_f_security_assistance"),
  };

  const mcBundle = {
    g_count: mcG.length,
    has_356: hits(mcG, /clause-3\.5\.6|return and deletion of personal data/),
    has_chooser_sole_option: hits(mcG, /sole option/),
    has_return: hits(mcG, /or return the same|return the same to mastercard/),
    has_g4_proviso: hits(mcG, /unless applicable local law requires storage/),
    f_has_355_dpia: hits(
      mcF,
      /clause-3\.5\.5|data protection impact assessment/
    ),
    verifyG: verifyMap(mcEv, "art28_3_g_deletion_return"),
    verifyF: verifyMap(mcEv, "art28_3_f_security_assistance"),
    assessG: assess(mcEv, "art28_3_g_deletion_return"),
    assessF: assess(mcEv, "art28_3_f_security_assistance"),
  };

  // Full 356 quote from bundle (normalized)
  const c356 = mcG.find((i) => i.structuralPath === "clause-3.5.6");
  const c355 = mcF.find((i) => i.structuralPath === "clause-3.5.5");
  const c25 = bxG.find((i) => i.structuralPath === "clause-2.5");

  const responsibility = {
    bitrix_bundle_side: {
      ok:
        bitrixDocTruth.has_g2_delete &&
        bxBundle.has_clause_2_5.length > 0 &&
        bitrixDocTruth.has_g4_proviso &&
        bxBundle.has_g4_proviso.length > 0 &&
        !bitrixDocTruth.has_g3_return_obligation &&
        bxBundle.has_fabricated_return.length === 0 &&
        bitrixDocTruth.has_f3_dpia &&
        bxBundle.f_has_10.length > 0,
      notes: [
        "Return/chooser ABSENT in DOCX — G1/G3 not_located is CORRECT",
        "§2.5 delete + G4 proviso ARE in DOCX and in (g) bundle — bundle OK",
        "§10 DPIA IS in DOCX and in (f) bundle — bundle OK",
        "G4 matrix not_located despite bundle proviso = Phase 4B matcher bug",
      ],
    },
    mastercard_bundle_side: {
      ok:
        mcBundle.has_356.length > 0 &&
        mcBundle.has_chooser_sole_option.length > 0 &&
        mcBundle.has_return.length > 0 &&
        mcBundle.has_g4_proviso.length > 0 &&
        mcBundle.f_has_355_dpia.length > 0,
      notes: [
        "§3.5.6 with sole option + delete/return + retention IS in (g) bundle",
        "§3.5.5 DPIA language IS in (f) bundle",
        "G1/G4/F3 matrix misses = Phase 4B matcher bug, not bundle failure",
      ],
    },
    clause_quotes_in_bundles: {
      bitrix_2_5: c25 ? norm(c25.quotedText) : null,
      mc_3_5_6: c356 ? norm(c356.quotedText) : null,
      mc_3_5_5: c355 ? norm(c355.quotedText).slice(0, 500) : null,
    },
  };

  const out = {
    checkedAt: new Date().toISOString(),
    sessions: {
      bitrix: "an_ff125c81-71fb-4f3e-bb8f-57011885fbae",
      mastercard_newest: "an_91c6b78b-ee53-41bc-a71b-3203c3f56695",
    },
    bitrixDocTruth,
    mcDocTruth,
    bxBundle,
    mcBundle,
    responsibility,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
