import { createStep } from "@mastra/core/workflows";
import { SourceIntakeInputSchema, SourceIntakeOutputSchema } from "../contracts/intake.js";
import { PILOT_SCOPE } from "../scope.js";

export function classifySource(inputData: typeof SourceIntakeInputSchema._output): typeof SourceIntakeOutputSchema._output {
  const { source, version, readability } = inputData;
  const identity = { sourceId: source.id, sourceVersionId: version.id };

  if (version.mimeType !== "application/pdf") {
    return { ...identity, status: "unsupported", reason: "unsupported_format" };
  }
  if (version.supportStatus === "unsupported") {
    return { ...identity, status: "unsupported", reason: "unsupported_source" };
  }
  if (readability === "unreadable" || version.supportStatus === "unreadable") {
    return { ...identity, status: "unreadable", reason: "unreadable_file" };
  }
  if (readability === "unknown") {
    return { ...identity, status: "review_required", reason: "unverified_readability" };
  }
  if (source.instrumentId !== PILOT_SCOPE.instrumentId) {
    return { ...identity, status: "review_required", reason: "outside_pilot_instrument" };
  }
  if (version.language !== "en") {
    return { ...identity, status: "review_required", reason: "outside_pilot_language" };
  }
  if (source.authorityStatus !== "verified") {
    return { ...identity, status: "review_required", reason: "unverified_authority" };
  }
  return { ...identity, status: "review_required", reason: "pilot_requires_review" };
}

export const classifySourceStep = createStep({
  id: "classify-kb-source-intake",
  inputSchema: SourceIntakeInputSchema,
  outputSchema: SourceIntakeOutputSchema,
  execute: async ({ inputData }) => classifySource(inputData),
});
