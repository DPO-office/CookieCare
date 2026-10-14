import { createWorkflow } from "@mastra/core/workflows";
import { SourceIntakeInputSchema, SourceIntakeOutputSchema } from "../contracts/intake.js";
import { classifySourceStep } from "../steps/classify-source.js";
import { validateSourceStep } from "../steps/validate-source.js";

/** First fixed workflow slice. Later phases add storage and document processing. */
export const sourceIntakeWorkflow = createWorkflow({
  id: "kb-source-intake-v1",
  inputSchema: SourceIntakeInputSchema,
  outputSchema: SourceIntakeOutputSchema,
})
  .then(validateSourceStep)
  .then(classifySourceStep)
  .commit();
