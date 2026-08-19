import { z } from "zod";

export const AnalysisRequestSchema = z.object({
  instruction: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1),
  /** Path A — library category or prompt id when user picks from prompt library. */
  promptLibraryId: z.string().optional(),
  organizationId: z.string().nullable().optional(),
  sessionId: z.string().optional(),
  documentRoles: z.record(z.string(), z.enum(["target", "reference"])).optional(),
  documentMode: z.enum(["unified", "individual"]).optional(),
  answerStyle: z.enum(["narrative", "tabular"]).optional(),
});

export const ResumeAskRequestSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
