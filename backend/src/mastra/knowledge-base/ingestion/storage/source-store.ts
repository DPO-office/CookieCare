import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { SourceSchema, SourceVersionSchema, type Source, type SourceVersion } from "../schemas/source.js";

const WorkspaceIdSchema = z.string().trim().min(1);
const ObjectIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

export type KbPermission = "read" | "upload" | "review" | "publish";
export type UserRow = { role: string; status: string };
export type SourceRow = {
  id: string;
  instrument_id: string;
  title: string;
  visibility: Source["access"]["visibility"];
  owner_user_id: string | null;
  workspace_id: string | null;
  curator_user_id: string | null;
};

export class KbAccessDeniedError extends Error {
  constructor() {
    super("Knowledge-base access denied");
  }
}

export async function approvedUser(client: PoolClient, userId: string): Promise<UserRow> {
  const result = await client.query<UserRow>("SELECT role, status FROM users WHERE id = $1", [userId]);
  const user = result.rows[0];
  if (!user || user.status !== "APPROVED") throw new KbAccessDeniedError();
  return user;
}

export async function requireSourcePermission(
  client: PoolClient,
  actorId: string,
  source: SourceRow,
  permission: KbPermission,
  user: UserRow,
): Promise<void> {
  if (source.visibility === "private" && source.owner_user_id === actorId) return;
  if (source.visibility === "curated_shared") {
    if (permission === "read" || (user.role === "ADMIN" && source.curator_user_id === actorId)) return;
  }
  if (source.visibility === "workspace" && source.workspace_id) {
    const result = await client.query<{ can_upload: boolean; can_review: boolean; can_publish: boolean }>(
      `SELECT can_upload, can_review, can_publish FROM kb_workspace_memberships
       WHERE workspace_id = $1 AND user_id = $2`,
      [source.workspace_id, actorId],
    );
    const member = result.rows[0];
    if (member && (permission === "read" ||
      (permission === "upload" && member.can_upload) ||
      (permission === "review" && member.can_review) ||
      (permission === "publish" && member.can_publish))) return;
  }
  throw new KbAccessDeniedError();
}

/** All actor IDs here must come from verified server authentication, never a request body. */
export class KbSourceStore {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createWorkspace(actorId: string, workspace: { id: string; name: string }): Promise<void> {
    ObjectIdSchema.parse(workspace.id);
    WorkspaceIdSchema.parse(workspace.name);
    await this.transaction(async client => {
      await approvedUser(client, actorId);
      await client.query("INSERT INTO kb_workspaces (id, name, created_by) VALUES ($1, $2, $3)",
        [workspace.id, workspace.name, actorId]);
      await client.query(`INSERT INTO kb_workspace_memberships
        (workspace_id, user_id, can_upload, can_review, can_publish)
        VALUES ($1, $2, true, true, true)`, [workspace.id, actorId]);
    });
  }

  async grantWorkspacePermissions(
    actorId: string,
    workspaceId: string,
    memberId: string,
    permissions: { upload: boolean; review: boolean; publish: boolean },
  ): Promise<void> {
    WorkspaceIdSchema.parse(workspaceId);
    await this.transaction(async client => {
      await approvedUser(client, actorId);
      await approvedUser(client, memberId);
      const owner = await client.query("SELECT 1 FROM kb_workspaces WHERE id = $1 AND created_by = $2", [workspaceId, actorId]);
      if (!owner.rowCount) throw new KbAccessDeniedError();
      await client.query(`INSERT INTO kb_workspace_memberships
        (workspace_id, user_id, can_upload, can_review, can_publish)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET
          can_upload = EXCLUDED.can_upload,
          can_review = EXCLUDED.can_review,
          can_publish = EXCLUDED.can_publish`,
      [workspaceId, memberId, permissions.upload, permissions.review, permissions.publish]);
    });
  }

