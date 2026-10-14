/** First pilot intent. Capability is not enabled until its evaluation gates pass. */
export const PILOT_SCOPE = {
  instrumentId: "eu-2016-679",
  provisionPath: ["28"],
  formats: ["application/pdf"],
  languages: ["en"],
  productionEnabled: false,
} as const;

export function classifyPilotInput(input: { mimeType: string; language: string | null; readable: boolean | null }):
  "unsupported" | "unreadable" | "review_required" {
  if (input.mimeType !== "application/pdf") return "unsupported";
  if (input.readable === false) return "unreadable";
  // Phase 0 has no qualified parser. Unknown languages/layouts remain review-required.
  return "review_required";
}
