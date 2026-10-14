/**
 * difference-schema.ts
 *
 * Zod validation schema and JSON Schema for the LLM difference detection response.
 * Mirrors the pattern established in alignment-schema.ts.
 *
 * Top-level array remains 1:1 with the prompt batch. Atomic edits live in
 * `changes` so parent ClauseDifference architecture is unchanged.
 */

import { z } from "zod";

const AtomicClassification = z.enum([
  "MODIFIED_BROADER",
  "MODIFIED_NARROWER",
  "NEUTRAL_REPHRASE",
]);

export const AtomicChangeSchema = z.object({
  topic: z.string().min(1),
  classification: AtomicClassification,
  summary: z.string(),
  originalSnippet: z.string(),
  modifiedSnippet: z.string(),
  confidence: z.number().min(0).max(1),
});

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
  // Optional for backward compatibility with fixtures / older responses.
  changes: z.array(AtomicChangeSchema).optional().default([]),
});

export const DifferenceResponseSchema = z.array(DifferenceEntrySchema);

export type AtomicChangeEntry = z.infer<typeof AtomicChangeSchema>;
export type DifferenceEntry = z.infer<typeof DifferenceEntrySchema>;

const ATOMIC_CHANGE_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "topic",
    "classification",
    "summary",
    "originalSnippet",
    "modifiedSnippet",
    "confidence",
  ],
  properties: {
    topic: { type: "string", minLength: 1 },
    classification: {
      type: "string",
      enum: ["MODIFIED_BROADER", "MODIFIED_NARROWER", "NEUTRAL_REPHRASE"],
    },
    summary: { type: "string" },
    originalSnippet: { type: "string" },
    modifiedSnippet: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

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
      "changes",
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
      changes: { type: "array", items: ATOMIC_CHANGE_JSON },
    },
  },
} as const;
