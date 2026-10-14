import { createHash } from "node:crypto";
import { z } from "zod";

export const KB_SCHEMA_VERSION = "1.0.0" as const;
export const IdSchema = z.string().trim().min(1);
export const ExactTextSchema = z.string().refine(text => text.trim().length > 0, "Text must not be blank");
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const RevisionSchema = z.number().int().positive();
export const TimestampSchema = z.iso.datetime({ offset: true });
export const LegalDateSchema = z.iso.date().nullable();
export const RevisionRefSchema = z.strictObject({ id: IdSchema, revision: RevisionSchema });
export const CitationSchema = z.strictObject({
  instrumentId: IdSchema, sourceVersionId: IdSchema, path: z.array(IdSchema).min(1), label: IdSchema,
});

/** Canonical JSON hashing: object key order is irrelevant, array order is preserved. */
export function hashRevision(value: unknown): string {
  function canonical(input: unknown): string {
    if (input === null || typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
    if (typeof input === "number" && Number.isFinite(input)) return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
    if (typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype) {
      const record = input as Record<string, unknown>;
      return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    throw new TypeError("Revision content must be finite JSON; omit undefined fields explicitly.");
  }
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

/** Text hashes use the exact embedding input, without normalization. */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const AuthorshipSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("authored"), authorId: IdSchema }),
  z.strictObject({ kind: z.literal("generated"), model: IdSchema, promptVersion: IdSchema }),
  z.strictObject({ kind: z.literal("imported"), sourcePath: IdSchema, sourceVersion: IdSchema, sourceHash: Sha256Schema }),
]);

export const RevisionMetadataSchema = z.strictObject({
  schemaVersion: z.literal(KB_SCHEMA_VERSION), id: IdSchema, revision: RevisionSchema,
  contentHash: Sha256Schema, createdAt: TimestampSchema, authorship: AuthorshipSchema,
});

export type RevisionRef = z.infer<typeof RevisionRefSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Authorship = z.infer<typeof AuthorshipSchema>;
