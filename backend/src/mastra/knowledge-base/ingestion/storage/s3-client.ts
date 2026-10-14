import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

export interface KbS3Settings {
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export function kbS3Settings(env: NodeJS.ProcessEnv = process.env): KbS3Settings {
  const region = env.AWS_REGION?.trim();
  const bucket = env.KB_S3_BUCKET?.trim();
  if (!region || !bucket) throw new Error("AWS_REGION and KB_S3_BUCKET are required");
  const endpoint = env.KB_S3_ENDPOINT?.trim();
  if (endpoint) {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("KB_S3_ENDPOINT must be an HTTP(S) origin without credentials or query parameters");
    }
    if (env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("KB_S3_ENDPOINT must use HTTPS in production");
    }
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error("Custom S3 endpoints require AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    }
  }
  const style = env.KB_S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  if (style && style !== "true" && style !== "false") {
    throw new Error("KB_S3_FORCE_PATH_STYLE must be true or false");
  }
  return { region, bucket, ...(endpoint ? { endpoint } : {}),
    ...(style ? { forcePathStyle: style === "true" } : {}) };
}

export function createKbS3Client(settings: KbS3Settings): S3Client {
  const config: S3ClientConfig = { region: settings.region };
  if (settings.endpoint) config.endpoint = settings.endpoint;
  if (settings.forcePathStyle !== undefined) config.forcePathStyle = settings.forcePathStyle;
  return new S3Client(config);
}

export function kbS3FromEnvironment(): { client: S3Client; bucket: string } {
  const settings = kbS3Settings();
  return { client: createKbS3Client(settings), bucket: settings.bucket };
}
