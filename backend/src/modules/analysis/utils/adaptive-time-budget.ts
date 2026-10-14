export function adaptiveVerificationTimeoutMs(input: {
  thinkingMode: "lite" | "deep";
  selectedCandidateCount: number;
  evidenceChars: number;
}): number {
  const base = input.thinkingMode === "deep" ? 90_000 : 45_000;
  const cap = input.thinkingMode === "deep" ? 150_000 : 75_000;
  const candidateCost = Math.max(0, input.selectedCandidateCount - 1) * 4_000;
  const evidenceCost = Math.ceil(Math.max(0, input.evidenceChars - 4_000) / 4_000) * 2_000;
  return Math.min(cap, base + candidateCost + evidenceCost);
}
