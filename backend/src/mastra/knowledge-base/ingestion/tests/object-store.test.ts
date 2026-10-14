import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { S3ObjectStore } from "../storage/object-store.js";

test("signed S3 upload binds the checksum and content type for five minutes", async () => {
  const client = new S3Client({
    region: "ap-south-1",
    credentials: { accessKeyId: "fixture-key", secretAccessKey: "fixture-secret" },
  });
  try {
    const objects = new S3ObjectStore(client, "private-fixture-bucket");
    const signed = await objects.signUpload("kb/staging/fixture/original.pdf", "a".repeat(64));
    const url = new URL(signed.url);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.match(url.searchParams.get("X-Amz-SignedHeaders") ?? "", /content-type/);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders") ?? "", /x-amz-checksum-sha256/);
    assert.equal(signed.headers["Content-Type"], "application/pdf");
    assert.equal(signed.headers["x-amz-checksum-sha256"], Buffer.from("a".repeat(64), "hex").toString("base64"));
  } finally {
    client.destroy();
  }
});
