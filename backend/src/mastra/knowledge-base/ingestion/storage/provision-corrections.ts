import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { StructuralKindSchema } from "../schemas/legal-structure.js";
import { hashRevision } from "../schemas/common.js";
import { approvedUser, KbAccessDeniedError, requireSourcePermission, type SourceRow } from "./source-store.js";

const Correction = z.strictObject({
  provisionId: z.string().min(1), basedOnRevision: z.number().int().positive(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/), kind: StructuralKindSchema,
  reason: z.string().trim().min(1).max(4000),
});
export type ProvisionKindCorrection = z.infer<typeof Correction>;

/** Only structural classification changes here; source wording and fragments are copied unchanged. */
export class KbProvisionCorrectionService {
  constructor(private readonly pool: Pool) {}

  async correctKind(actorId: string, raw: ProvisionKindCorrection): Promise<{
    id: string; revision: number; contentHash: string }> {
    const input = Correction.parse(raw);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const user = await approvedUser(client, actorId);
      const found = await client.query<{
        id: string; revision: number; source_version_id: string; kind: string;
        citation: unknown; parent_id: string | null; parent_revision: number | null;
        original_label: string | null; semantic_purposes: string[]; text: string;
        normalization: unknown; content_hash: string }>(`
        SELECT * FROM kb_provisions WHERE id = $1 ORDER BY revision DESC LIMIT 1 FOR UPDATE`, [input.provisionId]);
      const current = found.rows[0];
      if (!current || Number(current.revision) !== input.basedOnRevision ||
          current.content_hash !== input.expectedHash) throw new Error("Provision revision is stale");
      const source = await client.query<SourceRow>(`
        SELECT s.* FROM kb_sources s JOIN kb_source_versions v ON v.source_id = s.id
        WHERE v.id = $1`, [current.source_version_id]);
      if (!source.rows[0]) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source.rows[0], "review", user);
      if (input.kind === current.kind) throw new Error("Correction must change the structural kind");
      const revision = Number(current.revision) + 1;
      const contentHash = hashRevision({ id: current.id, revision,
        sourceVersionId: current.source_version_id, citation: current.citation,
        parentId: current.parent_id, parentRevision: current.parent_revision,
        kind: input.kind, originalLabel: current.original_label,
        semanticPurposes: current.semantic_purposes, text: current.text,
        normalization: current.normalization });
      await client.query(`INSERT INTO kb_provisions
        (id, revision, source_version_id, citation, parent_id, parent_revision,
         kind, original_label, semantic_purposes, text, reconstruction_status,
         normalization, content_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'needs_review',$11,$12)`, [
        current.id, revision, current.source_version_id, JSON.stringify(current.citation),
        current.parent_id, current.parent_revision, input.kind, current.original_label,
        current.semantic_purposes, current.text, JSON.stringify(current.normalization), contentHash]);
      await client.query(`INSERT INTO kb_provision_fragments
        (provision_id, provision_revision, source_version_id, ordinal, block_id, start_offset, end_offset)
        SELECT provision_id, $3, source_version_id, ordinal, block_id, start_offset, end_offset
        FROM kb_provision_fragments WHERE provision_id = $1 AND provision_revision = $2`,
      [current.id, current.revision, revision]);
      await client.query(`INSERT INTO kb_audit_events (actor_user_id,event_type,entity_id,details)
        VALUES ($1,'provision_kind_corrected',$2,$3)`, [actorId, current.id,
        JSON.stringify({ fromRevision: current.revision, toRevision: revision,
          fromKind: current.kind, toKind: input.kind, reason: input.reason, correctionId: randomUUID() })]);
      await client.query("COMMIT");
      return { id: current.id, revision, contentHash };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
