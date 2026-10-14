import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

export interface KbS3Settings {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function kbS3Settings(env: NodeJS.ProcessEnv = process.env): KbS3Settings {
  const region = env.DO_SPACES_REGION?.trim();
  const bucket = env.DO_SPACES_BUCKET?.trim();
  const accessKeyId = env.DO_SPACES_KEY?.trim();
  const secretAccessKey = env.DO_SPACES_SECRET?.trim();
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("DO_SPACES_REGION, DO_SPACES_BUCKET, DO_SPACES_KEY and DO_SPACES_SECRET are required");
  }
  if (!/^[a-z0-9-]+$/.test(region)) throw new Error("DO_SPACES_REGION is invalid");
  return { bucket, endpoint: `https://${region}.digitaloceanspaces.com`, accessKeyId, secretAccessKey };
}

export function createKbS3Client(settings: KbS3Settings): S3Client {
  const config: S3ClientConfig = {
    region: "us-east-1",
    endpoint: settings.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  };
  return new S3Client(config);
}

export function kbS3FromEnvironment(): { client: S3Client; bucket: string } {
  const settings = kbS3Settings();
  return { client: createKbS3Client(settings), bucket: settings.bucket };
}
