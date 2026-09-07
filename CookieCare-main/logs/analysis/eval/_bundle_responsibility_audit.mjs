import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(
  path.resolve("backend/package.json")
);
const mammoth = require("mammoth");

const BITRIX =
  "C:/Users/abhinav.yadav_randst/Downloads/DPA - 1.docx";
const OUT_DIR = "logs/analysis/eval";

async function extractDocx(docxPath, outTxt) {
  const buf = fs.readFileSync(docxPath);
  const r = await mammoth.extractRawText({ buffer: buf });
  fs.writeFileSync(outTxt, r.value, "utf8");
  return r.value;
}

function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ");
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
  const b = ev.find(
    (e) => e.event === "compliance.bundle.created" && e.requirementId === req
  );
  return {
    bundleId: b?.bundleId,
    estimatedTokens: b?.estimatedTokens,
    items: b?.items || [],
  };
}

function verifyMap(ev, req) {
  return ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" && e.requirementId === req
    )
    .map((e) => ({
      el: e.elementId,
      state: e.state,
      cites: (e.evidenceSpanIds || []).slice(0, 5),
    }));
}

function assessOf(ev, req) {
  return ev
    .filter(
      (e) =>
        (e.event === "compliance.assess.requirement" ||
          e.event === "assess.requirement" ||
          e.event === "compliance.assess.result") &&
        e.requirementId === req
    )
    .map((e) => ({
      event: e.event,
      status: e.status,
      reasonCodes: e.reasonCodes || e.codes || [],
    }));
}

function findInBundle(items, re) {
  return items
    .filter((i) => re.test((i.structuralPath || "") + "\n" + (i.quotedText || "")))
    .map((i) => ({
      path: i.structuralPath,
      len: (i.quotedText || "").length,
      quote: norm(i.quotedText || "").slice(0, 280),
    }));
}

function docContains(doc, re) {
  return re.test(doc);
}

function window(doc, re, pad = 120) {
  const m = norm(doc).match(re);
  if (!m || m.index == null) return null;
  const i = m.index;
  return norm(doc).slice(Math.max(0, i - pad), i + m[0].length + pad);
}

