import { z } from "zod"





const BasicDraftSchema = z.object({
    
    mode: z.literal("BASIC"),
    instructions: z.string(),
    contractType: z.string(),
    formFields: z.record(z.string(),z.string())
});


const ProactiveDraftSchema = z.object({
    mode: z.literal("PROACTIVE"),
    instructions: z.string(),
    templateId: z.string(),
    playbookId: z.string().optional(),
    clauseIds: z.array(z.string()).optional()
  });

// TODO: fix the schema for reactivedraft
const ReactiveDraftSchema = z.object({
    mode: z.literal("REACTIVE"),
    sourceDocumentId: z.string(),
    extractedFields: z.record(z.string(),z.string()),
    instructions: z.string()
  }); 



export const DraftRequestSchema = z.discriminatedUnion("mode",[
    BasicDraftSchema,
    ProactiveDraftSchema,
    ReactiveDraftSchema
])
