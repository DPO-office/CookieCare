/**
 * risk-schema.ts
 *
 * Zod validation schema and JSON Schema for the Risk Analysis LLM response.
 * Mirrors the pattern established in alignment-schema.ts and difference-schema.ts.
 */

import { z } from "zod";

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const RiskFindingSchema = z.object({
  pairId: z.string().min(1),
  level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  category: z.enum([
    "liability",
    "indemnity",
    "ip",
    "termination",
    "data_protection",
    "payment",
    "confidentiality",
    "governing_law",
    "audit_rights",
    "other",
  ]),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const RiskResponseSchema = z.array(RiskFindingSchema);

export type RiskFindingLLMEntry = z.infer<typeof RiskFindingSchema>;

// ─── JSON Schema (for Gemini constrained decoding) ───────────────────────────

export const RISK_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: ["pairId", "level", "category", "rationale", "confidence"],
    additionalProperties: false,
    properties: {
      pairId: { type: "string", minLength: 1 },
      level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      category: {
        type: "string",
        enum: [
          "liability",
          "indemnity",
          "ip",
          "termination",
          "data_protection",
          "payment",
          "confidentiality",
          "governing_law",
          "audit_rights",
          "other",
        ],
      },
      rationale: { type: "string", minLength: 1 },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
} as const;
