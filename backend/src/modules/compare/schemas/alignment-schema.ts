/**
 * alignment-schema.ts
 *
 * Zod validation schema and JSON Schema for the LLM alignment response.
 *
 * Mirrors the pattern used in modules/drafting/schemas/validation-schema.ts:
 * - Zod schema for runtime validation of the LLM output.
 * - Plain JSON Schema object passed to executeJsonCompletion() so Gemini
 *   can use constrained decoding to produce structurally valid JSON.
 */

import { z } from "zod";

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const AlignmentEntrySchema = z.object({
  clauseAId: z.string().nullable(),
  clauseBId: z.string().nullable(),
  matchConfidence: z.number().min(0).max(1),
  alignmentType: z.enum(["exact", "semantic", "unmatched"]),
  alignmentReason: z.string().min(1),
  status: z.enum(["matched", "added", "removed", "restructured"]),
});

export const AlignmentResponseSchema = z.array(AlignmentEntrySchema);

export type AlignmentEntry = z.infer<typeof AlignmentEntrySchema>;

// ─── JSON Schema (for Gemini constrained decoding) ───────────────────────────

export const ALIGNMENT_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: [
      "clauseAId",
      "clauseBId",
      "matchConfidence",
      "alignmentType",
      "alignmentReason",
      "status",
    ],
    additionalProperties: false,
    properties: {
      clauseAId: { type: ["string", "null"] },
      clauseBId: { type: ["string", "null"] },
      matchConfidence: { type: "number", minimum: 0, maximum: 1 },
      alignmentType: { type: "string", enum: ["exact", "semantic", "unmatched"] },
      alignmentReason: { type: "string", minLength: 1 },
      status: {
        type: "string",
        enum: ["matched", "added", "removed", "restructured"],
      },
    },
  },
} as const;
