import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { approvedUser, KbAccessDeniedError, requireSourcePermission, type SourceRow } from "./source-store.js";

const ReviewInput = z.strictObject({
  targetKind: z.enum(["provision", "requirement", "profile", "relation"]),
  targetId: z.string().min(1), revision: z.number().int().positive(),
  revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["approve", "reject", "request_changes"]),
  reason: z.string().trim().min(1).max(4000),
});
export type SubmitReview = z.infer<typeof ReviewInput>;

const TARGETS = {
  provision: { table: "kb_provisions", source: "source_version_id", hash: "content_hash" },
  requirement: { table: "kb_rules", source: "source_version_id", hash: "content_hash" },
  profile: { table: "kb_rule_profiles", source: "source_version_id", hash: "content_hash" },
  relation: { table: "kb_legal_relation_revisions", source: null, hash: "content_hash" },
} as const;

/** Reviews are append-only decisions against one exact immutable revision. */
export class KbReviewService {
  constructor(private readonly pool: Pool) {}

  async submit(actorId: string, raw: SubmitReview): Promise<{ id: string; reviewedAt: string }> {
    const input = ReviewInput.parse(raw);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const user = await approvedUser(client, actorId);
      const row = await this.targetRow(client, input);
      if (!row || Number(row.revision) !== input.revision || row.content_hash !== input.revisionHash) {
        throw new Error("Review target is stale or its exact content hash does not match");
      }
      const source = await client.query<SourceRow>(`
        SELECT s.* FROM kb_sources s JOIN kb_source_versions v ON v.source_id = s.id
        WHERE v.id = $1`, [row.source_version_id]);
      if (!source.rows[0]) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source.rows[0], "review", user);
      const id = randomUUID();
      const reviewedAt = new Date().toISOString();
      if (input.targetKind === "relation") {
        await client.query(`INSERT INTO kb_relation_reviews
          (id, reviewer_user_id, relation_id, relation_revision, revision_hash, decision, reason, reviewed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, actorId, input.targetId,
          input.revision, input.revisionHash, input.decision, input.reason, reviewedAt]);
      } else {
        const column = input.targetKind === "provision" ? "provision" :
          input.targetKind === "requirement" ? "rule" : "profile";
        await client.query(`INSERT INTO kb_reviews
          (id, reviewer_user_id, target_kind, ${column}_id, ${column}_revision,
           revision_hash, decision, reason, reviewed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, actorId, input.targetKind,
          input.targetId, input.revision, input.revisionHash,
          input.decision, input.reason, reviewedAt]);
      }
      await client.query("COMMIT");
      return { id, reviewedAt };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  private async targetRow(client: PoolClient, input: SubmitReview): Promise<{
    revision: number; content_hash: string; source_version_id: string } | null> {
    const target = TARGETS[input.targetKind];
    if (input.targetKind === "relation") {
      const found = await client.query<{ revision: number; content_hash: string; source_version_id: string }>(`
        SELECT r.revision, r.content_hash, p.source_version_id
        FROM kb_legal_relation_revisions r JOIN kb_provisions p
          ON p.id = r.source_provision_id AND p.revision = r.source_provision_revision
        WHERE r.id = $1 ORDER BY r.revision DESC LIMIT 1 FOR UPDATE OF r`, [input.targetId]);
      return found.rows[0] ?? null;
    }
    const found = await client.query<{ revision: number; content_hash: string; source_version_id: string }>(`
      SELECT revision, ${target.hash} AS content_hash, ${target.source} AS source_version_id
      FROM ${target.table} WHERE id = $1 ORDER BY revision DESC LIMIT 1 FOR UPDATE`, [input.targetId]);
    return found.rows[0] ?? null;
  }
}
