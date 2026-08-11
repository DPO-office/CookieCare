import { z } from "zod";

export const AnalysisRequestSchema = z.object({
  instruction: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1),
  organizationId: z.string().nullable().optional(),
  sessionId: z.string().optional(),
});

export const ResumeAskRequestSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
