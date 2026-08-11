/**
 * difference-schema.ts
 *
 * Zod validation schema and JSON Schema for the LLM difference detection response.
 * Mirrors the pattern established in alignment-schema.ts.
 */

import { z } from "zod";

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const DifferenceEntrySchema = z.object({
  pairId: z.string().min(1),
  clauseAId: z.string().nullable(),
  clauseBId: z.string().nullable(),
  classification: z.enum([
    "UNCHANGED",
    "ADDED",
    "REMOVED",
    "MODIFIED_BROADER",
    "MODIFIED_NARROWER",
    "NEUTRAL_REPHRASE",
  ]),
  semanticSummary: z.string(),
  confidence: z.number().min(0).max(1),
});

export const DifferenceResponseSchema = z.array(DifferenceEntrySchema);

export type DifferenceEntry = z.infer<typeof DifferenceEntrySchema>;

// ─── JSON Schema (for Gemini constrained decoding) ───────────────────────────

export const DIFFERENCE_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: [
      "pairId",
      "clauseAId",
      "clauseBId",
      "classification",
      "semanticSummary",
      "confidence",
    ],
    additionalProperties: false,
    properties: {
      pairId: { type: "string", minLength: 1 },
      clauseAId: { type: ["string", "null"] },
      clauseBId: { type: ["string", "null"] },
      classification: {
        type: "string",
        enum: [
          "UNCHANGED",
          "ADDED",
          "REMOVED",
          "MODIFIED_BROADER",
          "MODIFIED_NARROWER",
          "NEUTRAL_REPHRASE",
        ],
      },
      semanticSummary: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
} as const;
