import { createHash } from "node:crypto";
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { kbS3FromEnvironment } from "./s3-client.js";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const URL_SECONDS = 300;

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string | undefined;
}

export interface ObjectStore {
  signUpload(key: string, checksumHex: string): Promise<{ url: string; headers: Record<string, string> }>;
  signRead(key: string): Promise<string>;
  read(key: string): Promise<StoredObject | null>;
  putImmutable(key: string, bytes: Uint8Array, checksumHex: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

function isMissing(error: unknown): boolean {
  const code = (error as { name?: string; Code?: string })?.name ?? (error as { Code?: string })?.Code;
  return code === "NotFound" || code === "NoSuchKey";
}

/** Private S3 bucket adapter. The caller authorizes keys before signing URLs. */
export class S3ObjectStore implements ObjectStore {
  constructor(private readonly client: S3Client, private readonly bucket: string) {
    if (!bucket) throw new Error("DO_SPACES_BUCKET is required");
  }

  static fromEnvironment(): S3ObjectStore {
    const { client, bucket } = kbS3FromEnvironment();
    return new S3ObjectStore(client, bucket);
  }

  async signUpload(key: string, checksumHex: string): Promise<{ url: string; headers: Record<string, string> }> {
    const checksum = Buffer.from(checksumHex, "hex").toString("base64");
    const command = new PutObjectCommand({
      Bucket: this.bucket, Key: key, ContentType: "application/pdf", ChecksumSHA256: checksum,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: URL_SECONDS,
      unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      signableHeaders: new Set(["content-type"]),
    });
    return { url, headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": checksum } };
  }

  async signRead(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: URL_SECONDS });
  }

  async read(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!head.ContentLength || head.ContentLength > MAX_PDF_BYTES) throw new Error("PDF exceeds the upload size limit");
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error("Stored PDF has no body");
      const bytes = await result.Body.transformToByteArray();
      if (bytes.length !== head.ContentLength || bytes.length > MAX_PDF_BYTES) throw new Error("Stored PDF size changed");
      return { bytes, contentType: head.ContentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async putImmutable(key: string, bytes: Uint8Array, checksumHex: string): Promise<void> {
    if (!bytes.length || bytes.length > MAX_PDF_BYTES ||
        createHash("sha256").update(bytes).digest("hex") !== checksumHex) {
      throw new Error("Stored PDF checksum or size is invalid");
    }
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: bytes, ContentType: "application/pdf",
      ChecksumSHA256: Buffer.from(checksumHex, "hex").toString("base64"), IfNoneMatch: "*",
    }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
