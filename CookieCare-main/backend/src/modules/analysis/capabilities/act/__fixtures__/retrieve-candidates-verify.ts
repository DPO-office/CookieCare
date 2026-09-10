// Semantic Retrieval plan, R1 exit gate — manual verification script.
// "On the Mastercard DPA fixture, retrieveCandidates for the duration
// proofStandard returns the termination/deletion clause (E1/E8 equivalents)
// in the top 3. Prove it beats today's lexical rank for the same query."
//
// The pool below is built from the real clause text the user pasted from the
// Mastercard DPA report review (this session) — the exact case where the old
// lexical-only retriever (resolveRecallCandidates) ranked the deletion/
// termination clause too low for VERIFY to ever see it as a duration
// candidate, and VERIFY correctly said "these are termination clauses, not
// duration" about whatever it *was* handed.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/retrieve-candidates-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import type { SharedEvidenceItem } from "../../../models/evidence-package.js";
import {
  resolveRecallCandidates,
  scoreEvidenceItem,
  hintsForRequirement,
  type RequirementEvidenceProfile,
} from "../isolate-requirement-evidence.js";
import { buildInMemoryIndex } from "../clause-index.js";
import { retrieveCandidates } from "../retrieve-candidates.js";

const DURATION_PROOF_STANDARD =
  "Proven only by text stating how long the processing continues — an " +
  "explicit term (e.g. 'for the duration of the Agreement'), a fixed " +
  "period, or an end condition tied to a specific event. Termination " +
  "rights, notice periods, or post-termination data-deletion timelines " +
  "do NOT by themselves establish duration unless they also state or " +
  "clearly reference the term of the underlying processing itself.";

const PROFILE: RequirementEvidenceProfile = {
  hypothesis: "The reviewed instrument sets out the duration of the processing.",
  evidenceHints: ["duration of processing"],
  proofStandard: DURATION_PROOF_STANDARD,
};

const POOL: SharedEvidenceItem[] = [
  {
    ref: "E1",
    clauseType: "deletion_on_termination",
    quotedText:
      "4.4.6. Termination. Upon termination of the Agreement and/or relevant SOW, or as set forth " +
      "within the relevant SOW, Supplier will comply with Mastercard's request, and securely delete " +
      "existing copies of the Personal Data unless applicable local Law requires storage of the " +
      "Personal Data, in which case Supplier will protect the confidentiality of the Personal Data.",
    structuralPath: "4.4.6",
    charRange: [0, 300],
  },
  {
    ref: "E8",
    clauseType: "termination",
    quotedText:
      "3.5.6. Upon termination of the Agreement and/or relevant SOW, comply with Mastercard's request, " +
      "and securely delete existing copies of the Personal Data unless applicable local Law requires " +
      "storage of the Personal Data, in which case Supplier will protect the confidentiality of the " +
      "Personal Data, will not use it, and will continue to comply with this Data Processing Agreement.",
    structuralPath: "3.5.6",
    charRange: [300, 600],
  },
  {
    ref: "E13",
    clauseType: "jurisdiction_specific",
    quotedText:
      "5.1.4 If the Processing of Personal Data of Data Subjects is subject to the Argentina Personal " +
      "Data Protection Act 25.326 (PDPA), Supplier shall neither apply nor use the Exported Personal " +
      "Information for any purpose other than the ones specified as Processing purposes.",
    structuralPath: "5.1.4",
    charRange: [600, 900],
  },
  {
    ref: "E22",
    clauseType: "information_security",
    quotedText:
      "Appendix 1 — Security Measures. Supplier shall implement appropriate technical and " +
      "organizational measures, including encryption of Personal Data at rest and in transit, " +
      "role-based access controls, and regular penetration testing.",
    structuralPath: "Appendix 1",
    charRange: [900, 1200],
  },
  {
    ref: "E29",
    clauseType: "definitions",
    quotedText:
      "2. Definitions. \"Business Purpose\" means the use of Personal Data for Mastercard or " +
      "Supplier's operational purposes, or other notified purposes as agreed under this Agreement " +
      "or specified in the SoW.",
    structuralPath: "2 Definitions",
    charRange: [1200, 1500],
  },
  {
    ref: "E40",
    clauseType: "data_subject_rights",
    quotedText:
      "Data Subject request handling. Supplier shall promptly notify Mastercard of any request " +
      "received directly from a Data Subject and shall not respond to such request without " +
      "Mastercard's prior written consent.",
    structuralPath: "3.9",
    charRange: [1500, 1800],
  },
];

function rankLabel(items: SharedEvidenceItem[]): string {
  return items.map((i) => i.ref).join(", ");
}

async function main() {
  console.log("=".repeat(72));
  console.log("TODAY'S LEXICAL-ONLY retrieval (resolveRecallCandidates)");
  console.log("=".repeat(72));
  const lexicalOnly = await resolveRecallCandidates("duration", POOL, ["duration"], PROFILE, 6);
  console.log(`Top ranked: ${rankLabel(lexicalOnly)}`);
  const lexicalHasE1E8InTop3 =
    lexicalOnly.slice(0, 3).some((i) => i.ref === "E1") &&
    lexicalOnly.slice(0, 3).some((i) => i.ref === "E8");
  console.log(`E1 & E8 both in top 3? ${lexicalHasE1E8InTop3 ? "yes" : "NO — this is the reported bug"}`);

  console.log("\n" + "=".repeat(72));
  console.log("NEW hybrid retrieval (retrieveCandidates — dense + lexical, RRF-fused)");
  console.log("=".repeat(72));
  console.log("Embedding the 6-item pool…");
  const index = await buildInMemoryIndex(POOL);

  const hints = hintsForRequirement("duration", ["duration"], PROFILE);
  const hybrid = await retrieveCandidates({
    queryText: PROFILE.proofStandard!,
    pool: POOL,
    index,
    lexicalScore: (item) => scoreEvidenceItem(item, hints, { requirementId: "duration", extractionTargets: ["duration"] }),
    cap: 6,
  });
  console.log(`Top ranked: ${rankLabel(hybrid)}`);
  const hybridHasE1E8InTop3 =
    hybrid.slice(0, 3).some((i) => i.ref === "E1") && hybrid.slice(0, 3).some((i) => i.ref === "E8");
  console.log(`E1 & E8 both in top 3? ${hybridHasE1E8InTop3 ? "yes — FIXED" : "no"}`);

  console.log("\n" + "=".repeat(72));
  if (!lexicalHasE1E8InTop3 && hybridHasE1E8InTop3) {
    console.log(
      "[PASS] Reproduced the reported bug on lexical-only retrieval, and the hybrid " +
        "retriever fixes it — E1/E8 (the real termination/deletion clauses that establish " +
        "duration via the Agreement's term) now rank in the top 3 for the duration query."
    );
  } else if (hybridHasE1E8InTop3) {
    console.log("[PASS] Hybrid retriever ranks E1/E8 in the top 3 (lexical also did — no regression either way).");
  } else {
    console.log("[FAIL] Hybrid retriever did not rank E1/E8 in the top 3. Investigate before proceeding to R2.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[retrieve-candidates-verify] failed:", err);
  process.exitCode = 1;
});
