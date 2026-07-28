import { z } from "zod"


// UNIFIED INSTRUCTION FEED
// The frontend no longer sends authoritative structured fields (formFields,
// contractType, extractedFields). It sends only raw user intent; orchestration
// step 1 (requirementExtractionStep) is the single source of truth that derives
// contractType, parties, governing law, venue, term tiers, liability, etc.
export const DraftRequestSchema = z.object({
    mode: z.enum(["BASIC", "PROACTIVE", "REACTIVE"]),
    // Free-text "what to draft".
    draftInput: z.string().default(""),
    // Free-text "how to draft / requirements" (tone, structure, specific asks).
    draftInstructions: z.string().default(""),
    // Reactive: id of the uploaded source document to revise. Null otherwise.
    uploadedDocument: z.string().nullable().optional(),
    // Proactive: id of a selected playbook/reference doc (vault selector arrives
    // later). Null for now — proactive currently runs on default documents.
    documentId: z.string().nullable().optional()
});

export const RefineRequestSchema = z.object({
    documentId: z.string().min(1),
    instructions: z.string().min(1),
    highlightedText: z.string().optional()
});
