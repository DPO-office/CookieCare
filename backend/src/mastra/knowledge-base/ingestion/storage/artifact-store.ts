import { createHash } from "node:crypto";
import {
  GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import { KbJobStore } from "./job-store.js";
import { kbS3FromEnvironment } from "./s3-client.js";

export const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const CONTENT_TYPE = "application/json";
const TOKEN = /^[a-z0-9][a-z0-9_-]*$/;
const HASH = /^[a-f0-9]{64}$/;

export interface ArtifactObjectStore {
  read(key: string): Promise<{ bytes: Uint8Array; contentType: string | undefined } | null>;
  putImmutable(key: string, bytes: Uint8Array, contentHash: string): Promise<void>;
}

export interface ArtifactReference {
  id: string;
  jobId: string;
  stage: string;
  stageVersion: string;
  inputHash: string;
  kind: string;
  objectKey: string;
  contentHash: string;
  byteSize: number;
  contentType: typeof CONTENT_TYPE;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissing(error: unknown): boolean {
  const name = (error as { name?: string; Code?: string })?.name ?? (error as { Code?: string })?.Code;
  return name === "NotFound" || name === "NoSuchKey";
}

/** Uses the same private KB bucket as PDFs, with separate immutable artifact keys. */
export class S3ArtifactObjectStore implements ArtifactObjectStore {
  constructor(private readonly client: S3Client, private readonly bucket: string) {
    if (!bucket) throw new Error("DO_SPACES_BUCKET is required");
  }

  static fromEnvironment(): S3ArtifactObjectStore {
    const { client, bucket } = kbS3FromEnvironment();
    return new S3ArtifactObjectStore(client, bucket);
  }

  async read(key: string): Promise<{ bytes: Uint8Array; contentType: string | undefined } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!head.ContentLength || head.ContentLength > MAX_ARTIFACT_BYTES) throw new Error("Artifact size is invalid");
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) throw new Error("Artifact body is missing");
      const bytes = await object.Body.transformToByteArray();
      if (bytes.length !== head.ContentLength) throw new Error("Artifact size changed during read");
      return { bytes, contentType: head.ContentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async putImmutable(key: string, bytes: Uint8Array, contentHash: string): Promise<void> {
    if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES || sha256(bytes) !== contentHash) {
      throw new Error("Artifact size or checksum is invalid");
    }
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: bytes, ContentType: CONTENT_TYPE,
      ChecksumSHA256: Buffer.from(contentHash, "hex").toString("base64"), IfNoneMatch: "*",
    }));
  }
}

/** An object may be orphaned by lease loss; deterministic keys make the retry reusable. */
export class KbArtifactStore {
  constructor(private readonly pool: Pool, private readonly objects: ArtifactObjectStore,
    private readonly jobs: KbJobStore) {}

  async writeCheckpointedJson(jobId: string, leaseOwner: string, stage: string,
    stageVersion: string, inputHash: string, kind: string, value: unknown): Promise<ArtifactReference> {
    if (![stage, stageVersion, kind].every(value => TOKEN.test(value)) || !HASH.test(inputHash)) {
      throw new Error("Invalid artifact identity");
    }
    const json = JSON.stringify(value);
    if (!json) throw new Error("Artifact must contain JSON");
    const bytes = Buffer.from(json, "utf8");
    if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) throw new Error("Artifact exceeds size limit");
    const contentHash = sha256(bytes);
    const objectKey = `kb/artifacts/${jobId}/${stage}/${stageVersion}/${inputHash}/${kind}-${contentHash}.json`;
    const reference: ArtifactReference = {
      id: sha256(Buffer.from(`${jobId}:${stage}:${stageVersion}:${inputHash}:${kind}:${contentHash}`)),
      jobId, stage, stageVersion, inputHash, kind, objectKey, contentHash,
      byteSize: bytes.length, contentType: CONTENT_TYPE,
    };
    const cached = await this.jobs.completedStep<ArtifactReference>(jobId, stage, stageVersion, inputHash);
    if (cached) {
      if (cached.kind !== kind) throw new Error("Checkpoint artifact kind changed");
      await this.readVerified(cached);
      return cached;
    }
    const existing = await this.objects.read(objectKey);
    if (existing) this.verifyBytes(reference, existing);
    else {
      try { await this.objects.putImmutable(objectKey, bytes, contentHash); }
      catch (error) {
        const raced = await this.objects.read(objectKey);
        if (!raced) throw error;
        this.verifyBytes(reference, raced);
      }
    }
    const committed = await this.jobs.checkpoint(jobId, leaseOwner, stage, stageVersion,
      inputHash, reference, async client => {
        await client.query(`INSERT INTO kb_job_artifacts
          (id, job_id, stage, stage_version, input_hash, kind, object_key, content_type, byte_size, content_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
          reference.id, jobId, stage, stageVersion, inputHash, kind,
          objectKey, CONTENT_TYPE, bytes.length, contentHash,
        ]);
      });
    await this.readVerified(committed);
    return committed;
  }

  async readVerified(reference: ArtifactReference): Promise<unknown> {
    const row = await this.pool.query<{ object_key: string; content_hash: string; byte_size: string | number; content_type: string }>(`
      SELECT object_key, content_hash, byte_size, content_type FROM kb_job_artifacts
      WHERE id = $1 AND job_id = $2 AND stage = $3 AND stage_version = $4
        AND input_hash = $5 AND kind = $6`, [
      reference.id, reference.jobId, reference.stage, reference.stageVersion,
      reference.inputHash, reference.kind,
    ]);
    const metadata = row.rows[0];
    if (!metadata || reference.contentType !== CONTENT_TYPE || metadata.object_key !== reference.objectKey ||
        metadata.content_hash !== reference.contentHash ||
        Number(metadata.byte_size) !== reference.byteSize || metadata.content_type !== CONTENT_TYPE) {
      throw new Error("Artifact reference does not match committed metadata");
    }
    const object = await this.objects.read(reference.objectKey);
    if (!object) throw new Error("Committed artifact is missing");
    this.verifyBytes(reference, object);
    return JSON.parse(Buffer.from(object.bytes).toString("utf8")) as unknown;
  }

  private verifyBytes(reference: ArtifactReference,
    object: { bytes: Uint8Array; contentType: string | undefined }): void {
    if (object.contentType !== CONTENT_TYPE || object.bytes.length !== reference.byteSize ||
        sha256(object.bytes) !== reference.contentHash) {
      throw new Error("Artifact content does not match its committed checksum");
    }
  }
}
