/**
 * Alignment verification schema — AI is asked about specific candidate pairs
 * the backend already scored. IDs are authoritative; invented IDs are dropped.
 */

import { z } from "zod";

export const AlignmentVerifyEntrySchema = z.object({
  clauseAId: z.string().min(1),
  clauseBId: z.string().nullable(),
  relationship: z.enum([
    "MATCH",
    "NOT_MATCH",
    "MOVED",
    "UNCERTAIN",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  same_underlying_subject: z.boolean(),
});

export const AlignmentVerifyResponseSchema = z.array(AlignmentVerifyEntrySchema);

export type AlignmentVerifyEntry = z.infer<typeof AlignmentVerifyEntrySchema>;

export const ALIGNMENT_VERIFY_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: [
      "clauseAId",
      "clauseBId",
      "relationship",
      "confidence",
      "reason",
      "same_underlying_subject",
    ],
    additionalProperties: false,
    properties: {
      clauseAId: { type: "string" },
      clauseBId: { type: ["string", "null"] },
      relationship: {
        type: "string",
        enum: ["MATCH", "NOT_MATCH", "MOVED", "UNCERTAIN"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string", minLength: 1 },
      same_underlying_subject: { type: "boolean" },
    },
  },
} as const;
