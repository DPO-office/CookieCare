// Plan-Phase 10 manual verification script — follow-up triage logic.
// Tests the three-way triage against a mocked GDPR Art 28 locked-fact set.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/phase10-verify.ts
// from CookieCare-main/backend/.

import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import { triageFollowUp } from "../follow-up-triage.js";

// Hand-constructed mock: what a correct GDPR Art 28 analysis of the Cisco DPA
// would lock, based on the definition-of-done table in ACT research doc §8.
const MOCK_GDPR_LOCKS: RequirementAssessment[] = [
  {
    requirementId: "gdpr.art28.1.processor_instruction_bound",
    supportingFindingIds: ["f1"],
    summary: "Processor shall process personal data only on documented instructions from the controller.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.a.instruction_binding",
    supportingFindingIds: ["f2"],
    summary: "The contract requires the processor to process data only on documented instructions.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.b.confidentiality",
    supportingFindingIds: ["f3"],
    summary: "Persons authorised to process personal data have committed to confidentiality.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.c.security_measures",
    supportingFindingIds: ["f4"],
    summary: "Processor takes all measures required pursuant to Article 32 (security of processing).",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.d.subprocessor_conditions",
    supportingFindingIds: ["f5"],
    summary: "Subprocessors engaged only with prior written authorization; same data protection obligations imposed.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.e.controller_assistance",
    supportingFindingIds: ["f6"],
    summary: "Processor assists the controller in responding to data subject requests.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.f.security_and_breach",
    supportingFindingIds: ["f7"],
    summary: "Processor assists controller with breach notification obligations under Articles 32-36.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.g.deletion_return",
    supportingFindingIds: ["f8"],
    summary: "After end of processing services, processor deletes or returns all personal data.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.3.h.audit_rights",
    supportingFindingIds: ["f9"],
    summary: "Processor makes available all information necessary for demonstrating compliance and allows audits.",
    status: "strong",
  },
  {
    requirementId: "gdpr.art28.subprocessor_notification",
    supportingFindingIds: ["f10"],
    summary: "Controller informed of intended changes concerning addition or replacement of subprocessors.",
    status: "strong",
  },
];

interface TestCase {
  turn: number;
  instruction: string;
  expected: string;
  expectedReason: string;
}

const TEST_CHAIN: TestCase[] = [
  {
    turn: 1,
    instruction: "Analyze GDPR compliance",
    expected: "full_replan",
    expectedReason: "no prior locks — full investigation",
  },
  {
    turn: 2,
    instruction: "Focus on subprocessors",
    expected: "answerable_from_locks",
    expectedReason: "scoping instruction re-renders existing locks",
  },
  {
    turn: 3,
    instruction: "Can we object to a subprocessor change?",
    expected: "narrow_addition",
    expectedReason: "new question not covered by existing locks",
  },
  {
    turn: 4,
    instruction: "What should we negotiate on that clause?",
    expected: "answerable_from_locks",
    expectedReason: "synthesis/recommendation from existing lock",
  },
];

function main() {
  let allPassed = true;

  for (const tc of TEST_CHAIN) {
    const locks = tc.turn === 1 ? [] : MOCK_GDPR_LOCKS;
    const result = triageFollowUp(tc.instruction, locks);
    const passed = result.decision === tc.expected;
    if (!passed) allPassed = false;

    console.log(`\nTurn ${tc.turn}: "${tc.instruction}"`);
    console.log(`  Expected: ${tc.expected} (${tc.expectedReason})`);
    console.log(`  Got:      ${result.decision} — ${result.reason}`);
    if (result.matchedLockIds?.length) {
      console.log(`  Matched locks: ${result.matchedLockIds.join(", ")}`);
    }
    console.log(`  ${passed ? "PASS" : "FAIL"}`);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(allPassed ? "ALL 4 TURNS CORRECT" : "SOME TURNS FAILED");
}

main();
