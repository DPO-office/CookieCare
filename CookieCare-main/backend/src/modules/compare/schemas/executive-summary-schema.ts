/**
 * executive-summary-schema.ts
 *
 * Zod validation schema and JSON Schema for the Executive Summary LLM response.
 * Mirrors the pattern established in risk-schema.ts, difference-schema.ts, and
 * alignment-schema.ts.
 *
 * The LLM produces a single JSON object (not an array) — one summary per
 * comparison run.
 */

import { z } from "zod";

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const ExecutiveSummarySchema = z.object({
  /**
   * 2–4 sentence paragraph stating: agreement type (if determinable), overall
   * direction of the revision, and net risk position for the reviewer.
   */
  overallAssessment: z.string().min(1),

  /** Derived from risk findings: HIGH > MEDIUM > LOW */
  overallRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),

  /**
   * 3–5 most material findings a decision-maker must know.
   * Ordered HIGH → MEDIUM. Each entry ≤ 25 words.
   */
  keyFindings: z.array(z.string().min(1)),

  /**
   * 1–3 changes that a competent negotiator would push back on immediately.
   * Empty array when no HIGH or MEDIUM findings warrant a redline.
   */
  criticalRedlines: z.array(z.string().min(1)),

  /**
   * Protections present in Agreement A that are absent or weakened in B.
   * Empty array when no significant protections were removed.
   */
  missingProtections: z.array(z.string().min(1)),

  /**
   * Top 1–4 issues to address in negotiation, in priority order.
   */
  negotiationPriorities: z.array(z.string().min(1)),

  /**
   * Single direct sentence: Approve / Approve subject to / Do not sign.
   */
  recommendation: z.string().min(1),
});

export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

// ─── JSON Schema (for Gemini constrained decoding) ───────────────────────────

export const EXECUTIVE_SUMMARY_JSON_SCHEMA = {
  type: "object",
  required: [
    "overallAssessment",
    "overallRisk",
    "keyFindings",
    "criticalRedlines",
    "missingProtections",
    "negotiationPriorities",
    "recommendation",
  ],
  additionalProperties: false,
  properties: {
    overallAssessment: { type: "string", minLength: 1 },
    overallRisk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    keyFindings: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    criticalRedlines: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    missingProtections: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    negotiationPriorities: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    recommendation: { type: "string", minLength: 1 },
  },
} as const;
