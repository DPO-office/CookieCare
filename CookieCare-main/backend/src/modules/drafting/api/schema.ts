import { z } from "zod";

// UNIFIED INSTRUCTION FEED
// Optional structured intake overlay pre-populates facts before PLAN (cuts ASK round-trips).
export const StructuredIntakeSchema = z
  .object({
    documentType: z.string().optional(),
    governingLaw: z.string().optional(),
    phiInvolved: z.boolean().optional(),
    partyCount: z.number().int().positive().optional(),
    parties: z.array(z.string()).optional(),
  })
  .optional();

export const DraftRequestSchema = z.object({
  mode: z.enum(["BASIC", "PROACTIVE", "REACTIVE"]),
  draftInput: z.string().default(""),
  draftInstructions: z.string().default(""),
  uploadedDocument: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  intake: StructuredIntakeSchema,
});

export const RefineRequestSchema = z.object({
  documentId: z.string().min(1),
  instructions: z.string().min(1),
  highlightedText: z.string().optional(),
});

/** Resume a PAC run paused in ASK with batched answers. */
export const ResumeAskRequestSchema = z.object({
  documentId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});
