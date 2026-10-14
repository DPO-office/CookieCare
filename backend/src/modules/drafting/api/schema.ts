import { z } from "zod";

// UNIFIED PAC INSTRUCTION FEED — no BASIC/PROACTIVE/REACTIVE modes.
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
  draftInput: z.string().default(""),
  draftInstructions: z.string().default(""),
  /** Counterparty / source document id (from process-uploaded-template). */
  uploadedDocument: z.string().nullable().optional(),
  /** Optional vault template document id (legacy alias for templateId). */
  documentId: z.string().nullable().optional(),
  /** Preferred vault / library template id — authoritative over prose. */
  templateId: z.string().nullable().optional(),
  /** Selected library playbook / rulebook id — authoritative over prose. */
  playbookId: z.string().nullable().optional(),
  /** Selected library / catalog clause ids — preferred over type heuristics. */
  clauseIds: z.array(z.string()).optional(),
  organizationId: z.string().nullable().optional(),
  intake: StructuredIntakeSchema,
  /** Accepted but ignored — legacy clients may still send BASIC/PROACTIVE/REACTIVE. */
  mode: z.string().optional(),
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