  async createSource(actorId: string, input: Source): Promise<void> {
    const source = SourceSchema.parse(input);
    ObjectIdSchema.parse(source.id);
    await this.transaction(async client => {
      const user = await approvedUser(client, actorId);
      const access = source.access;
      if (access.visibility === "curated_shared") {
        if (user.role !== "ADMIN" || access.curatorUserId !== actorId) throw new KbAccessDeniedError();
      } else {
        if (access.ownerUserId !== actorId) throw new KbAccessDeniedError();
        if (access.visibility === "workspace") {
          const membership = await client.query(`SELECT 1 FROM kb_workspace_memberships
            WHERE workspace_id = $1 AND user_id = $2 AND can_upload`, [access.workspaceId, actorId]);
          if (!membership.rowCount) throw new KbAccessDeniedError();
        }
      }
      await client.query(`INSERT INTO kb_sources
        (id, instrument_id, title, issuer, jurisdiction, visibility, owner_user_id,
         workspace_id, curator_user_id, authority_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
        source.id, source.instrumentId, source.title, source.issuer, source.jurisdiction,
        access.visibility,
        access.visibility === "curated_shared" ? null : access.ownerUserId,
        access.visibility === "workspace" ? access.workspaceId : null,
        access.visibility === "curated_shared" ? access.curatorUserId : null,
        source.authorityStatus,
      ]);
    });
  }

  async addSourceVersion(actorId: string, input: SourceVersion): Promise<void> {
    const version = SourceVersionSchema.parse(input);
    ObjectIdSchema.parse(version.id);
    await this.transaction(async client => {
      const user = await approvedUser(client, actorId);
      const sourceResult = await client.query<SourceRow>("SELECT * FROM kb_sources WHERE id = $1 FOR UPDATE", [version.sourceId]);
      const source = sourceResult.rows[0];
      if (!source) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source, "upload", user);
      const latest = await client.query<{ revision: number }>(
        "SELECT COALESCE(MAX(upload_revision), 0) AS revision FROM kb_source_versions WHERE source_id = $1",
        [version.sourceId],
      );
      if (version.uploadRevision !== Number(latest.rows[0]?.revision ?? 0) + 1) {
        throw new Error("Source revision must follow the previous revision");
      }
      const expectedPrefix = `kb/sources/${source.id}/versions/${version.id}/`;
      if (!version.objectKey.startsWith(expectedPrefix) || version.objectKey.includes("..")) {
        throw new Error("Object key must be unique to this source version");
      }
      await client.query(`INSERT INTO kb_source_versions
        (id, source_id, upload_revision, object_key, checksum, original_file_name, mime_type,
         byte_size, language, uploaded_at, enacted_on, effective_from, effective_until,
         original_page_count, extraction_version, support_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
        version.id, version.sourceId, version.uploadRevision, version.objectKey, version.checksum,
        version.originalFileName, version.mimeType, version.byteSize, version.language,
        version.uploadedAt, version.enactedOn, version.effectiveFrom, version.effectiveUntil,
        version.originalPageCount, version.extractionVersion, version.supportStatus,
      ]);
    });
  }

  async getSource(actorId: string, sourceId: string): Promise<{ source: SourceRow; versions: Array<{ id: string; upload_revision: number }> }> {
    return this.transaction(async client => {
      const user = await approvedUser(client, actorId);
      const sourceResult = await client.query<SourceRow>("SELECT * FROM kb_sources WHERE id = $1", [sourceId]);
      const source = sourceResult.rows[0];
      if (!source) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source, "read", user);
      const versions = await client.query<{ id: string; upload_revision: number }>(
        "SELECT id, upload_revision FROM kb_source_versions WHERE source_id = $1 ORDER BY upload_revision", [sourceId]);
      return { source, versions: versions.rows };
    });
  }

  async assertSourcePermission(actorId: string, sourceId: string, permission: KbPermission): Promise<void> {
    await this.transaction(async client => {
      const user = await approvedUser(client, actorId);
      const result = await client.query<SourceRow>("SELECT * FROM kb_sources WHERE id = $1", [sourceId]);
      const source = result.rows[0];
      if (!source) throw new KbAccessDeniedError();
      await requireSourcePermission(client, actorId, source, permission, user);
    });
  }
}
