// ACT-Phase 4 manual verification script — the 5 adversarial VERIFY cases.
// Not wired into any real ACT run; standalone test of verifyProposition()
// in isolation, per the phase plan's exit gate: "run the test file, read
// every verdict + quote by hand against your own judgment."
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/verify-proposition.test.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { verifyProposition } from "../verify-proposition.js";

const DURATION_PROOF_STANDARD =
  "Proven only by text stating how long the processing continues — an " +
  "explicit term (e.g. 'for the duration of the Agreement'), a fixed " +
  "period, or an end condition tied to a specific event. Termination " +
  "rights, notice periods, or post-termination data-deletion timelines " +
  "do NOT by themselves establish duration unless they also state or " +
  "clearly reference the term of the underlying processing itself.";

const CONFIDENTIALITY_PROOF_STANDARD =
  "Proven only by text imposing an obligation to keep information secret " +
  "and not disclose it to third parties without authorization. Security " +
  "measures (encryption, access controls, technical safeguards protecting " +
  "data from breach) are a different obligation and do NOT establish " +
  "confidentiality unless the text also restricts disclosure to others.";

interface Case {
  label: string;
  hypothesis: string;
  proofStandard: string;
  candidatePassage: string;
  candidateLocator?: string;
  expectedVerdict: string;
  why: string;
}

const CASES: Case[] = [
  {
    label: "1. Duration vs. termination language (should NOT prove — classic false positive)",
    hypothesis: "The contract sets out the duration of the processing.",
    proofStandard: DURATION_PROOF_STANDARD,
    candidatePassage:
      "Either party may terminate this Agreement for convenience upon 30 days' " +
      "written notice to the other party. Upon termination, Processor shall " +
      "delete or return all Personal Data within 30 days.",
    candidateLocator: "§9.1 Termination",
    expectedVerdict: "related_not_proof",
    why:
      "Classic trap: termination/deletion timelines are on-topic (both are time-shaped) " +
      "but say nothing about how long the PROCESSING itself lasts.",
  },
  {
    label: "2. Duration vs. a real term clause (should prove)",
    hypothesis: "The contract sets out the duration of the processing.",
    proofStandard: DURATION_PROOF_STANDARD,
    candidatePassage:
      "This Data Processing Agreement shall remain in effect for the duration " +
      "of the underlying Master Services Agreement, and Processor shall " +
      "process Personal Data only for so long as the Services are being provided.",
    candidateLocator: "§2.3 Term",
    expectedVerdict: "proves",
    why:
      "States an explicit end condition tied to the underlying agreement's term — " +
      "exactly what the proof standard asks for.",
  },
  {
    label: "3. Confidentiality vs. security clause (should NOT prove — the other classic trap)",
    hypothesis: "The contract imposes a confidentiality obligation.",
    proofStandard: CONFIDENTIALITY_PROOF_STANDARD,
    candidatePassage:
      "Processor shall implement appropriate technical and organizational " +
      "measures, including encryption of Personal Data at rest and in transit, " +
      "role-based access controls, and regular penetration testing, to protect " +
      "against unauthorized access, loss, or destruction of Personal Data.",
    candidateLocator: "§6.1 Security Measures",
    expectedVerdict: "related_not_proof",
    why:
      "Security measures protect against breach/loss — a different obligation from " +
      "a duty not to disclose. No disclosure restriction is stated here.",
  },
  {
    label: "4. Affirmative-indefinite contradiction (should contradict, not just fail to prove)",
    hypothesis: "The contract sets a fixed duration for the processing.",
    proofStandard: DURATION_PROOF_STANDARD,
    candidatePassage:
      "This Agreement shall continue in perpetuity and shall have no fixed " +
      "term or expiration date, notwithstanding any other provision herein.",
    candidateLocator: "§2.1 Term",
    expectedVerdict: "contradicts",
    why:
      "This doesn't just fail to state a term — it affirmatively asserts there is " +
      "NO fixed term, which is the opposite of the hypothesis.",
  },
  {
    label: "5. Fabricated-quote rejection (model claims 'proves' but the quote isn't really there)",
    hypothesis: "The contract sets out the duration of the processing.",
    proofStandard: DURATION_PROOF_STANDARD,
    candidatePassage:
      "Processor shall comply with all applicable data protection laws and " +
      "shall notify Customer promptly of any changes to its subprocessors.",
    candidateLocator: "§4.2 Subprocessors",
    expectedVerdict: "irrelevant or related_not_proof (never proves — nothing about duration is here)",
    why:
      "This passage has NOTHING about duration in it at all. If the model claims " +
      "'proves' with any quote, quoteAppearsIn() should either fail to verify it " +
      "(if the quote is fabricated/hallucinated) or the quote — if genuinely copied " +
      "verbatim from this passage — cannot actually establish duration, which would " +
      "itself be a model reasoning error worth flagging by hand.",
  },
];

async function main() {
  let idx = 0;
  for (const c of CASES) {
    idx += 1;
    console.log(`\n${"=".repeat(70)}`);
    console.log(c.label);
    console.log("=".repeat(70));
    console.log(`Hypothesis: ${c.hypothesis}`);
    console.log(`Passage (${c.candidateLocator ?? "no locator"}): "${c.candidatePassage}"`);
    console.log(`Expected: ${c.expectedVerdict}`);
    console.log(`Why: ${c.why}`);

    const result = await verifyProposition({
      hypothesis: c.hypothesis,
      proofStandard: c.proofStandard,
      candidatePassage: c.candidatePassage,
      candidateLocator: c.candidateLocator,
    });

    console.log("\n--- VERIFY RESULT ---");
    console.log(`verdict:       ${result.verdict}`);
    console.log(`quote:         "${result.quote}"`);
    console.log(`quoteVerified: ${result.quoteVerified}`);
    console.log(`rationale:     ${result.rationale}`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Ran ${idx} adversarial cases. Read each verdict + quote above by hand.`);
}

main().catch((err) => {
  console.error("[verify-proposition.test] failed:", err);
  process.exitCode = 1;
});
