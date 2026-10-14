import { z } from "zod";
import { SourceSchema, SourceVersionSchema } from "../schemas/index.js";

/** Supplied by trusted backend code after it has resolved ownership and access. */
export const SourceIntakeInputSchema = z.strictObject({
  source: SourceSchema,
  version: SourceVersionSchema,
  readability: z.enum(["unknown", "readable", "unreadable"]),
});

export const SourceIntakeOutputSchema = z.strictObject({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  status: z.enum(["review_required", "unsupported", "unreadable"]),
  reason: z.enum([
    "unsupported_format", "unsupported_source", "unreadable_file", "unverified_readability",
    "outside_pilot_instrument", "outside_pilot_language", "unverified_authority", "pilot_requires_review",
  ]),
});
