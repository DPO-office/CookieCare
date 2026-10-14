import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
  type S3Client } from "@aws-sdk/client-s3";
import { kbS3Settings, createKbS3Client } from "../storage/s3-client.js";
import { S3ObjectStore } from "../storage/object-store.js";
import { S3ArtifactObjectStore } from "../storage/artifact-store.js";

test("AWS remains the default and custom endpoint settings are explicit", async () => {
  const aws = kbS3Settings({ AWS_REGION: "ap-south-1", KB_S3_BUCKET: "private" });
  assert.equal(aws.endpoint, undefined);
  assert.equal(aws.forcePathStyle, undefined);
  const spaces = kbS3Settings({ AWS_REGION: "blr1", KB_S3_BUCKET: "private",
    KB_S3_ENDPOINT: "https://blr1.digitaloceanspaces.com", KB_S3_FORCE_PATH_STYLE: "false",
    AWS_ACCESS_KEY_ID: "fixture", AWS_SECRET_ACCESS_KEY: "fixture", NODE_ENV: "production" });
  const client = createKbS3Client(spaces);
  try {
    assert.equal(client.config.forcePathStyle, false);
    assert.equal((await client.config.endpoint!()).hostname, "blr1.digitaloceanspaces.com");
  } finally { client.destroy(); }
  assert.throws(() => kbS3Settings({ AWS_REGION: "blr1", KB_S3_BUCKET: "private",
    KB_S3_ENDPOINT: "http://localhost:9000", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b",
    NODE_ENV: "production" }), /HTTPS/);
});

test("object adapters preserve immutable writes, checksums, reads and deletes", async () => {
  const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const seen: unknown[] = [];
  const client = { send: async (command: unknown) => {
    seen.push(command);
    const input = (command as { input: { Key: string; Body?: Uint8Array; ContentType?: string } }).input;
    if (command instanceof PutObjectCommand) {
      stored.set(input.Key, { bytes: input.Body!, contentType: input.ContentType! }); return {};
    }
    if (command instanceof DeleteObjectCommand) { stored.delete(input.Key); return {}; }
    const value = stored.get(input.Key);
    if (!value) throw Object.assign(new Error("missing"), { name: "NotFound" });
    if (command instanceof HeadObjectCommand) return { ContentLength: value.bytes.length, ContentType: value.contentType };
    if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => value.bytes } };
    throw new Error("unexpected command");
  } } as unknown as S3Client;
  const pdf = new S3ObjectStore(client, "private");
  const bytes = Buffer.from("%PDF-test");
  const hash = createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(() => pdf.putImmutable("pdf", bytes, "0".repeat(64)), /checksum/);
  await pdf.putImmutable("pdf", bytes, hash);
  assert.equal((seen.at(-1) as PutObjectCommand).input.IfNoneMatch, "*");
  assert.deepEqual((await pdf.read("pdf"))?.bytes, bytes);
  assert.equal(await pdf.exists("pdf"), true);
  await pdf.remove("pdf");
  assert.equal(await pdf.read("pdf"), null);

  const artifacts = new S3ArtifactObjectStore(client, "private");
  const json = Buffer.from('{"ok":true}');
  const jsonHash = createHash("sha256").update(json).digest("hex");
  await artifacts.putImmutable("artifact", json, jsonHash);
  assert.equal((seen.at(-1) as PutObjectCommand).input.IfNoneMatch, "*");
  assert.deepEqual((await artifacts.read("artifact"))?.bytes, json);
});
