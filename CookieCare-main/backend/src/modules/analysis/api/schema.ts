import { z } from "zod";

export const AnalysisRequestSchema = z
  .object({
    instruction: z.string().min(1),
    // A continued session recovers its original documents from the persisted
    // state. Fresh runs must still supply at least one document.
    documentIds: z.array(z.string().min(1)).min(1).optional(),
    /** Path A - library category or prompt id when user picks from prompt library. */
    promptLibraryId: z.string().optional(),
    organizationId: z.string().nullable().optional(),
    sessionId: z.string().min(1).optional(),
    documentRoles: z.record(z.string(), z.enum(["target", "reference"])).optional(),
    answerStyle: z.enum(["narrative", "tabular"]).optional(),
    /** Compute / verification budget - orthogonal to report depth. */
    thinkingMode: z.enum(["lite", "deep"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.sessionId && !value.documentIds?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["documentIds"],
        message: "At least one document is required for a new analysis session",
      });
    }
  });

export const ResumeAskRequestSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