async function main() {
  const bxText = await extractDocx(
    BITRIX,
    path.join(OUT_DIR, "_bitrix_from_docx_now.txt")
  );

  const bxLog = "logs/analysis/an_ff125c81-71fb-4f3e-bb8f-57011885fbae.compliance.log";
  const mcLog = "logs/analysis/an_91c6b78b-ee53-41bc-a71b-3203c3f56695.compliance.log";

  const bxEv = loadEvents(bxLog);
  const mcEv = loadEvents(mcLog);

  const bxG = bundleItems(bxEv, "art28_3_g_deletion_return");
  const bxF = bundleItems(bxEv, "art28_3_f_security_assistance");
  const mcG = bundleItems(mcEv, "art28_3_g_deletion_return");
  const mcF = bundleItems(mcEv, "art28_3_f_security_assistance");

  // Reconstruct MC "document" from all unique quotes across bundles (proxy if no source file)
  const allMcQuotes = mcEv
    .filter((e) => e.event === "compliance.bundle.created")
    .flatMap((e) => (e.items || []).map((i) => i.quotedText || ""))
    .join("\n\n");
  fs.writeFileSync(
    path.join(OUT_DIR, "_mastercard_reconstructed_from_bundles.txt"),
    allMcQuotes,
    "utf8"
  );

  // Also try to find MC docx on disk
  const searchRoots = [
    "C:/Users/abhinav.yadav_randst/Downloads",
    "C:/Users/abhinav.yadav_randst/Desktop",
    "C:/Users/abhinav.yadav_randst/Documents",
  ];
  const foundDocs = [];
  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      if (!/\.(docx|pdf)$/i.test(name)) continue;
      if (!/master|card|dpa|mdpa|cisco|supplier/i.test(name)) continue;
      foundDocs.push(path.join(root, name));
    }
  }

  let mcSourceText = "";
  let mcSourcePath = null;
  for (const p of foundDocs) {
    if (/\.docx$/i.test(p)) {
      try {
        const t = await extractDocx(
          p,
          path.join(OUT_DIR, `_mc_extract_${path.basename(p)}.txt`)
        );
        if (/Mastercard|Return and Deletion of Personal Data/i.test(t)) {
          mcSourceText = t;
          mcSourcePath = p;
          break;
        }
      } catch (e) {
        /* skip */
      }
    }
  }
  if (!mcSourceText) mcSourceText = allMcQuotes;

  // Bitrix document truth
  const bxTruth = {
    source: BITRIX,
    chars: bxText.length,
    g2_delete: docContains(bxText, /Deletion on Term Expiry|instructs Alaio to delete/i),
    g3_return_obligation: docContains(
      bxText,
      /shall return|must return|return all (the )?personal data|return the (same|personal data)|export (the )?personal data/i
    ),
    g1_chooser: docContains(
      bxText,
      /at the (choice|option)|sole option|delete or return|return or delete|return and deletion/i
    ),
    g4_proviso: docContains(bxText, /unless any applicable law requires storage/i),
    f3_dpia: docContains(bxText, /DATA PROTECTION IMPACT ASSESSMENT|Articles 35 and 36/i),
    g4_window: window(bxText, /unless any applicable law requires storage/i),
    f3_window: window(bxText, /DATA PROTECTION IMPACT ASSESSMENT[\s\S]{0,200}/i),
    // false friends: "return" word alone
    return_word_count: (bxText.match(/\breturn\b/gi) || []).length,
  };

  // Mastercard truth from source or reconstructed
  const mcTruth = {
    source: mcSourcePath || "reconstructed_from_bundles",
    chars: mcSourceText.length,
    foundDocs,
    g1_chooser: docContains(
      mcSourceText,
      /sole option|at .{0,40}option.{0,80}(delete|return)|(return and deletion)/i
    ),
    g2_delete: docContains(mcSourceText, /securely delete|Return and Deletion/i),
    g3_return: docContains(
      mcSourceText,
      /or return the same|return the same to Mastercard|Return and Deletion/i
    ),
    g4_proviso: docContains(
      mcSourceText,
      /unless applicable local law requires storage/i
    ),
    f3_dpia: docContains(
      mcSourceText,
      /data protection impact assessment/i
    ),
    c356_window: window(
      mcSourceText,
      /3\.5\.6 Return and Deletion[\s\S]{0,500}/i
    ),
    c355_window: window(
      mcSourceText,
      /3\.5\.5 Cooperation and Assistance[\s\S]{0,400}/i
    ),
  };

  // Bundle correctness: critical spans present?
  const bxBundleAudit = {
    g: {
      itemCount: bxG.items.length,
      tokens: bxG.estimatedTokens,
      has_2_5: findInBundle(bxG.items, /clause-2\.5|Deletion on Term Expiry/i),
      has_proviso: findInBundle(
        bxG.items,
        /unless any applicable law requires storage/i
      ),
      has_false_return: findInBundle(
        bxG.items,
        /shall return|return all personal data|return or delete/i
      ),
      topPaths: [...new Set(bxG.items.map((i) => i.structuralPath))].slice(0, 15),
    },
    f: {
      itemCount: bxF.items.length,
      has_10_dpia: findInBundle(
        bxF.items,
        /clause-10|DATA PROTECTION IMPACT|Articles 35 and 36/i
      ),
      has_6_4: findInBundle(bxF.items, /clause-6\.4|6\.4 /i),
    },
    verifyG: verifyMap(bxEv, "art28_3_g_deletion_return"),
    verifyF: verifyMap(bxEv, "art28_3_f_security_assistance"),
    assessG: assessOf(bxEv, "art28_3_g_deletion_return"),
    assessF: assessOf(bxEv, "art28_3_f_security_assistance"),
  };

  const mcBundleAudit = {
    g: {
      itemCount: mcG.items.length,
      tokens: mcG.estimatedTokens,
      has_3_5_6: findInBundle(
        mcG.items,
        /clause-3\.5\.6|Return and Deletion of Personal Data/i
      ),
      has_proviso: findInBundle(
        mcG.items,
        /unless applicable local law requires storage/i
      ),
      has_return: findInBundle(
        mcG.items,
        /or return the same|return the same to Mastercard/i
      ),
      has_chooser: findInBundle(mcG.items, /sole option/i),
      topPaths: [...new Set(mcG.items.map((i) => i.structuralPath))].slice(0, 15),
    },
    f: {
      itemCount: mcF.items.length,
      has_3_5_5_dpia: findInBundle(
        mcF.items,
        /clause-3\.5\.5|data protection impact assessment/i
      ),
    },
    verifyG: verifyMap(mcEv, "art28_3_g_deletion_return"),
    verifyF: verifyMap(mcEv, "art28_3_f_security_assistance"),
    assessG: assessOf(mcEv, "art28_3_g_deletion_return"),
    assessF: assessOf(mcEv, "art28_3_f_security_assistance"),
  };

  // Final responsibility verdicts
  const verdict = {
    bitrix: {
      doc_return_absent: !bxTruth.g3_return_obligation && !bxTruth.g1_chooser,
      bundle_has_delete_2_5: bxBundleAudit.g.has_2_5.length > 0,
      bundle_has_g4_proviso: bxBundleAudit.g.has_proviso.length > 0,
      bundle_does_not_fabricate_return:
        bxBundleAudit.g.has_false_return.length === 0,
      bundle_has_f3: bxBundleAudit.f.has_10_dpia.length > 0,
      matrix_g3_not_located_correct:
        bxBundleAudit.verifyG.find((x) => x.el === "G3")?.state ===
        "not_located",
      matrix_g1_not_located_correct:
        bxBundleAudit.verifyG.find((x) => x.el === "G1")?.state ===
        "not_located",
      matrix_g4_should_be_supported_but_is:
        bxBundleAudit.verifyG.find((x) => x.el === "G4")?.state,
      bundleSideOk:
        bxBundleAudit.g.has_2_5.length > 0 &&
        bxBundleAudit.g.has_proviso.length > 0 &&
        bxBundleAudit.g.has_false_return.length === 0 &&
        bxBundleAudit.f.has_10_dpia.length > 0,
      failureLayer:
        bxBundleAudit.g.has_proviso.length > 0 &&
        bxBundleAudit.verifyG.find((x) => x.el === "G4")?.state !== "supported"
          ? "phase4B_matcher_not_bundle"
          : "check",
    },
    mastercard: {
      bundle_has_3_5_6: mcBundleAudit.g.has_3_5_6.length > 0,
      bundle_has_chooser: mcBundleAudit.g.has_chooser.length > 0,
      bundle_has_return: mcBundleAudit.g.has_return.length > 0,
      bundle_has_proviso: mcBundleAudit.g.has_proviso.length > 0,
      bundle_has_f3_dpia: mcBundleAudit.f.has_3_5_5_dpia.length > 0,
      matrix_g1: mcBundleAudit.verifyG.find((x) => x.el === "G1")?.state,
      matrix_g3: mcBundleAudit.verifyG.find((x) => x.el === "G3")?.state,
      matrix_g4: mcBundleAudit.verifyG.find((x) => x.el === "G4")?.state,
      matrix_f3: mcBundleAudit.verifyF.find((x) => x.el === "F3")?.state,
      bundleSideOk:
        mcBundleAudit.g.has_3_5_6.length > 0 &&
        mcBundleAudit.g.has_chooser.length > 0 &&
        mcBundleAudit.g.has_return.length > 0 &&
        mcBundleAudit.g.has_proviso.length > 0 &&
        mcBundleAudit.f.has_3_5_5_dpia.length > 0,
      failureLayer: null,
    },
  };
  verdict.mastercard.failureLayer = verdict.mastercard.bundleSideOk
    ? "phase4B_matcher_not_bundle"
    : "bundle_or_doc_gap";

  const out = {
    checkedAt: new Date().toISOString(),
    sessions: {
      bitrix: "an_ff125c81-71fb-4f3e-bb8f-57011885fbae",
      mastercard: "an_91c6b78b-ee53-41bc-a71b-3203c3f56695",
    },
    bxTruth,
    mcTruth,
    bxBundleAudit,
    mcBundleAudit,
    verdict,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "_bundle_responsibility_audit.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
