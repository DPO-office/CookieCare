import { createStep } from "@mastra/core/workflows";
import { SourceIntakeInputSchema } from "../contracts/intake.js";

export const validateSourceStep = createStep({
  id: "validate-kb-source-identity",
  inputSchema: SourceIntakeInputSchema,
  outputSchema: SourceIntakeInputSchema,
  execute: async ({ inputData }) => {
    if (inputData.source.id !== inputData.version.sourceId) {
      throw new Error("Source version does not belong to the supplied source");
    }
    return inputData;
  },
});
